import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../shared/projects/projectsApi";

type WorkPriceSectionProps = {
    project: Project;
    /** Left out when the viewer may not change the supervision and TVA. */
    onEdit?: () => void;
    onHistory?: () => void;
};

/**
 * An Execution site's price, first on its Financials tab: the work price in bold, then the supervision, the TVA and what
 * the client pays in all. The work price is not typed in: it comes from the bills of quantities agreed with the client,
 * so only the supervision and the TVA are edited here.
 */
export default function WorkPriceSection({ project, onEdit, onHistory }: WorkPriceSectionProps) {
    const m = project.money!;
    const price = m.projectFee ?? 0;
    return (
        <section className="panel pay-section" aria-label="Work price">
            <div className="panel-body row" style={{ gap: 16, alignItems: "center" }}>
                <div className="grow">
                    <div className="u">Work price</div>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        {price > 0 ? <b className="mono pay-amount">{money.exact(price)}</b> : <span className="muted">Set when a BOQ is agreed</span>}
                        {m.isLocked ? <span className="locked-field"><Icon name="lock" style={{ width: 12, height: 12 }} />locked</span>
                            : onEdit && (
                                <button className="icon-btn" aria-label="Edit pricing" title="Change the supervision, TVA and material profit" onClick={onEdit}>
                                    <Icon name="edit" />
                                </button>
                            )}
                    </div>
                    <div className="hint">The agreed price of the work, before supervision and TVA. Each change is kept with why it changed.</div>
                    {price > 0 && (
                        <div className="xm-owed mt">
                            <div><span>Supervision</span><b className="mono">{money.exact(m.supervisionUsd ?? 0)}</b><em>{money.pct(m.supervisionRate ?? 0)} of the work price</em></div>
                            <div><span>TVA</span><b className="mono">{money.pct(m.tvaRate)}</b><em>on the work price only, never on supervision</em></div>
                            <div><span>Client total</span><b className="mono">{money.exact(m.revenueWithTva)}</b><em>everything agreed so far, TVA included</em></div>
                        </div>
                    )}
                </div>
                {onHistory && <button className="btn btn-sm" onClick={onHistory}><Icon name="clock" />History</button>}
            </div>
        </section>
    );
}
