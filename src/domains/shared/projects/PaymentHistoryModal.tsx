import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useQuotes } from "../billing/quoteApi";
import { usePaymentChanges, type PaymentChange } from "./paymentApi";
import type { Project } from "./projectsApi";

const pct = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;

/** Every change of a project's agreed payment, newest first, with why it changed and who changed it. */
export default function PaymentHistoryModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const changes = usePaymentChanges(project.id, true);
    const site = project.domain === "execution";
    const sendsQuotes = usePermissions().has(P.INVOICE_SEND);
    // an Execution site has no quotes
    const quotes = useQuotes(project.id, !site && sendsQuotes && project.billingType === "client").data ?? [];

    return (
        <Modal title="Payment history" sub={project.title} onClose={onClose}
            foot={<button className="btn" onClick={onClose}>Close</button>}>
            {changes.data ? (
                changes.data.length === 0 ? <div className="muted">No change recorded yet.</div> : (
                    <ol className="pay-hist" aria-label="Payment changes">
                        {changes.data.map((c) => <ChangeRow key={c.id} change={c} site={site} />)}
                    </ol>
                )
            ) : loadFailed(changes) ? <LoadError error={changes.error} retry={() => changes.refetch()} what="the payment history" />
                : <SkeletonLines lines={4} />}
            {quotes.length > 0 && (
                <>
                    <div className="u mt" style={{ marginBottom: 6 }}>Quotes sent</div>
                    <ol className="pay-hist" aria-label="Quotes">
                        {quotes.map((q) => (
                            <li key={q.id} className="pay-hist-row">
                                <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                                    <b className="mono">{q.number} · {money.exact(q.totalUsd)}</b>
                                    <span className="muted" style={{ fontSize: 12 }}>{fmtDateY(q.createdAt)} · {q.createdBy.name}</span>
                                </div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                    {q.deliveries.length ? `Sent ${q.deliveries.length === 1 ? "once" : `${q.deliveries.length} times`}` : "Not sent"} · {money.exact(q.netUsd)} + TVA {pct(q.tvaRate)}
                                </div>
                            </li>
                        ))}
                    </ol>
                </>
            )}
        </Modal>
    );
}

function ChangeRow({ change: c, site }: { change: PaymentChange; site: boolean }) {
    const markupChanged = site && c.materialMarkup != null && c.previousMaterialMarkup != null && c.materialMarkup !== c.previousMaterialMarkup;
    return (
        <li className="pay-hist-row">
            <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                <b className="mono">
                    {c.previousAmount == null || c.previousAmount === c.amount ? money.exact(c.amount) : <>{money.exact(c.previousAmount)} → {money.exact(c.amount)}</>}
                </b>
                <span className="muted" style={{ fontSize: 12 }}>{fmtDateY(c.changedAt)}{c.changedBy ? ` · ${c.changedBy.name}` : ""}</span>
            </div>
            {site && c.materialMarkup != null && (
                <div className="muted" style={{ fontSize: 12 }}>
                    Material profit {markupChanged ? <>{pct(c.previousMaterialMarkup!)} → {pct(c.materialMarkup)}</> : pct(c.materialMarkup)}
                </div>
            )}
            {c.tvaRate != null && (
                <div className="muted" style={{ fontSize: 12 }}>
                    TVA {c.previousTvaRate != null && c.previousTvaRate !== c.tvaRate ? <>{pct(c.previousTvaRate)} → {pct(c.tvaRate)}</> : pct(c.tvaRate)}
                </div>
            )}
            <div style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>{c.description}</div>
        </li>
    );
}
