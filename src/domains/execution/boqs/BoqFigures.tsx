import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { pctOf } from "../projects/siteMoney";
import { clientFiguresOf, lineUsed, totalsOf, type Draft } from "./boqDraft";
import { SENT } from "./boqRules";
import type { Boq } from "./boqsApi";

const cents = (n: number) => money.exact(n, "USD", { cents: true });

/**
 * The figures of the BOQ as it is typed, worked out as the API does: the work's subtotal, adjustment and total, its
 * permits and, for what the client receives, supervision and TVA (on the work only) and what the client pays. Those
 * last three only for whoever sees the site's pricing (the API sends its rates to them alone), never on an internal draft.
 */
export function BoqTotals({ boq, draft }: { boq: Boq; draft: Draft }) {
    const totals = totalsOf(draft);
    const used = draft.lines.filter(lineUsed);
    const adjusted = draft.adjustment !== "none";
    const { supervisionRate, tvaRate } = boq;
    const client = boq.kind !== "internal" && supervisionRate != null && tvaRate != null ? clientFiguresOf(totals, supervisionRate, tvaRate) : null;
    const workLines = used.filter((l) => l.nature === "work").length;
    const hasPermits = used.some((l) => l.nature === "permit");
    const permits = hasPermits && (
        <div><span>Permits</span><b className="mono">{cents(totals.permits)}</b><em>no supervision or TVA on them</em></div>
    );
    return (
        <div className="mt">
            <div className="xm-owed" role="group" aria-label="Totals">
                <div><span>{hasPermits ? "Work subtotal" : "Subtotal"}</span><b className="mono">{cents(totals.subtotal)}</b><em>{workLines === 1 ? "1 line" : `${workLines} lines`}</em></div>
                {adjusted && (
                    <div>
                        <span>Adjustment</span><b className="mono">{cents(totals.adjustment)}</b>
                        <em>{draft.adjustment === "percent" ? `${draft.adjustmentValue.trim() || "0"}% of the subtotal` : "to the new total"}</em>
                    </div>
                )}
                <div><span>{hasPermits ? "Work total" : "Total"}</span><b className="mono">{cents(totals.total)}</b><em>the work this {boq.kind === "vo" ? "VO adds" : "BOQ prices"}</em></div>
                {client && supervisionRate != null && tvaRate != null ? (
                    <>
                        <div><span>Supervision</span><b className="mono">{cents(client.supervision)}</b><em>{pctOf(supervisionRate)} of the work</em></div>
                        <div><span>TVA</span><b className="mono">{cents(client.tva)}</b><em>{pctOf(tvaRate)} of the work, never on supervision{hasPermits ? " or permits" : ""}</em></div>
                        {permits}
                        <div><span>Client pays</span><b className="mono">{cents(client.clientTotal)}</b><em>work + supervision + TVA{hasPermits ? " + permits" : ""}</em></div>
                    </>
                ) : permits}
            </div>
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
