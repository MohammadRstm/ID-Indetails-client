import type { ReactNode } from "react";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";

type PaymentSectionProps = {
    /** "Customer payment" or "Project fee". */
    label: string;
    /** Null for internal work, which has no payment. */
    amount: number | null;
    /** The project's TVA rate (0.15 = 15%), and the payment with it, as the API works it out. */
    tva?: { rate: number; withTva: number };
    sub?: ReactNode;
    locked?: boolean;
    /** Left out when the viewer may not change it. */
    onEdit?: () => void;
    onHistory?: () => void;
    /** What to offer instead when there is no payment (internal work). */
    empty?: ReactNode;
};

/**
 * A project's agreed payment, first on its Financials tab: the amount in bold, the pencil that changes it (with why)
 * and the history of its changes.
 */
export default function PaymentSection({ label, amount, tva, sub, locked, onEdit, onHistory, empty }: PaymentSectionProps) {
    return (
        <section className="panel pay-section" aria-label={label}>
            <div className="panel-body row" style={{ gap: 16, alignItems: "center" }}>
                <div className="grow">
                    <div className="u">{label}</div>
                    {amount == null ? <div className="muted" style={{ marginTop: 4 }}>{empty}</div> : (
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <b className="mono pay-amount">{money.exact(amount)}</b>
                            {tva && (
                                <span className="pay-tva" aria-label="With TVA">
                                    <span className="muted">+ TVA {money.pct(tva.rate)}</span>
                                    <span className="muted">=</span>
                                    <b className="mono">{money.exact(tva.withTva)}</b>
                                </span>
                            )}
                            {locked ? <span className="locked-field"><Icon name="lock" style={{ width: 12, height: 12 }} />locked</span>
                                : onEdit && (
                                    <button className="icon-btn" aria-label={`Edit ${label.toLowerCase()}`} title={`Change the ${label.toLowerCase()}`} onClick={onEdit}>
                                        <Icon name="edit" />
                                    </button>
                                )}
                        </div>
                    )}
                    {sub && <div className="hint">{sub}</div>}
                </div>
                {onHistory && <button className="btn btn-sm" onClick={onHistory}><Icon name="clock" />History</button>}
            </div>
        </section>
    );
}
