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
    const unpriced = execution && m != null && m.revenue === 0;
    const costOnly = internal || unpriced;
    // what the client owes is frozen on completing, so every material must have been sent to them first
    const unsent = execution && m ? m.unsentMaterials : 0;

    function confirm() {
        change.mutate("complete", {
            onSuccess: () => {
                toast({
                    text: `${project.title} closed${m && !costOnly && m.margin != null ? ` at ${money.pct(m.margin)} margin` : ""}`,
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
        ["lock", "Payment is locked", internal ? "Internal projects carry no payment." : unpriced ? "No price was ever set - there is nothing to lock."
            : m ? `${money.fmt(m.revenue)} can no longer be changed while the project stays closed.` : "The agreed amount can no longer be changed while the project stays closed."],
        ["eye", "Leaves every employee's active list", "Employees stop seeing it among their active projects; their own entries stay in My work."],
        execution ? ["clock", "No new materials or labour", "Every material and weekly labour report - and therefore direct cost - is final."]
            : ["clock", "No new work entries", "Logged hours - and therefore labour cost - are final."],
        ["card", "Company expenses are untouched", "Subscriptions and running costs are charged to the company's month, never to this project."],
        ["refresh", "Reversible", execution ? "Reopening the project unlocks pricing and reopens it for materials and labour."
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
                            : m ? (costOnly ? `Final cost ${money.fmt(m.cost.total)}` : `Final profit ${money.fmt(m.profit)} · ${money.pct(m.margin)}`) : null}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={change.isPending || unsent > 0} onClick={confirm}><Icon name="check" />Complete project</button>
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
            {unsent > 0 && (
                <div className="banner hold">
                    <Icon name="alert" />
                    <div className="grow">
                        <b>{unsent} material{unsent === 1 ? " hasn't" : "s haven't"} been sent to the client.</b> Completing freezes what the client owes,
                        so send a client statement first: then {unsent === 1 ? "its price counts" : "their prices count"} in the agreed amount.
                    </div>
                </div>
            )}
            {unpriced && (
                <div className="banner attn">
                    <Icon name="alert" />
                    <div className="grow"><b>Never priced.</b> This project closes as pure cost - no profit or margin, because no price was ever set.</div>
                </div>
            )}

            {m && (costOnly ? (
                <div>
                    <div className="u">{internal ? "Total cost of this internal project" : "Total cost - never priced"}</div>
                    <Money value={m.cost.total} size="xl" />
                    <div className="mt">
                        <CompositionBar height={18} parts={[
                            { label: execution ? "Materials" : "Employee labour", value: execution ? m.cost.materials : m.cost.labour, color: "var(--heat-3)" },
                            { label: execution ? "Ground labour" : "Project expenses", value: execution ? m.cost.groundLabour : m.cost.expenses, color: "var(--heat-1)" },
                            ...(execution ? [{ label: "Project expenses", value: m.cost.expenses, color: "var(--ghost)" }] : []),
                        ]} />
                    </div>
                </div>
            ) : (
                <div>
                    <div className="row wrap" style={{ gap: 12, alignItems: "baseline" }}>
                        <div>
                            <div className="u">Final profit</div>
                            <Money value={m.profit} size="xl" tone="auto" />
                        </div>
                        <MarginPill value={m.margin} />
                    </div>
                    <Waterfall height={200} steps={execution ? [
                        { label: "Agreed", value: m.revenue, kind: "start" },
                        { label: "Materials", value: m.cost.materials, kind: "cost" },
                        { label: "Ground labour", value: m.cost.groundLabour, kind: "cost" },
                        { label: "Expenses", value: m.cost.expenses, kind: "cost" },
                        { label: "Profit", value: 0, kind: "result" },
                    ] : [
                        { label: "Payment", value: m.revenue, kind: "start" },
                        { label: "Labour", value: m.cost.labour, kind: "cost", sub: `${Math.round(m.labourHours)}h` },
                        { label: "Expenses", value: m.cost.expenses, kind: "cost" },
                        { label: "Profit", value: 0, kind: "result" },
                    ]} />
                </div>
            ))}

            {m && (
                <div className="kpis mt">
                    {execution ? <Kpi label="Materials" value={money.short(m.cost.materials)} /> : <Kpi label="Hours logged" value={fmtH(Math.round(m.labourHours * 60))} />}
                    {execution ? <Kpi label="Ground labour" value={money.short(m.cost.groundLabour)} /> : <Kpi label="Contributors" value={contributors ?? "-"} />}
                    <Kpi label="Project expenses" value={money.short(m.cost.expenses)} />
                    {execution ? <Kpi label="Total direct cost" value={money.short(m.cost.total)} /> : <Kpi label="Cost per hour" value={money.fmt(m.costPerHour)} />}
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
