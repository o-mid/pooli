/**
 * Self-hosted OAuth 2.1 authorization server + resource server metadata.
 *
 * WHY THIS EXISTS, AND WHY IT HAS NO LOGIN PAGE
 * ---------------------------------------------
 * AIFindr's MCP config form offers no custom-header field and refuses to
 * ENABLE a server until an OAuth connection completes. Static bearer auth is
 * therefore impossible, and a path secret does not rescue it: the URL would
 * accept traffic but the server could never be enabled, and the agent only
 * sees enabled servers.
 *
 * The obvious next move, delegate to a real IdP (Auth0/Okta), was also
 * rejected, because there is NO HUMAN TO AUTHENTICATE. This OAuth connection
 * is machine-to-machine between AIFindr and us, established once at config
 * time by the operator clicking "connect". Nobody logs in. A login page would
 * add an external dependency that can fail during the demo in exchange for
 * authenticating a user who does not exist.
 *
 * So /authorize auto-approves. That is not a shortcut around a security
 * control; it is the honest encoding of the trust model. The security that
 * matters here is downstream: the token is audience-bound, scope-checked, and
 * short-lived, and. Critically. It proves only that AIFINDR is calling. It
 * says nothing about WHO IS CHATTING. That gap is exactly the confused-deputy
 * problem, and it is why the per-user link code (D05) survives this change.
 *
 * DCR is implemented on purpose. AIFindr's form says the auxiliary-client
 * fields are "only needed when the MCP server does not support dynamic client
 * registration". We control this server, so we offer DCR and those fields stay
 * empty, no manual client provisioning, no email round-trip, no waiting.
 *
 * Spike-grade storage: in-memory Maps. Registrations and codes die on restart;
 * the signing key is persisted so issued tokens survive one.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import {
  SignJWT,
  jwtVerify,
  exportJWK,
  importJWK,
  generateKeyPair,
} from 'jose';

/**
 * OAuth state lives on a configurable directory so it can be mounted on a
 * persistent volume in production.
 *
 * This is what makes "reconnect once" achievable. The signing key, the
 * registered clients and the refresh tokens all survive redeploys, so
 * replacing this spike with the real gateway at the same host does NOT
 * invalidate AIFindr's stored configuration. Without it, every deploy would
 * mint a new key, invalidate every issued token, and cost another manual
 * connect.
 */
const STATE_DIR = process.env.OAUTH_STATE_DIR
  ? process.env.OAUTH_STATE_DIR.replace(/\/$/, '')
  : fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

const KEYFILE = `${STATE_DIR}/oauth-key.json`;
const CLIENTFILE = `${STATE_DIR}/oauth-clients.json`;
const REFRESHFILE = `${STATE_DIR}/oauth-refresh.json`;
const ALG = 'RS256';
const REQUIRED_SCOPE = process.env.MCP_SCOPE || 'transfer:propose';
const TOKEN_TTL_SECONDS = 3600;
const CODE_TTL_MS = 60_000;

/** Persisted so a server restart does not invalidate AIFindr's live token. */
async function loadOrCreateKey() {
  if (existsSync(KEYFILE)) {
    const saved = JSON.parse(readFileSync(KEYFILE, 'utf8'));
    return {
      privateKey: await importJWK(saved.privateJwk, ALG),
      publicJwk: saved.publicJwk,
      kid: saved.kid,
    };
  }
  const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
  const kid = randomUUID();
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: ALG, use: 'sig' };
  writeFileSync(KEYFILE, JSON.stringify({ privateJwk, publicJwk, kid }, null, 2), { mode: 0o600 });
  return { privateKey, publicJwk, kid };
}

/**
 * The tunnel hostname changes every time the quick tunnel restarts, so the
 * issuer is derived per-request from the forwarded Host rather than pinned to
 * an env var. One less thing to reconfigure mid-demo.
 */
function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  // req.protocol honours x-forwarded-proto when `trust proxy` is set (behind
  // the tunnel) and reports the real scheme locally. Hardcoding https here
  // makes the metadata unusable over plain http in local tests.
  const proto = req.headers['x-forwarded-proto']?.split(',')[0] || req.protocol || 'http';
  return `${proto}://${req.headers.host}`;
}

