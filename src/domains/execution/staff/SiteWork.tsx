import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import Pager from "@/shared/components/Data-Tables/Pager";
import { RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PROJECT_STATUS } from "@/shared/components/Data/status";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import { dayKey, fmtDate, fmtDateY, fmtDayDateY, fmtNumber, relDay } from "@/shared/format/time";
import { useSiteRecords, type SiteRecords } from "./siteRecordsApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

type Record_ = SiteRecords["recent"][number];

const RECENT_PAGE = 10;

/**
 * What an Execution person recorded (the Execution side of the prototype's Profile): they log no hours, so their
 * trail is the materials they added and the weekly labour they reported, in dollars.
 */
export default function SiteWork({ userId, joinedOn }: { userId: number | null; joinedOn: string | null }) {
    const [page, setPage] = useState(1);
    const records = useSiteRecords(userId ?? "me", page, RECENT_PAGE);
    const anchor = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const r = records.data;
    if (loadFailed(records)) return <div className="panel"><div className="panel-body"><LoadError error={records.error} retry={() => records.refetch()} what="what they recorded" /></div></div>;
    // the last 16 weeks, oldest first: the average is over the latest 12
    const latest = (r?.weeks ?? []).slice(-12);
    const avgWeek = latest.length ? latest.reduce((t, w) => t + w.value, 0) / 12 : 0;
    const projects = (r?.projects ?? []).map((p) => ({ ...p, value: p.materials + p.labour, count: p.materialCount + p.labourWeeks })).sort((a, b) => b.value - a.value);
    const openProject = (id: number | string) => navigate(`/execution/projects/${id}`);

    return (
        <>
            <KpiStrip loading={!r} items={[
                { key: "total", label: "Total recorded", value: money.fmt(r?.total ?? 0), sub: joinedOn ? <span>since {fmtDateY(joinedOn)}</span> : undefined },
                { key: "entries", label: "Entries", value: fmtNumber((r?.materialCount ?? 0) + (r?.labourWeeks ?? 0)), sub: <span>materials + labour weeks</span> },
                { key: "quarter", label: "This quarter", value: money.fmt(r?.thisQuarter ?? 0) },
                { key: "week", label: "Average week", value: money.fmt(avgWeek), sub: <span>last 12 weeks</span> },
                { key: "projects", label: "Projects", value: projects.length },
                { key: "days", label: "Active days", value: r?.activeDays ?? 0 },
            ]} />

            <div className="grid g-7-5 mt">
                <Figure title="Value per week" sub="Last 16 weeks - materials + labour recorded.">
                    {r ? (
                        <Columns height={180} labelEvery={3} format={(v) => money.short(v)} seriesLabel="Value"
                            data={r.weeks.map((w) => ({ label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)}`, value: w.value }))} />
                    ) : <SkeletonLines lines={5} />}
                </Figure>
                <Figure title="Project distribution" sub="All time.">
                    {r ? (
                        <RankBars showPct format={(v) => money.short(v)} unit="Value" onClick={(it) => it.id != null && openProject(it.id)}
                            items={projects.slice(0, 8).map((p) => ({
                                id: String(p.projectId), label: p.title, value: p.value,
                                node: <><ProjectTile size="sm" /><span className="trunc">{p.title}</span></>,
                            }))} />
                    ) : <SkeletonLines lines={5} />}
                </Figure>
            </div>

            <div className="grid g-7-5 mt">
                <div className="panel" ref={anchor} aria-label="Recent activity">
                    <div className="panel-head"><div><div className="panel-title">Recent activity</div><div className="panel-sub">Newest entries, grouped by day.</div></div></div>
                    <div className="panel-body" style={{ paddingTop: 2 }}>
                        {!r ? <SkeletonLines lines={6} /> : r.recent.length === 0 ? <Empty art="time" title="No activity recorded yet" /> : groupByDay(r.recent).map((g) => (
                            <div key={g.key} className="day-group">
                                <div className="day-head">
                                    <h4>{relDay(g.at)}</h4>
                                    <span className="muted" style={{ fontSize: "11.5px" }}>{fmtDayDateY(g.at)}</span>
                                    <span className="day-total mono">{money.fmt(g.value)}</span>
                                </div>
                                <div style={{ marginTop: 6 }}>
                                    {g.items.map((x) => (
                                        <div key={`${x.kind}-${x.id}`} className="row spread" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                                            <span className="trunc">{x.kind === "material" ? x.label : `Weekly labour · week of ${fmtDateY(x.label)}`} · {x.projectTitle}</span>
                                            <span className="mono">{money.fmt(x.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {r && <Pager page={page} pageSize={RECENT_PAGE} total={r.recentTotal} onPage={setPage} anchor={anchor} />}
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-head"><div><div className="panel-title">Projects</div></div></div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr><th>Project</th><th className="r">Value</th><th className="r">Entries</th><th>Last</th></tr></thead>
                            <tbody>
                                {projects.map((p) => (
                                    <tr key={p.projectId} className="click" {...clickable(() => openProject(p.projectId))}>
                                        <td>
                                            <div className="pname">
                                                <ProjectTile size="sm" />
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="trunc" style={{ fontWeight: 600 }}>{p.title}</div>
                                                    <div className="muted" style={{ fontSize: 11 }}>{PROJECT_STATUS[p.status].label}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="r mono">{money.fmt(p.value)}</td>
                                        <td className="r num">{p.count}</td>
                                        <td className="muted nowrap">{relDay(p.lastRecordedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {r && projects.length === 0 && <p className="muted" style={{ padding: 14 }}>Nothing recorded on any site yet.</p>}
                    </div>
                </div>
            </div>
        </>
    );
}

/** The latest records by the day they were made, newest first. */
function groupByDay(records: Record_[]) {
    const groups: { key: string; at: string; items: Record_[]; value: number }[] = [];
    for (const x of records) {
        const key = dayKey(x.at);
        let g = groups[groups.length - 1];
        if (!g || g.key !== key) { g = { key, at: x.at, items: [], value: 0 }; groups.push(g); }
        g.items.push(x);
        g.value += x.amount;
    }
    return groups;
}
