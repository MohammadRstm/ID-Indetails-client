import type { ReactNode } from "react";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { useAccountFigures } from "../account/accountApi";

/** In cents, two of them always, so the parts add up to the total exactly and line up. */
const cents = (amount: number) => money.exact(amount, "USD", { cents: true, twoDecimals: true });

type WorkPriceSectionProps = {
    project: Project;
    /** Left out when the viewer may not change the supervision and TVA. */
    onEdit?: () => void;
    onHistory?: () => void;
};

/**
 * An Execution site's price, first on its Financials tab. On a client site it is written as the sum the client pays: the
 * work price, plus the supervision, plus the TVA (plus the permits, when there are any), equals the client total, which
 * the payments below are counted against; every amount is the API's (the site's account figures). An internal site has
 * no client and no account, so it shows its work price and what it would add up to. The work price is not typed in: it
 * comes from the bills of quantities agreed with the client, so only the supervision and the TVA are edited here.
 */
export default function WorkPriceSection({ project, onEdit, onHistory }: WorkPriceSectionProps) {
    const m = project.money!;
    const agreed = (m.projectFee ?? 0) > 0 || (m.permitsUsd ?? 0) !== 0;
    const client = project.billingType === "client" && !!project.client;
    const figures = useAccountFigures(project.id, client && agreed).data;

    return (
        <section className="panel pay-section" aria-label="Work price">
            <div className="panel-body">
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <div className="u grow">{client ? "What the client pays" : "Work price"}</div>
                    {m.isLocked ? <span className="locked-field"><Icon name="lock" style={{ width: 12, height: 12 }} />locked</span>
                        : onEdit && (
                            <button className="icon-btn" aria-label="Edit pricing" title="Change the supervision and TVA" onClick={onEdit}>
                                <Icon name="edit" />
                            </button>
                        )}
                    {onHistory && <button className="btn btn-sm" onClick={onHistory}><Icon name="clock" />History</button>}
                </div>
                {!agreed ? (
                    <div className="mt"><span className="muted">Set when a BOQ is agreed</span></div>
                ) : !client ? (
                    <InternalPrice project={project} />
                ) : !figures ? (
                    <div className="mt"><SkeletonLines lines={2} /></div>
                ) : (
                    <div className="price-eq" role="group" aria-label="Client total">
                        <Term label="Work price" meta="the agreed BOQ and VOs">
                            <b className="mono pay-amount">{cents(figures.workUsd)}</b>
                        </Term>
                        <Term sign="+" label="Supervision" meta={`${money.pct(figures.supervisionRate)} of the work price`}>
                            <b className="mono">{cents(figures.supervisionUsd)}</b>
                        </Term>
                        <Term sign="+" label="TVA" meta={`${money.pct(figures.tvaRate)} of the work price`}>
                            <b className="mono">{cents(figures.tvaUsd)}</b>
                        </Term>
                        {figures.permitsUsd !== 0 && (
                            <Term sign="+" label="Permits" meta="no supervision or TVA on them">
                                <b className="mono">{cents(figures.permitsUsd)}</b>
                            </Term>
                        )}
                        <Term sign="=" label="Client total" meta="what the payments below count against" total>
                            <b className="mono">{cents(figures.clientTotalUsd)}</b>
                        </Term>
                    </div>
                )}
                <div className="hint mt">
                    The work price is agreed in the BOQs; the supervision and the TVA are added on top of it, and the TVA is never
                    charged on the supervision{(m.permitsUsd ?? 0) !== 0 ? " or the permits" : ""}. Each change is kept with why it changed.
                </div>
            </div>
        </section>
    );
}

/** An internal site's price: no client pays it, so it isn't written as a sum to be paid. */
function InternalPrice({ project }: { project: Project }) {
    const m = project.money!;
    const permits = m.permitsUsd ?? 0;
    return (
        <>
            <b className="mono pay-amount">{money.exact(m.projectFee ?? 0)}</b>
            <div className="xm-owed mt">
                <div><span>Supervision</span><b className="mono">{money.exact(m.supervisionUsd ?? 0)}</b><em>{money.pct(m.supervisionRate ?? 0)} of the work price</em></div>
                <div><span>TVA</span><b className="mono">{money.pct(m.tvaRate)}</b><em>on the work price only, never on supervision{permits !== 0 ? " or permits" : ""}</em></div>
                {permits !== 0 && <div><span>Permits</span><b className="mono">{money.exact(permits)}</b><em>charged as they are: no supervision or TVA</em></div>}
                <div><span>Total</span><b className="mono">{money.exact(m.revenueWithTva)}</b><em>everything agreed so far, TVA included</em></div>
            </div>
        </>
    );
}

/** One part of the sum, with the sign before it: the two always wrap to a new line together, so no line ends on a sign. */
function Term({ sign, label, meta, total, children }: { sign?: "+" | "="; label: string; meta: string; total?: boolean; children: ReactNode }) {
    return (
        <div className="price-eq-part">
            {sign && <div className="price-eq-op" aria-label={sign === "+" ? "plus" : "equals"}>{sign}</div>}
            <div className={cx("price-eq-term", total && "total")}>
                <span>{label}</span>
                {children}
                <em>{meta}</em>
            </div>
        </div>
    );
}
