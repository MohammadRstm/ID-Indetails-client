import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import MyDeadlines from "./MyDeadlines";
import { useMyRequirements } from "./requirementsApi";

/** Execution staff log no hours, so their My work is the requirements assigned to them (the prototype's ExecMyWork). */
export default function MyRequirementsPage() {
    const query = useMyRequirements();
    const d = query.data;
    const open = d?.items.length ?? 0;
    const projects = d?.projects ?? 0;
    const overdue = d?.overdue ?? 0;
    return (
        <div className="page">
            <PageHead title="My work" sub="The project requirements assigned to you, and when they are due." />
            <KpiStrip loading={!d} items={[
                { key: "open", label: "Open, assigned to you", value: open, sub: <span>across {projects} project{projects === 1 ? "" : "s"}</span> },
                { key: "overdue", label: "Overdue", value: overdue, sub: <span className={overdue ? "down" : "muted"}>{overdue ? "past their deadline" : "nothing late"}</span> },
                { key: "soon", label: "Due in the next 7 days", value: d?.dueSoon ?? 0 },
                { key: "done", label: "Done", value: d?.done ?? 0, sub: <span>of {open + (d?.done ?? 0)} ever assigned to you</span> },
            ]} />
            <div className="mt"><MyDeadlines /></div>
        </div>
    );
}