export async function installOAuth(app, { mcpPath = '/mcp' } = {}) {
  const { privateKey, publicJwk, kid } = await loadOrCreateKey();

  // Registrations are persisted; codes are not.
  //
  // AIFindr stores the client_id it receives from /register and reuses it on
  // every subsequent connect. Holding registrations only in memory meant any
  // server restart silently invalidated that stored id, and the next
  // /authorize would answer invalid_client, a failure that looks identical
  // to a misconfiguration and would have cost real debugging time mid-demo.
  // Codes stay in memory on purpose: they live 60s and must not survive
  // anything.
  const clients = new Map(Object.entries(
    existsSync(CLIENTFILE) ? JSON.parse(readFileSync(CLIENTFILE, 'utf8')) : {},
  ));
  const persistClients = () =>
    writeFileSync(CLIENTFILE, JSON.stringify(Object.fromEntries(clients), null, 2), { mode: 0o600 });

  const codes = new Map(); // code -> { client_id, redirect_uri, challenge, resource, expires }

  // Refresh tokens are persisted for the same reason registrations are: the
  // access token lives one hour, and a restart inside that hour must not force
  // a human back through the connect flow.
  const refresh = new Map(Object.entries(
    existsSync(REFRESHFILE) ? JSON.parse(readFileSync(REFRESHFILE, 'utf8')) : {},
  ));
  const persistRefresh = () =>
    writeFileSync(REFRESHFILE, JSON.stringify(Object.fromEntries(refresh), null, 2), { mode: 0o600 });

  /** Mint an access token, and a rotated refresh token to go with it. */
  const issue = async (req, clientId, audience) => {
    const access = await new SignJWT({ scope: REQUIRED_SCOPE, client_id: clientId })
      .setProtectedHeader({ alg: ALG, kid })
      .setIssuer(baseUrl(req))
      .setAudience(audience)
      .setSubject(clientId)
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
      .sign(privateKey);
    const rt = randomBytes(32).toString('base64url');
    refresh.set(rt, { client_id: clientId, audience, issued: Date.now() });
    persistRefresh();
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
      refresh_token: rt,
      scope: REQUIRED_SCOPE,
    };
  };

  const resourceUrl = (req) => `${baseUrl(req)}${mcpPath}`;

  // ---- RFC 9728: protected resource metadata --------------------------------
  // Served at both the bare path and the path-suffixed form, because clients
  // differ on which they probe and we cannot see AIFindr's implementation.
  const prm = (req, res) =>
    res.json({
      resource: resourceUrl(req),
      authorization_servers: [baseUrl(req)],
      scopes_supported: [REQUIRED_SCOPE],
      bearer_methods_supported: ['header'],
    });
  app.get('/.well-known/oauth-protected-resource', prm);
  app.get(`/.well-known/oauth-protected-resource${mcpPath}`, prm);

  // ---- RFC 8414: authorization server metadata ------------------------------
  const asm = (req, res) =>
    res.json({
      issuer: baseUrl(req),
      authorization_endpoint: `${baseUrl(req)}/authorize`,
      token_endpoint: `${baseUrl(req)}/token`,
      registration_endpoint: `${baseUrl(req)}/register`,
      jwks_uri: `${baseUrl(req)}/.well-known/jwks.json`,
      scopes_supported: [REQUIRED_SCOPE],
      response_types_supported: ['code'],
      // refresh_token advertised so the connection can outlive the 1h access
      // token without a human re-running the connect flow.
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], // OAuth 2.1: PKCE mandatory
      // Advertise exactly what /token accepts, previously this claimed
      // client_secret_post while the handler ignored credentials entirely.
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    });
  app.get('/.well-known/oauth-authorization-server', asm);
  app.get(`/.well-known/oauth-authorization-server${mcpPath}`, asm);

  app.get('/.well-known/jwks.json', (_req, res) => res.json({ keys: [publicJwk] }));

  // ---- RFC 7591: dynamic client registration --------------------------------
  app.post('/register', (req, res) => {
    const body = req.body || {};
    const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (redirect_uris.length === 0) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris required' });
    }
    const client_id = `mcp_${randomBytes(16).toString('hex')}`;
    const reg = {
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris,
      client_name: body.client_name || 'unknown',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      // No secret is issued: this is a public client secured by PKCE. If the
      // client sends one at /token anyway it is accepted and ignored rather
      // than rejected. A surplus credential is not a reason to fail a flow
      // whose security rests on the code_verifier.
      token_endpoint_auth_method: 'none',
      scope: REQUIRED_SCOPE,
    };
    clients.set(client_id, reg);
    persistClients();
    req.app.locals.record?.('oauth_register', {
      client_id,
      client_name: reg.client_name,
      redirect_uris,
      requestedAuthMethod: body.token_endpoint_auth_method ?? null,
    });
    res.status(201).json(reg);
  });

  // ---- /authorize: auto-approve. See header comment. ------------------------
  app.get('/authorize', (req, res) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, resource, scope } = req.query;
    const rec = req.app.locals.record;
    const fail = (error, why, extra = {}) => {
      rec?.('oauth_authorize_failed', { check: why, error, client_id: client_id ?? null, ...extra });
      return res.status(400).json({ error, error_description: why });
    };

    const client = clients.get(client_id);
    if (!client) return fail('invalid_client', 'client_id not registered', { known: clients.size });
    if (!client.redirect_uris.includes(redirect_uri)) {
      // Exact match only: a loose redirect_uri check is how auth servers leak codes.
      return fail('invalid_redirect_uri', 'redirect_uri not among those registered', {
        registered: client.redirect_uris,
      });
    }
    if (!code_challenge || code_challenge_method !== 'S256') {
      return fail('invalid_request', 'PKCE S256 required', { method: code_challenge_method ?? null });
    }
    const code = randomBytes(32).toString('base64url');
    codes.set(code, {
      client_id,
      redirect_uri,
      challenge: code_challenge,
      resource: resource || resourceUrl(req),
      expires: Date.now() + CODE_TTL_MS,
    });
    req.app.locals.record?.('oauth_authorize', { client_id, scope: scope ?? null, resource: resource ?? null, state: Boolean(state) });
    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    res.redirect(302, url.toString());
  });

  // ---- /token: authorization_code + PKCE verification -----------------------
  //
  // Permissive at the edges, strict on the security properties. Interop
  // details, body encoding, client-auth style, how `resource` is spelled --
  // are accepted in every form the specs allow, because rejecting on those
  // yields a generic "token exchange failed" at the client with no way to tell
  // which one bit. The properties that actually carry the security --
  // mandatory PKCE S256, single-use codes, exact redirect_uri, audience
  // binding, do not bend.
  app.post('/token', async (req, res) => {
    const rec = req.app.locals.record;

    // Every rejection says which check failed, on our side, in the log. A
    // silent failure path is what made the first connect attempt unguessable.
    const fail = (status, error, why, extra = {}) => {
      rec?.('oauth_token_failed', { check: why, error, status, ...extra });
      return res.status(status).json({ error, error_description: why });
    };

    const b = { ...(req.body || {}), ...(req.query || {}) };

    // RFC 6749 §2.3.1: credentials may arrive as Basic auth instead of body
    // fields. Not previously handled, and not previously advertised.
    let basicId = null;
    const authz = req.headers.authorization || '';
    if (authz.toLowerCase().startsWith('basic ')) {
      try {
        const [id, secret] = Buffer.from(authz.slice(6).trim(), 'base64').toString('utf8').split(':');
        basicId = decodeURIComponent(id || '');
        if (!b.client_id) b.client_id = basicId;
        if (!b.client_secret && secret) b.client_secret = decodeURIComponent(secret);
      } catch { /* malformed Basic header: fall through to the missing-field checks */ }
    }

    rec?.('oauth_token_request', {
      contentType: req.headers['content-type'] ?? null,
      bodyParsed: Object.keys(req.body || {}).length > 0,
      fields: Object.keys(b).sort(),
      clientAuth: basicId ? 'client_secret_basic' : b.client_secret ? 'client_secret_post' : 'none',
      grant_type: b.grant_type ?? null,
      resource: b.resource ?? null,
      redirect_uri: b.redirect_uri ?? null,
      hasCodeVerifier: Boolean(b.code_verifier),
      codeVerifierLen: b.code_verifier ? String(b.code_verifier).length : 0,
    });

    // ---- refresh_token grant ----
    if (b.grant_type === 'refresh_token') {
      const entry = refresh.get(String(b.refresh_token || ''));
      if (!entry) return fail(400, 'invalid_grant', 'refresh_token unknown or already rotated');
      // Rotation: the presented token is burned as it is exchanged, so a stolen
      // refresh token is single-use and its reuse is detectable as a failure.
      refresh.delete(String(b.refresh_token));
      if (b.client_id && entry.client_id !== b.client_id) {
        return fail(400, 'invalid_grant', 'refresh_token does not belong to this client');
      }
      const out = await issue(req, entry.client_id, resourceUrl(req));
      rec?.('oauth_refresh', { client_id: entry.client_id, audience: resourceUrl(req) });
      res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache');
      return res.json(out);
    }

    if (b.grant_type !== 'authorization_code') {
      return fail(400, 'unsupported_grant_type', `grant_type was ${JSON.stringify(b.grant_type ?? null)}`, {
        hint: Object.keys(req.body || {}).length === 0 ? 'request body parsed empty -- check Content-Type handling' : undefined,
      });
    }
    if (!b.code) return fail(400, 'invalid_request', 'no code in request');

    const entry = codes.get(b.code);
    if (!entry) return fail(400, 'invalid_grant', 'code unknown or already redeemed');
    codes.delete(b.code); // single use, always -- before any other check can bail

    if (Date.now() > entry.expires) return fail(400, 'invalid_grant', 'code expired');
    if (b.client_id && entry.client_id !== b.client_id) {
      return fail(400, 'invalid_grant', 'client_id does not match the one that requested the code');
    }
    // Exact match, per RFC 6749 §4.1.3. Loose comparison here is how codes leak.
    if (entry.redirect_uri !== b.redirect_uri) {
      return fail(400, 'invalid_grant', 'redirect_uri differs from the authorize request', {
        authorizeLen: entry.redirect_uri.length,
        tokenLen: String(b.redirect_uri ?? '').length,
      });
    }

    // PKCE stays mandatory. This is the check that makes a public client safe.
    const verifier = String(b.code_verifier || '');
    if (!verifier) return fail(400, 'invalid_grant', 'code_verifier missing (PKCE is required)');
    const computed = createHash('sha256').update(verifier).digest('base64url');
    if (computed !== entry.challenge) {
      return fail(400, 'invalid_grant', 'PKCE verification failed', {
        challengeLen: entry.challenge.length,
        computedLen: computed.length,
      });
    }

    // `resource` (RFC 8707) is accepted as the bare origin or the full MCP URL,
    // and may be omitted, clients disagree on all three. The audience we MINT
    // is always canonical, so tolerating the spelling costs nothing: the token
    // is still bound to exactly one resource and still fails elsewhere.
    const canonical = resourceUrl(req);
    const requested = b.resource || entry.resource;
    if (requested) {
      const norm = String(requested).replace(/\/+$/, '');
      const accepted = [canonical, baseUrl(req)]; // full MCP URL or bare origin
      if (!accepted.includes(norm)) {
        return fail(400, 'invalid_target', `resource "${norm}" is not this server`, { accepted });
      }
    }

    const out = await issue(req, entry.client_id, canonical);
    rec?.('oauth_token', { client_id: entry.client_id, audience: canonical, resourceSent: b.resource ?? null });
    // No-store is required for token responses (RFC 6749 §5.1).
    res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache');
    res.json(out);
  });

  /**
   * Bearer middleware for the MCP path. Enforces signature, issuer, audience
   * and scope. The 401 carries a WWW-Authenticate header naming the resource
   * metadata document. That is what lets an MCP client discover where to
   * authenticate instead of simply failing.
   */
  async function requireToken(req, res, next) {
    const challenge = `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource${mcpPath}"`;
    const auth = req.headers.authorization || '';
    if (!auth.toLowerCase().startsWith('bearer ')) {
      res.set('WWW-Authenticate', challenge);
      return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required' });
    }
    try {
      const { payload } = await jwtVerify(auth.slice(7).trim(), await importJWK(publicJwk, ALG), {
        issuer: baseUrl(req),
        audience: resourceUrl(req),
      });
      const scopes = String(payload.scope || '').split(/\s+/).filter(Boolean);
      if (!scopes.includes(REQUIRED_SCOPE)) {
        res.set('WWW-Authenticate', `${challenge}, error="insufficient_scope", scope="${REQUIRED_SCOPE}"`);
        return res.status(403).json({ error: 'insufficient_scope', required: REQUIRED_SCOPE });
      }
      req.auth = { clientId: payload.client_id, scopes, aud: payload.aud };
      next();
    } catch (e) {
      res.set('WWW-Authenticate', `${challenge}, error="invalid_token"`);
      return res.status(401).json({ error: 'invalid_token', error_description: e.message });
    }
  }

  return { requireToken, REQUIRED_SCOPE };
}
