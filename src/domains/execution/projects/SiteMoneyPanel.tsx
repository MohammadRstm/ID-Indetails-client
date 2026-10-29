import Waterfall, { type WaterfallStep } from "@/shared/components/Charts/Waterfall";
import { Kpi } from "@/shared/components/Data/Kpi";
import { CostRow, Money } from "@/shared/components/Data/Money";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { usePayments } from "../../shared/billing/billingApi";
import type { Project } from "../../shared/projects/projectsApi";
import { useAllMaterials } from "../materials/materialsApi";
import { pctOf, SITE_COLORS, siteMoneyOf } from "./siteMoney";
import HelpHint from "@/domains/shared/help/HelpHint";

type SiteMoneyPanelProps = {
    project: Project;
    /** Each is left out when the viewer may not do it. */
    onRecordPayment?: () => void;
    onEditPricing?: () => void;
};

/**
 * What the client has paid against everything spent on site, and where the profit comes from (the prototype's
 * EX.MoneyPanel). Materials and ground labour are paid as they happen, so the profit is what is left.
 */
export default function SiteMoneyPanel({ project, onRecordPayment, onEditPricing }: SiteMoneyPanelProps) {
    const client = project.billingType === "client" && !!project.client;
    const payments = usePayments({ projectId: project.id, pageSize: 100 }, client).data?.items;
    const materials = useAllMaterials(project.id).data;
    if (!project.money) return null;
    const x = siteMoneyOf(project.money);

    if (!client) {
        return (
            <div className="panel mt">
                <div className="panel-head">
                    <div>
                        <div className="panel-title">Internal project</div>
                        <div className="panel-sub">No client and no payments - everything spent here is company cost.</div>
                    </div>
                </div>
                <div className="panel-body">
                    <div className="kpis">
                        <Kpi label="Spent so far" value={money.exact(x.spent)} sub={<span>materials, ground labour and expenses</span>} />
                    </div>
                </div>
            </div>
        );
    }

    const initial = payments?.find((p) => p.isInitial && !p.voidedAt);
    const ownPrices = materials?.items.filter((m) => m.priceSource === "manual").length ?? 0;
    const paidAhead = x.credit > 0.5;
    const done = project.status === "completed" || project.status === "archived";
    const editPricing = x.locked ? undefined : onEditPricing;
    const steps: WaterfallStep[] = [
        { label: "Received", value: x.received, kind: "start", sub: plural(x.payments, "payment") },
        ...(x.materialCost ? [{ label: "Materials", value: x.materialCost, kind: "cost" as const }] : []),
        ...(x.labour ? [{ label: "Ground labour", value: x.labour, kind: "cost" as const }] : []),
        ...(x.other ? [{ label: "Expenses", value: x.other, kind: "cost" as const }] : []),
        { label: "Profit so far", value: 0, kind: "result" },
    ];

    return (
        <div className="panel mt xm-panel">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Project money</div>
                    <div className="panel-sub">Cash in from the client against everything spent on site. Materials and labour are paid when they happen, so profit is what's left.</div>
                </div>
                <div className="panel-tools">
                    {onRecordPayment && <button className="btn btn-sm" onClick={onRecordPayment}><Icon name="card" />Record payment</button>}
                    {editPricing && <button className="btn btn-sm" onClick={editPricing}><Icon name="edit" />Pricing</button>}
                </div>
            </div>
            <div className="panel-body">
                <div className="kpis xm-kpis">
                    <Kpi label="Received from client" value={money.exact(x.received)}
                        sub={<span>{plural(x.payments, "payment")}{initial ? ` · ${money.short(initial.amountUsd)} up front` : ""}</span>} />
                    <Kpi label="Spent so far" value={money.exact(x.spent)}
                        sub={<span><Money short value={x.materialCost} /> materials · <Money short value={x.labour} /> labour{x.other ? ` · ${money.short(x.other)} other` : ""}</span>} />
                    <Kpi label={<>Profit so far<HelpHint article="site-money" label="profit so far">What the client has paid, minus what the site has cost.</HelpHint></>} value={<span className={x.cashProfit < 0 ? "down" : "up"}>{money.exact(x.cashProfit)}</span>}
                        sub={<span>{x.toPocket || x.fromPocket ? "received − spent ± pocket money" : "received − spent"}</span>} />
                    <Kpi label={paidAhead ? "Paid ahead" : "Client still owes"} value={money.exact(paidAhead ? x.credit : x.owed)}
                        sub={<span>of {money.exact(x.agreed)} agreed so far</span>} />
                    <Kpi label={<>Expected profit<HelpHint article="site-money" label="expected profit">What is left once the client has paid everything agreed so far: the agreed amount minus the cost.</HelpHint></>} value={<span className={x.expectedProfit < 0 ? "down" : undefined}>{money.exact(x.expectedProfit)}</span>}
                        sub={<span>once the client has paid it all</span>} />
                </div>

                <div className="grid g-2 mt xm-grid">
                    <div>
                        <div className="u" style={{ marginBottom: 4 }}>Where the cash stands</div>
                        <Waterfall steps={steps} height={190} />
                    </div>
                    <div>
                        <div className="u" style={{ marginBottom: 6 }}>Where the profit comes from</div>
                        <CostRow label="Work price" swatch={SITE_COLORS.fee} value={`+${money.exact(x.fee)}`} meta={x.fee ? "from the agreed BOQs" : "none agreed yet"} />
                        <CostRow label="Supervision" swatch={SITE_COLORS.supervision} value={`+${money.exact(x.supervision)}`} meta="on top of the work price" />
                        <CostRow label="Materials" swatch={SITE_COLORS.materials} value={`−${money.exact(x.materialCost)}`} tone={x.materialCost ? "down" : ""} meta="what the suppliers charged" />
                        <CostRow label="Ground labour" swatch={SITE_COLORS.labour} value={`−${money.exact(x.labour)}`} tone={x.labour ? "down" : ""} meta="not billed to the client" />
                        {x.other > 0 && <CostRow label="Other expenses" swatch={SITE_COLORS.other} value={`−${money.exact(x.other)}`} tone="down" />}
                        <CostRow strong label="Expected profit" value={money.exact(x.expectedProfit)} tone={x.expectedProfit < 0 ? "down" : ""} />
                        <div className="xm-owed mt">
                            <div><span>Agreed so far</span><b className="mono">{money.exact(x.agreed)}</b><em>the work price and supervision</em></div>
                            <div><span>Received</span><b className="mono">{money.exact(x.received)}</b><em>{plural(x.payments, "payment")}</em></div>
                            {x.toPocket > 0 && (
                                <div><span>To the pocket money</span><b className="mono">−{money.exact(x.toPocket)}</b><em>set aside from this site's profit</em></div>
                            )}
                            {x.fromPocket > 0 && (
                                <div><span>From the pocket money</span><b className="mono">{money.exact(x.fromPocket)}</b><em>paid to this site, not owed by the client</em></div>
                            )}
                            <div className={cx((paidAhead || x.owed <= 0.5) && "ok")}>
                                <span>{paidAhead ? "Paid ahead" : "Still owed"}</span>
                                <b className="mono">{money.exact(paidAhead ? x.credit : x.owed)}</b>
                                <em>{paidAhead ? "paid beyond what is agreed so far" : "grows as a BOQ or VO is agreed"}</em>
                            </div>
                        </div>
                        <div className="hint mt-s">
                            Default material profit on new materials: <b>{pctOf(x.markup)}</b>
                            {ownPrices > 0 ? ` · ${ownPrices} with a price of their own` : ""}.{done ? " Closed - the agreed amount is locked." : ""}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
