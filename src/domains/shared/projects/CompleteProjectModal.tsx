import { useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { CompositionBar } from "@/shared/components/Charts/Bars";
import Waterfall from "@/shared/components/Charts/Waterfall";
import { Kpi } from "@/shared/components/Data/Kpi";
import { Money } from "@/shared/components/Data/Money";
import { MarginPill } from "@/shared/components/Data/Pills";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDayDateY, companyToday, fmtH } from "@/shared/format/time";
import type { IconName } from "@/shared/icons/icons";
import Icon from "@/shared/icons/Icon";
import { useChangeProjectStatus, type Project } from "./projectsApi";

type CompleteProjectModalProps = {
    project: Project;
    openRequirements: number;
    /** Design: how many people logged work on it, when known. */
    contributors?: number;
    onClose: () => void;
};

/** The close-out review before a project is completed (the prototype's PF.CompleteModal). */
export default function CompleteProjectModal({ project, openRequirements, contributors, onClose }: CompleteProjectModalProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const change = useChangeProjectStatus(project.id);
    const m = permissions.has(P.FINANCIAL_VIEW) ? project.money : null;
    const execution = project.domain === "execution";
    const internal = project.billingType === "internal";
    // What the client paid beyond the price (TVA included). Kept by default: completing raises the price to what was
    // received (a closing VO on a site, a higher payment on Design), so the project closes on what it really earned.
    const paidAhead = !internal && m?.billing && m.billing.paidAhead > 0.5 ? m.billing.paidAhead : 0;
    const [keep, setKeep] = useState(true);
    // what keeping it adds to the revenue: the TVA in it is never revenue, and on a site supervision is part of it
    const s = execution ? m?.supervisionRate ?? 0 : 0;
    const t = m?.tvaRate ?? 0;
    const gain = keep && paidAhead > 0 ? paidAhead * (1 + s) / (1 + s + t) : 0;
    const revenue = (m?.revenue ?? 0) + gain;
    const profit = (m?.profit ?? 0) + gain;
    const margin = m && revenue > 0 ? profit / revenue : null;
    const unpriced = execution && m != null && revenue === 0;
    const costOnly = internal || unpriced;

    function confirm() {
        change.mutate({ action: "complete", keepPaidAhead: keep && paidAhead > 0 }, {
            onSuccess: () => {
                toast({
                    text: `${project.title} closed${m && !costOnly && margin != null ? ` at ${money.pct(margin)} margin` : ""}`,
                    sub: "Removed from employee lists · history kept",
                    icon: "checkCircle",
                    actionLabel: "Undo",
                    action: () => change.mutate("reopen"),
                });
                onClose();
                navigate(`/${project.domain}/projects/${project.id}`, { replace: true });
            },
        });
    }

    const rows: [IconName, string, string][] = [
        ["checkCircle", "Status becomes Completed", `Completion date ${fmtDayDateY(companyToday())} · every requirement marked done, so progress is 100%.`],
        ["lock", execution ? "Price is locked" : "Payment is locked", internal ? "Internal projects carry no payment." : unpriced ? `No ${execution ? "BOQ was ever agreed" : "price was ever set"} - there is nothing to lock.`
            : execution ? `${m ? `${money.fmt(revenue)}, the work price and supervision, ` : "The work price "}can no longer change while the project stays closed: no BOQ or VO can be agreed or withdrawn.`
                : m ? `${money.fmt(revenue)} can no longer be changed while the project stays closed.` : "The agreed amount can no longer be changed while the project stays closed."],
        ["eye", "Leaves every employee's active list", "Employees stop seeing it among their active projects; their own entries stay in My work."],
        execution ? ["clock", "No new expenses or labour", "Every expense and weekly labour report - and therefore direct cost - is final."]
            : ["clock", "No new work entries", "Logged hours - and therefore labour cost - are final."],
        ["card", "Company expenses are untouched", "Subscriptions and running costs are charged to the company's month, never to this project."],
        ["refresh", "Reversible", execution ? "Reopening the project unlocks its BOQs and pricing and reopens it for expenses and labour."
            : "Reopening the project unlocks the payment and reopens it for work."],
    ];

    return (
        <Modal
            size="md"
            onClose={onClose}
            title={`Close ${project.title}`}
            sub="Final review - the figures below are what the project closes on."
            foot={
                <>
                    <div className="grow mono" style={{ fontSize: 12 }}>
                        {change.error ? <FieldError message={errorMessage(change.error)} />
                            : m ? (costOnly ? `Final cost ${money.fmt(m.cost.total)}` : `Final profit ${money.fmt(profit)} · ${money.pct(margin)}`) : null}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={change.isPending} onClick={confirm}><Icon name="check" />Complete project</button>
                </>
            }
        >
            {openRequirements > 0 && (
                <div className="banner attn">
                    <Icon name="alert" />
                    <div className="grow">
                        <b>{openRequirements} requirement{openRequirements === 1 ? " is" : "s are"} still open.</b> Completing the project marks{" "}
                        {openRequirements === 1 ? "it" : "all of them"} as done, so progress becomes 100%. Reopening the project later puts{" "}
                        {openRequirements === 1 ? "it" : "them"} back as open.
                    </div>
                </div>
            )}
            {paidAhead > 0 && (
                <div className="banner hold">
                    <Icon name="info" />
                    <div className="grow">
                        <b>The client paid {money.fmt(paidAhead)} beyond the agreed price.</b>{" "}
                        {keep ? `It is kept: ${execution ? "a closing VO raises the price" : "the payment is raised"} to what was received, so it counts in the profit below.`
                            : "It stays a balance owed back to the client and doesn't count in the profit."}
                    </div>
                    <button type="button" className="switch" role="switch" aria-checked={keep} aria-label="Keep what the client paid beyond the price" onClick={() => setKeep(!keep)} />
                </div>
            )}
            {unpriced && (
                <div className="banner attn">
                    <Icon name="alert" />
                    <div className="grow"><b>Never priced.</b> This project closes as pure cost - no profit or margin, because {execution ? "no BOQ was ever agreed" : "no price was ever set"}.</div>
                </div>
            )}

            {m && (costOnly ? (
                <div>
                    <div className="u">{internal ? "Total cost of this internal project" : "Total cost - never priced"}</div>
                    <Money value={m.cost.total} size="xl" />
                    <div className="mt">
                        <CompositionBar height={18} parts={[
                            { label: execution ? "Site expenses" : "Employee labour", value: execution ? m.cost.siteExpenses : m.cost.labour, color: "var(--heat-3)" },
                            { label: execution ? "Ground labour" : "Project expenses", value: execution ? m.cost.groundLabour : m.cost.expenses, color: "var(--heat-1)" },
                            ...(execution ? [{ label: "Other costs", value: m.cost.expenses, color: "var(--ghost)" }] : []),
                        ]} />
                    </div>
                </div>
            ) : (
                <div>
                    <div className="row wrap" style={{ gap: 12, alignItems: "baseline" }}>
                        <div>
                            <div className="u">Final profit</div>
                            <Money value={profit} size="xl" tone="auto" />
                        </div>
                        <MarginPill value={margin} />
                    </div>
                    <Waterfall height={200} steps={execution ? [
                        { label: gain > 0 ? "Agreed + kept" : "Agreed", value: revenue, kind: "start", sub: gain > 0 ? `${money.short(gain)} paid beyond the price` : undefined },
                        { label: "Site expenses", value: m.cost.siteExpenses, kind: "cost" },
                        { label: "Ground labour", value: m.cost.groundLabour, kind: "cost" },
                        { label: "Other costs", value: m.cost.expenses, kind: "cost" },
                        { label: "Profit", value: 0, kind: "result" },
                    ] : [
                        { label: gain > 0 ? "Payment + kept" : "Payment", value: revenue, kind: "start", sub: gain > 0 ? `${money.short(gain)} paid beyond the price` : undefined },
                        { label: "Labour", value: m.cost.labour, kind: "cost", sub: `${Math.round(m.labourHours)}h` },
                        { label: "Expenses", value: m.cost.expenses, kind: "cost" },
                        { label: "Profit", value: 0, kind: "result" },
                    ]} />
                </div>
            ))}

            {m && (
                <div className="kpis mt">
                    {execution ? <Kpi label="Site expenses" value={<Money short value={m.cost.siteExpenses} />} /> : <Kpi label="Hours logged" value={fmtH(Math.round(m.labourHours * 60))} />}
                    {execution ? <Kpi label="Ground labour" value={<Money short value={m.cost.groundLabour} />} /> : <Kpi label="Contributors" value={contributors ?? "-"} />}
                    <Kpi label={execution ? "Other costs" : "Project expenses"} value={<Money short value={m.cost.expenses} />} />
                    {execution ? <Kpi label="Total direct cost" value={<Money short value={m.cost.total} />} /> : <Kpi label="Cost per hour" value={money.fmt(m.costPerHour)} />}
                </div>
            )}

            <div className="mt-s">
                {rows.map(([icon, title, text]) => (
                    <div key={title} className="mini-row" style={{ alignItems: "flex-start" }}>
                        <span className="feed-ic"><Icon name={icon} /></span>
                        <div className="grow">
                            <div style={{ fontWeight: 600, fontSize: "12.5px" }}>{title}</div>
                            <div className="muted" style={{ fontSize: "11.5px" }}>{text}</div>
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
