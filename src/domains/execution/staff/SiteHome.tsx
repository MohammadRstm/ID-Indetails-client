import { useState } from "react";
import { useNavigate } from "react-router";
import { useCurrentUser } from "@/app/session/useSession";
import { Bar, ProjectTile } from "@/shared/components/Data/Bits";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { SearchInput } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { Avatars } from "@/shared/components/Identity/People";
import { money } from "@/shared/format/money";
import { addDays, dayKey, fmtDate, fmtDayDateY, monthKey, relTime, startOfWeek } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useProjects, type ProjectSummary } from "../../shared/projects/projectsApi";
import { companyNow } from "../../design/work/day";
import { useSiteSummaries, type SiteSummary } from "./siteRecordsApi";
import { clickable } from "@/shared/utils/clickable";

type LastWorked = "any" | "week" | "month" | "older" | "never";

/**
 * An Execution employee's home (the Execution side of the prototype's P.EmpProjects): no hours to greet them
 * with, just the sites they record materials and labour on, most recently recorded first.
 */
export default function SiteHome() {
    const me = useCurrentUser();
    const { today, minute } = companyNow();
    const activeQuery = useProjects({ domain: "execution", status: "active", pageSize: 100 });
    const heldQuery = useProjects({ domain: "execution", status: "hold", pageSize: 100 });
    const allActive = activeQuery.data?.items ?? [];
    const allHeld = heldQuery.data?.items ?? [];
    const summaries = useSiteSummaries([...allActive, ...allHeld].map((p) => p.id));
    const byId = new Map((summaries.data ?? []).map((s) => [s.projectId, s]));
    const [fq, setFq] = useState("");
    const [fClient, setFClient] = useState("");
    const [fLast, setFLast] = useState<LastWorked>("any");

    const hour = Math.floor(minute / 60);
    const lastOf = (p: ProjectSummary) => byId.get(p.id)?.myLastRecordedAt ?? null;
    const weekStart = startOfWeek(today), monthStart = `${monthKey(today)}-01`, monthAgo = addDays(today, -30);
    const filtering = !!(fq.trim() || fClient || fLast !== "any");
    function keep(p: ProjectSummary) {
        const q = fq.trim().toLowerCase();
        const client = p.client?.displayName ?? "";
        if (q && !p.title.toLowerCase().includes(q) && !client.toLowerCase().includes(q)) return false;
        if (fClient === "internal" ? !!p.client : fClient && client !== fClient) return false;
        const at = lastOf(p), last = at ? dayKey(at) : null;
        if (fLast === "week" && !(last && last >= weekStart)) return false;
        if (fLast === "month" && !(last && last >= monthStart)) return false;
        if (fLast === "older" && !(last && last < monthAgo)) return false;
        if (fLast === "never" && last) return false;
        return true;
    }
    // what they recorded on most recently first; sites they never touched follow, newest first
    const byMine = (a: ProjectSummary, b: ProjectSummary) => {
        const la = lastOf(a), lb = lastOf(b);
        if (la && lb) return lb.localeCompare(la);
        if (la || lb) return la ? -1 : 1;
        return b.startDate.localeCompare(a.startDate);
    };
    const active = allActive.filter(keep).sort(byMine);
    const held = allHeld.filter(keep).sort(byMine);
    const clientNames = [...new Set([...allActive, ...allHeld].map((p) => p.client?.displayName).filter((n): n is string => !!n))];
    const hasInternal = [...allActive, ...allHeld].some((p) => !p.client);
    const clear = () => { setFq(""); setFClient(""); setFLast("any"); };
    const error = activeQuery.error ?? heldQuery.error;

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {me.firstName}</h1>
                    <div className="page-sub">{fmtDayDateY(today)} · {activeQuery.data ? `${allActive.length} active projects` : "…"}</div>
                </div>
            </div>

            <div className="row wrap" style={{ gap: 10, margin: "22px 0 10px", alignItems: "baseline" }}>
                <h2 className="page-title" style={{ fontSize: 15 }}>Active projects</h2>
                <span className="muted" style={{ fontSize: 12 }}>most recently worked on first</span>
            </div>
            <div className="filters">
                <SearchInput width={230} value={fq} onChange={setFq} placeholder="Search projects or clients" />
                <Select className="select sm" style={{ width: 190 }} aria-label="Client" value={fClient} onChange={setFClient} options={[
                    { value: "", label: "All clients" },
                    ...clientNames.map((n) => ({ value: n, label: n })),
                    ...(hasInternal ? [{ value: "internal", label: "Internal (no client)" }] : []),
                ]} />
                <Select className="select sm" style={{ width: 190 }} aria-label="Last worked" value={fLast} onChange={setFLast} options={[
                    { value: "any", label: "Last worked: any time" },
                    { value: "week", label: "Worked on this week" },
                    { value: "month", label: "Worked on this month" },
                    { value: "older", label: "Not in over a month" },
                    { value: "never", label: "Never worked on" },
                ]} />
                {filtering && <button className="btn btn-sm btn-quiet" onClick={clear}><Icon name="x" />Clear</button>}
                {filtering && <span className="muted" style={{ fontSize: 12 }}>{active.length + held.length} of {allActive.length + allHeld.length} projects</span>}
            </div>

            {!error && summaries.isError && (
                <div style={{ marginBottom: 10 }}><LoadError error={summaries.error} retry={() => summaries.refetch()} what="what has been recorded on your projects" /></div>
            )}
            {error ? <div className="panel"><div className="panel-body"><LoadError error={error} retry={() => { activeQuery.refetch(); heldQuery.refetch(); }} what="your projects" /></div></div>
                : !activeQuery.data || !heldQuery.data ? (
                    <div className="grid g-3">{[0, 1, 2].map((i) => <div key={i} className="pcard"><SkeletonLines lines={5} /></div>)}</div>
                ) : (
                    <>
                        <div className="grid g-3">{active.map((p) => <SiteCard key={p.id} project={p} summary={byId.get(p.id)} failed={summaries.isError} />)}</div>
                        {active.length === 0 && (
                            <div className="panel">
                                {filtering
                                    ? <Empty art="search" title="No active projects match" text="Try another search or clear the filters." action={<button className="btn" onClick={clear}>Clear filters</button>} />
                                    : <Empty art="projects" title="No active projects" text="When an admin creates a project it appears here and you can start recording materials against it." />}
                            </div>
                        )}
                        {held.length > 0 && (
                            <div>
                                <h2 className="page-title" style={{ fontSize: 15, margin: "22px 0 4px" }}>Paused</h2>
                                <p className="page-sub" style={{ marginBottom: 10 }}>Still visible so you know where they stand - but nothing new is scheduled until they resume.</p>
                                <div className="grid g-3">{held.map((p) => <SiteCard key={p.id} project={p} summary={byId.get(p.id)} failed={summaries.isError} paused />)}</div>
                            </div>
                        )}
                    </>
                )}
        </div>
    );
}

