import { useNavigate } from "react-router";
import { useDomain } from "@/app/routing/domainContext";
import { ProjectTile } from "@/shared/components/Data/Bits";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { DeadlineTag } from "./Requirements";
import { useMyRequirements } from "./requirementsApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

/** Open requirements assigned to the person that carry a deadline, soonest first (the prototype's UI.MyDeadlines). */
export default function MyDeadlines() {
    const navigate = useNavigate();
    const domain = useDomain();
    const query = useMyRequirements();
    const items = query.data?.items ?? [];
    const dated = items.filter((r) => r.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
    const undated = items.length - dated.length;
    const overdue = query.data?.overdue ?? 0;

    return (
        <div className="panel">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Your requirement deadlines</div>
                    <div className="panel-sub">Open requirements assigned to you, soonest first{overdue ? <> · <span className="down">{overdue} overdue</span></> : ""}.</div>
                </div>
            </div>
            <div className="panel-body" style={{ paddingTop: 2 }}>
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="your requirements" />
                    : !query.data ? <SkeletonLines lines={3} />
                        : dated.length ? dated.map((r) => (
                            <div key={r.id} className="req click" {...clickable(() => navigate(`/${domain}/projects/${r.project.id}`), "link")}>
                                <ProjectTile icon={r.project.icon} tint={r.project.tint} size="sm" />
                                <div className="grow" style={{ minWidth: 0 }}>
                                    <div className="req-text">{r.text}</div>
                                    <div className="req-meta">
                                        <span>{r.project.title}</span>
                                        {r.otherAssignees.length > 0 && <span className="muted">with {r.otherAssignees.map((x) => x.name.split(" ")[0]).join(", ")}</span>}
                                    </div>
                                </div>
                                <DeadlineTag deadline={r.deadline} done={false} />
                            </div>
                        )) : <div className="muted" style={{ fontSize: "12.5px", padding: "6px 0" }}>No requirement with a deadline is assigned to you.</div>}
                {undated > 0 && <div className="hint mt-s">+ {undated} more assigned to you without a deadline - see each project's Requirements.</div>}
            </div>
        </div>
    );
}
