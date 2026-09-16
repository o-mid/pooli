import { describe, expect, it } from 'vitest';
import { InMemoryProposalStore } from '../domain/store.js';
import { ActionRegistry } from '../domain/registry.js';
import { TEST_MESSAGE } from '../domain/test-fixture.js';
import { createMcpServer } from './server.js';
import {
  CHECK_PROPOSAL_DESCRIPTION,
  GET_SNAPSHOT_DESCRIPTION,
  PROPOSE_MESSAGE_DESCRIPTION,
} from './tools.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const GOOD = {
  orderId: TEST_MESSAGE.orderId,
  orderSlug: TEST_MESSAGE.orderSlug,
  body: TEST_MESSAGE.body,
  locale: 'en' as const,
  paymentStatus: TEST_MESSAGE.paymentStatus,
};

async function connect(principal?: string) {
  const store = new InMemoryProposalStore();
  const registry = new ActionRegistry(store, { ttlSeconds: 300 });
  const delivered: { proposalId: string; linkCode: string }[] = [];

  const server = createMcpServer({
    registry,
    principal,
    deliverLinkCode: ({ proposalId, linkCode }) => void delivered.push({ proposalId, linkCode }),
    confirmationBaseUrl: 'https://gateway.example',
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, registry, delivered, store };
}

const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const r = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  return { text: r.content.map((c) => c.text).join('\n'), isError: r.isError === true };
};

describe('the surface the agent can reach', () => {
  it('exposes exactly three tools, none of which send buyer messages', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['check_proposal_status', 'get_order_snapshot', 'propose_buyer_message']);
  });

  it('ships refusals inside tool descriptions', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'get_order_snapshot')?.description).toBe(GET_SNAPSHOT_DESCRIPTION);
    expect(tools.find((t) => t.name === 'propose_buyer_message')?.description).toBe(
      PROPOSE_MESSAGE_DESCRIPTION,
    );
    expect(tools.find((t) => t.name === 'check_proposal_status')?.description).toBe(
      CHECK_PROPOSAL_DESCRIPTION,
    );
    expect(PROPOSE_MESSAGE_DESCRIPTION).toContain('never sends');
  });

  it('proposes without sending anything', async () => {
    const { client, store } = await connect();
    const { text, isError } = await call(client, 'propose_buyer_message', GOOD);
    expect(isError).toBe(false);
    expect(text).toContain('NOTHING HAS BEEN SENT YET');
    const id = /Proposal ID: (\S+)/.exec(text)![1]!;
    expect((await store.get(id))!.state).toBe('pending_confirmation');
  });

  it('NEVER returns the link code to the agent', async () => {
    const { client, delivered } = await connect();
    const { text } = await call(client, 'propose_buyer_message', GOOD);
    expect(delivered).toHaveLength(1);
    const code = delivered[0]!.linkCode;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(text).not.toContain(code);
  });

  it('collapses an identical repeat onto one proposal', async () => {
    const { client, store } = await connect();
    const a = await call(client, 'propose_buyer_message', GOOD);
    const b = await call(client, 'propose_buyer_message', GOOD);
    const idA = /Proposal ID: (\S+)/.exec(a.text)![1]!;
    const idB = /Proposal ID: (\S+)/.exec(b.text)![1]!;
    expect(idB).toBe(idA);
    expect(b.text).toMatch(/already proposed/i);
    expect((await store.get(idA))!.state).toBe('pending_confirmation');
  });

  it('does NOT collapse two different OAuth principals onto one proposal', async () => {
    const store = new InMemoryProposalStore();
    const registry = new ActionRegistry(store, { ttlSeconds: 300 });
    const ids: string[] = [];
    for (const principal of ['client-alice', 'client-bob']) {
      const server = createMcpServer({
        registry,
        principal,
        deliverLinkCode: () => {},
        confirmationBaseUrl: 'https://gateway.example',
      });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      const c = new Client({ name: 't', version: '1' });
      await Promise.all([c.connect(ct), server.connect(st)]);
      const r = await call(c, 'propose_buyer_message', GOOD);
      ids.push(/Proposal ID: (\S+)/.exec(r.text)![1]!);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('status checks', () => {
  it('reports pending state without leaking the code', async () => {
    const { client, delivered } = await connect();
    const p = await call(client, 'propose_buyer_message', GOOD);
    const id = /Proposal ID: (\S+)/.exec(p.text)![1]!;

    const { text } = await call(client, 'check_proposal_status', { proposalId: id });
    expect(text).toContain('pending_confirmation');
    expect(text).not.toContain(delivered[0]!.linkCode);
  });

  it('will not confirm whether an unknown proposal id is real', async () => {
    const { client } = await connect();
    const a = await call(client, 'check_proposal_status', { proposalId: 'prop_does-not-exist' });
    const b = await call(client, 'check_proposal_status', { proposalId: 'garbage' });
    expect(a.text).toBe(b.text);
    expect(a.isError).toBe(true);
  });
});