/** One site the person records on: its progress, its materials so far and who has been recording there. */
function SiteCard({ project: p, summary: s, failed, paused }: { project: ProjectSummary; summary: SiteSummary | undefined; failed: boolean; paused?: boolean }) {
    const navigate = useNavigate();
    return (
        <div className="pcard" {...clickable(() => navigate(`/execution/projects/${p.id}`), "link")}>
            <div className="row start" style={{ gap: 11 }}>
                <ProjectTile icon={p.icon} tint={p.tint} size="lg" />
                <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
                        <span className="pcard-title trunc">{p.title}</span>
                    </div>
                    {p.client && <div className="muted trunc" style={{ fontSize: "11.5px", marginTop: 2 }}>for {p.client.displayName}</div>}
                    <div className="muted clamp2" style={{ fontSize: "11.5px", marginTop: 2 }}>{p.description}</div>
                </div>
                <StatusBadge status={p.status} />
            </div>
            <div>
                <div className="spread" style={{ marginBottom: 4 }}>
                    <span className="u">Project progress</span>
                    <span className="muted" style={{ fontSize: "11.5px" }}>Started {fmtDate(p.startDate)}</span>
                </div>
                <Bar value={p.progressPct} tone={paused ? "warn" : ""} />
            </div>
            <div className="pcard-mine">
                <div className="grow">
                    <div className="u">Materials logged</div>
                    <div className="mono" style={{ fontWeight: 650, fontSize: 14 }}>{s ? money.short(s.materialCost) : failed ? "-" : "…"}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{s?.myLastRecordedAt ? `you last recorded here ${relTime(s.myLastRecordedAt)}` : "nothing recorded by you yet"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div className="u">Team</div>
                    <Avatars people={p.team?.people ?? []} max={4} />
                </div>
            </div>
            <div className="spread">
                <span className="muted trunc" style={{ fontSize: "11.5px" }}>
                    {s?.materialCount ? `${s.materialCount} materials on record` : "No materials logged yet"}
                </span>
                {paused && <span className="badge badge-hold"><Icon name="lock" />On hold</span>}
            </div>
        </div>
    );
}
