import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { pctOf } from "../projects/siteMoney";
import { SENT } from "./boqRules";
import type { Boq } from "./boqsApi";

const cents = (n: number) => money.exact(n, "USD", { cents: true });

/**
 * What the API worked out when the BOQ was last saved: the subtotal, the adjustment, the total and, for what the
 * client receives, supervision, TVA and what the client pays. None of it is worked out here, so while there are
 * unsaved changes it says whose figures these are.
 */
export function BoqTotals({ boq, stale }: { boq: Boq; stale: boolean }) {
    const adjusted = boq.adjustmentType !== "none";
    return (
        <div className="mt">
            <div className="xm-owed" role="group" aria-label="Totals">
                <div><span>Subtotal</span><b className="mono">{cents(boq.subtotalUsd)}</b><em>{boq.lines.length === 1 ? "1 line" : `${boq.lines.length} lines`}, as last saved</em></div>
                {adjusted && (
                    <div>
                        <span>Adjustment</span><b className="mono">{cents(boq.adjustmentUsd)}</b>
                        <em>{boq.adjustmentType === "percent" ? `${pctOf(boq.adjustmentValue ?? 0)} of the subtotal` : "to the new total"}</em>
                    </div>
                )}
                <div><span>Total</span><b className="mono">{cents(boq.totalUsd)}</b><em>the work this {boq.kind === "vo" ? "VO adds" : "BOQ prices"}</em></div>
                {boq.kind !== "internal" && (
                    <>
                        <div><span>Supervision</span><b className="mono">{cents(boq.supervisionUsd)}</b><em>{pctOf(boq.supervisionRate)} of the total</em></div>
                        <div><span>TVA</span><b className="mono">{cents(boq.tvaUsd)}</b><em>{pctOf(boq.tvaRate)} of the total, never on supervision</em></div>
                        <div><span>Client pays</span><b className="mono">{cents(boq.clientTotalUsd)}</b><em>total + supervision + TVA</em></div>
                    </>
                )}
            </div>
            {stale && <div className="hint mt-s">These are the figures of the last save. They are worked out again when you save.</div>}
        </div>
    );
}

/** Each time it was sent, with the total it carried that day (a BOQ stays editable after it is sent). */
export function BoqDeliveries({ boq }: { boq: Boq }) {
    if (boq.deliveries.length === 0) return null;
    return (
        <div className="mt">
            <div className="u" style={{ marginBottom: 6 }}>Sent</div>
            <ol className="pay-hist" aria-label="Deliveries">
                {boq.deliveries.map((d) => (
                    <li key={d.id} className="pay-hist-row">
                        <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                            <b>{SENT[d.channel][0].toUpperCase() + SENT[d.channel].slice(1)}{d.recipient ? ` to ${d.recipient}` : ""}</b>
                            <span className="muted" style={{ fontSize: 12 }}>{fmtDateY(d.sentAt)}{d.sentBy ? ` · ${d.sentBy.name}` : ""}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>It said {cents(d.totalUsd)}{d.note ? ` · ${d.note}` : ""}</div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
