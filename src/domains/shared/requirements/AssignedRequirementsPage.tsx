import { useSearchParams } from "react-router";
import { loadFailed } from "@/api/queryState";
import Panel, { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Select from "@/shared/components/Forms/Select";
import { MyRequirementRow } from "./MyDeadlines";
import { useMyRequirements } from "./requirementsApi";

/**
 * Every open requirement assigned to the person, on its own page: the ones with a deadline first, soonest first, then
 * the rest. Narrowed to one project from the filter (?project=), and each opens its project's Requirements.
 */
export function AssignedRequirementsPage() {
    const query = useMyRequirements();
    const [params, setParams] = useSearchParams();
    const items = query.data?.items ?? [];
    const projects = [...new Map(items.map((r) => [r.project.id, r.project] as const)).values()].sort((a, b) => a.title.localeCompare(b.title));
    const chosen = params.get("project") ?? "all";
    const shown = items
        .filter((r) => chosen === "all" || String(r.project.id) === chosen)
        .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
    const overdue = query.data?.overdue ?? 0;
    const pick = (value: string) => {
        if (value === "all") params.delete("project");
        else params.set("project", value);
        setParams(params, { replace: true });
    };

    return (
        <div className="page">
            <PageHead title="Requirements"
                sub={query.data ? `${items.length} open, assigned to you${overdue ? ` · ${overdue} overdue` : ""}` : "The requirements assigned to you, and when they are due."} />
            <div className="filters">
                <Select className="select sm" style={{ width: 260 }} aria-label="Project" value={chosen} onChange={pick}
                    options={[{ value: "all", label: "All projects" }, ...projects.map((p) => ({ value: String(p.id), label: p.title }))]} />
                {chosen !== "all" && <span className="muted" style={{ fontSize: 12 }}>{shown.length} of {items.length}</span>}
            </div>
            <Panel className="mt" bodyStyle={{ paddingTop: 2 }}>
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="your requirements" />
                    : !query.data ? <SkeletonLines lines={4} />
                        : shown.length ? shown.map((r) => <MyRequirementRow key={r.id} requirement={r} />)
                            : <Empty art="projects" title={items.length ? "Nothing open on this project" : "No open requirements"}
                                text={items.length ? "Pick another project, or all of them." : "When a requirement is assigned to you, it shows up here."} />}
            </Panel>
        </div>
    );
}
