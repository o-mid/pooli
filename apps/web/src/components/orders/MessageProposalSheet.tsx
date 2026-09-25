"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/LocaleProvider";
import {
  confirmProposal,
  digestMessageDraftPayload,
  proposalConfirmPageUrl,
  rejectProposal,
  type ProposalView,
} from "@/lib/action-gateway";

function paymentStatusLabel(status: string, t: ReturnType<typeof useT>): string {
  const key = status as keyof typeof t.orders.status;
  return t.orders.status[key] ?? status;
}

export function MessageProposalSheet({
  open,
  proposal,
  orderTitle,
  orderAmountToman,
  tomanLabel,
  onClose,
  onResolved,
}: {
  open: boolean;
  proposal: ProposalView | null;
  orderTitle: string;
  orderAmountToman: number;
  tomanLabel: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const t = useT();
  const { showToast } = useToast();
  const [draftBody, setDraftBody] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [digestOk, setDigestOk] = useState(true);

  useEffect(() => {
    if (!proposal) return;
    setDraftBody(proposal.body);
    setLinkCode("");
    setDigestOk(true);
  }, [proposal]);

  useEffect(() => {
    if (!proposal || !open) return;
    let cancelled = false;
    void (async () => {
      const digest = await digestMessageDraftPayload({
        orderId: proposal.orderId,
        orderSlug: proposal.orderSlug,
        body: draftBody,
        locale: proposal.locale,
        paymentStatus: proposal.paymentStatus,
      });
      if (!cancelled) setDigestOk(digest === proposal.payloadDigest);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftBody, open, proposal]);

  const confirmUrl = useMemo(
    () => (proposal ? proposalConfirmPageUrl(proposal.id) : ""),
    [proposal],
  );

  const terminal = proposal != null && proposal.state !== "pending_confirmation";
  const canApprove =
    proposal != null &&
    proposal.state === "pending_confirmation" &&
    digestOk &&
    linkCode.trim().length >= 6 &&
    !busy;

  async function onReject() {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      await rejectProposal(proposal.id);
      showToast(t.proposals.rejectedToast);
      onResolved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function onApprove(e: FormEvent) {
    e.preventDefault();
    if (!proposal || !canApprove) return;
    setBusy(true);
    try {
      await confirmProposal(proposal.id, linkCode, proposal.payloadDigest);
      showToast(t.proposals.approvedToast);
      onResolved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  if (!proposal) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.proposals.sheetTitle}
      labelledBy="message-proposal-sheet-title"
    >
      <p className="muted" style={{ margin: "0 0 var(--space-3)" }}>
        {t.proposals.sheetHint}
      </p>

      <dl className="proposal-facts">
        <div>
          <dt>{t.proposals.factOrder}</dt>
          <dd>{orderTitle || proposal.orderSlug}</dd>
        </div>
        <div>
          <dt>{t.proposals.factAmount}</dt>
          <dd>{`${orderAmountToman.toLocaleString()} ${tomanLabel}`}</dd>
        </div>
        <div>
          <dt>{t.proposals.factPayment}</dt>
          <dd>
            <span className="status-badge attention">{paymentStatusLabel(proposal.paymentStatus, t)}</span>
          </dd>
        </div>
        <div>
          <dt>{t.proposals.factReference}</dt>
          <dd className="mono-ltr">{proposal.orderSlug}</dd>
        </div>
      </dl>

      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="proposal-draft">{t.proposals.draftLabel}</label>
        <textarea
          id="proposal-draft"
          rows={6}
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
          disabled={terminal || busy}
          readOnly={terminal}
        />
        {!digestOk && !terminal ? (
          <p className="muted" role="alert" style={{ marginTop: "var(--space-2)" }}>
            {t.proposals.editedWarning}{" "}
            <button
              type="button"
              className="quiet-link"
              style={{ background: "none", border: 0, padding: 0 }}
              onClick={() => setDraftBody(proposal.body)}
            >
              {t.proposals.resetDraft}
            </button>
          </p>
        ) : null}
      </div>

      {proposal.state === "pending_confirmation" ? (
        <form onSubmit={onApprove}>
          <div className="field">
            <label htmlFor="proposal-link-code">{t.proposals.linkCode}</label>
            <input
              id="proposal-link-code"
              className="mono-ltr"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="ABC234"
              disabled={busy}
            />
            <p className="muted" style={{ marginTop: "var(--space-2)", fontSize: "var(--text-footnote)" }}>
              {t.proposals.linkCodeHint}
            </p>
          </div>
          <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn btn-primary" type="submit" disabled={!canApprove}>
              {busy ? t.common.loading : t.proposals.approve}
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onReject()}>
              {t.proposals.reject}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted" style={{ marginTop: "var(--space-3)" }}>
          {proposal.state === "rejected" ? t.proposals.rejectedToast : t.proposals.approvedToast}
        </p>
      )}

      {confirmUrl ? (
        <p style={{ marginTop: "var(--space-4)" }}>
          <a href={confirmUrl} className="quiet-link" target="_blank" rel="noopener noreferrer">
            {t.proposals.openConfirmPage}
          </a>
        </p>
      ) : null}
    </Sheet>
  );
}
