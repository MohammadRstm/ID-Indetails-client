import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { RankBars, Spark } from "@/shared/components/Charts/Bars";
import Figure from "@/shared/components/Charts/Figure";
import { Presence, ProjectTile } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import { StatusBadge } from "@/shared/components/Data/Pills";
import { SortTh, type SortState } from "@/shared/components/Data-Tables/DataTable";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Select from "@/shared/components/Forms/Select";
import { ChipGroup, SearchInput } from "@/shared/components/Forms/Filters";
import Avatar from "@/shared/components/Identity/Avatar";
import { PersonAvatar, PersonLine } from "@/shared/components/Identity/People";
import { money } from "@/shared/format/money";
import { fmtDur, fmtH, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import InviteModal from "../../shared/people/InviteModal";
import { useProjects } from "../../shared/projects/projectsApi";
import { usePeopleWork, type PersonWork } from "./peopleWorkApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

type PresenceFilter = "all" | "online" | "offline" | "invited";

/** Design's employees and what they are working on (the prototype's P.AdminPeople). */
export default function PeoplePage() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const query = usePeopleWork();
    // the focus project's tile
    const tiles = new Map((useProjects({ domain: "design", pageSize: 100 }, permissions.has(P.PROJECT_VIEW)).data?.items ?? []).map((p) => [p.id, p]));
    const [search, setSearch] = useState("");
    const [team, setTeam] = useState("all");
    const [presence, setPresence] = useState<PresenceFilter>("all");
    const [sort, setSort] = useState<SortState>({ key: "week", dir: "desc" });
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    const canInvite = permissions.has(P.EMPLOYEE_INVITE);
    const showAdd = params.get("invite") === "1" && canInvite;
    const openAdd = () => { params.set("invite", "1"); setParams(params); };
    const closeAdd = () => { params.delete("invite"); setParams(params, { replace: true }); };

    const rows = query.data ?? [];
    const teams = [...new Set(rows.map((r) => r.teamName).filter((t): t is string => !!t))].sort();
    const sq = search.trim().toLowerCase();
    const dir = sort.dir === "desc" ? 1 : -1;
    const filtered = rows.filter((r) => {
        if (sq && !`${r.name} ${r.position ?? ""} ${r.email}`.toLowerCase().includes(sq)) return false;
        if (team !== "all" && r.teamName !== team) return false;
        if (presence === "online" && !(r.online && r.status === "active")) return false;
        if (presence === "offline" && (r.online || r.status !== "active")) return false;
        if (presence === "invited" && r.status !== "invited") return false;
        return true;
    }).sort((a, b) => {
        if (sort.key === "name") return a.name.localeCompare(b.name) * -dir;
        if (sort.key === "total") return (b.totalMinutes - a.totalMinutes) * dir;
        if (sort.key === "recent") return (b.lastStartedAt ?? "").localeCompare(a.lastStartedAt ?? "") * dir;
        return (b.weekMinutes - a.weekMinutes) * dir;
    });

    const active = rows.filter((r) => r.status === "active");
    const online = active.filter((r) => r.online);
    const weekTotal = rows.reduce((s, r) => s + r.weekMinutes, 0);
    const logging = rows.filter((r) => r.weekMinutes > 0);
    const quiet = active.filter((r) => r.weekMinutes === 0);
    const byTeam = new Map<string, number>();
    for (const r of rows) if (r.teamName) byTeam.set(r.teamName, (byTeam.get(r.teamName) ?? 0) + r.minutesLast30Days);
    const person = (r: PersonWork) => ({ id: r.id, name: r.name, photoFileId: r.photoFileId, online: r.online });

    return (
        <div className="page">
            <PageHead title="Employees"
                sub={query.data ? `${rows.length} people · ${online.length} online now · ${fmtH(weekTotal)} logged since Monday` : " "}
                actions={canInvite && <button className="btn btn-primary" onClick={openAdd}><Icon name="userPlus" />Add employee</button>} />

            {loadFailed(query) ? <div className="panel"><div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the employees" /></div></div> : (
                <>
                    <KpiStrip loading={!query.data} items={[
                        { key: "people", label: "Employees", value: active.length, sub: <span>{rows.filter((r) => r.status === "invited").length} invited · {teams.length} teams</span> },
                        {
                            key: "online", label: "Online now", value: online.length,
                            sub: <div className="av-stack">{online.slice(0, 7).map((r) => <PersonAvatar key={r.id} person={person(r)} size={18} />)}</div>,
                        },
                        { key: "week", label: "Hours this week", value: fmtH(weekTotal), sub: <span>{logging.length} of {rows.length} people logging</span> },
                        { key: "avg", label: "Average per person", value: fmtH(logging.length ? weekTotal / logging.length : 0), sub: <span>this week, among people logging</span> },
                        { key: "quiet", label: "No work logged", value: quiet.length, sub: <span className="trunc">{quiet.slice(0, 2).map((r) => r.name.split(" ")[0]).join(", ") || "everyone is active"}</span> },
                    ]} />

                    <div className="grid g-7-5 mt">
                        <Figure title="Workload this week" sub="Hours logged since Monday, highest first."
                            table={{ cols: [{ label: "Employee" }, { label: "Hours", right: true }], rows: filtered.map((r) => [r.name, fmtDur(r.weekMinutes)]) }}>
                            {!query.data ? <SkeletonLines lines={6} /> : (
                                <RankBars unit="Hours" onClick={(it) => navigate(`/design/people/${it.id}`)}
                                    items={[...rows].sort((a, b) => b.weekMinutes - a.weekMinutes).slice(0, 9).map((r) => ({
                                        id: r.id, label: r.name, value: r.weekMinutes,
                                        node: <><Avatar person={person(r)} size={20} presence /><span className="trunc">{r.name}</span></>,
                                    }))} />
                            )}
                        </Figure>
                        <Figure title="Team activity" sub="Hours per team over the last 30 days.">
                            {!query.data ? <SkeletonLines lines={4} /> : (
                                <RankBars unit="Hours" showPct items={[...byTeam.entries()].map(([t, v]) => ({ label: t, value: v })).sort((a, b) => b.value - a.value)} />
                            )}
                        </Figure>
                    </div>

                    <div className="filters mt">
                        <SearchInput width={230} value={search} onChange={setSearch} placeholder="Search name, role or email" />
                        <ChipGroup value={presence} onChange={setPresence} aria-label="Presence" options={[
                            { value: "all", label: "Everyone" }, { value: "online", label: "Online" }, { value: "offline", label: "Offline" }, { value: "invited", label: "Invited" },
                        ]} />
                        <div className="grow" />
                        <Select className="select sm" style={{ width: 160 }} aria-label="Team" value={team} onChange={setTeam}
                            options={[{ value: "all", label: "All teams" }, ...teams.map((t) => ({ value: t, label: t }))]} />
                    </div>

                    <div className="panel">
                        {!query.data ? <div className="panel-body"><SkeletonLines lines={8} /></div> : (
                            <div className="tbl-wrap">
                                <table className="tbl tbl-min">
                                    <thead>
                                        <tr>
                                            <SortTh sortKey="name" sort={sort} onSort={setSort}>Employee</SortTh>
                                            <th>Team</th>
                                            {seesMoney && <th className="r">Rate</th>}
                                            <th>Status</th>
                                            <th>Current focus</th>
                                            <SortTh sortKey="week" sort={sort} onSort={setSort} right>This week</SortTh>
                                            <th>Last 8 weeks</th>
                                            <SortTh sortKey="total" sort={sort} onSort={setSort} right>Total</SortTh>
                                            <th className="r" title="Outside the working day, on a day off, or past what the day asks for">Overtime · this month</th>
                                            {seesMoney && <th className="r">Labour cost</th>}
                                            <SortTh sortKey="recent" sort={sort} onSort={setSort}>Last activity</SortTh>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((r) => {
                                            const focus = r.focus ? tiles.get(r.focus.projectId) : undefined;
                                            return (
                                                <tr key={r.id} className="click" {...clickable(() => navigate(`/design/people/${r.id}`))}>
                                                    <td><PersonLine person={person(r)} size={30} presence sub={r.position ?? false} /></td>
                                                    <td className="muted nowrap">{r.teamName ?? "-"}</td>
                                                    {seesMoney && <td className="r mono nowrap">{r.hourlyRate ? `${money.short(r.hourlyRate.amount, r.hourlyRate.currency)}/h` : "-"}</td>}
                                                    <td>{r.status === "invited" ? <StatusBadge status="invited" /> : <Presence online={r.online} lastSeenAt={r.lastSeenAt} />}</td>
                                                    <td>
                                                        {r.focus ? (
                                                            <div className="pname"><ProjectTile icon={focus?.icon} tint={focus?.tint} size="sm" /><span className="trunc" style={{ maxWidth: 150 }}>{r.focus.title}</span></div>
                                                        ) : <span className="muted">-</span>}
                                                    </td>
                                                    <td className="r mono">{r.weekMinutes ? fmtDur(r.weekMinutes) : <span className="muted">-</span>}</td>
                                                    <td><Spark values={r.weekly} width={64} height={18} /></td>
                                                    <td className="r mono">{fmtH(r.totalMinutes)}</td>
                                                    <td className={cx("r mono", r.overtimeMinutesThisMonth ? "ot-text" : "muted")}>{r.overtimeMinutesThisMonth ? fmtH(r.overtimeMinutesThisMonth) : "-"}</td>
                                                    {seesMoney && (
                                                        <td className="r mono">{r.labourCost?.usd ? money.short(r.labourCost.usd) : r.labourCost?.unconverted[0] ? money.short(r.labourCost.unconverted[0].amount, r.labourCost.unconverted[0].currency) : "-"}</td>
                                                    )}
                                                    <td className="nowrap muted">{r.lastStartedAt ? relDay(r.lastStartedAt) : "-"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {query.data && filtered.length === 0 && <Empty art="search" title="No employees match" text="Try another team or clear the search." />}
                    </div>
                </>
            )}

            {showAdd && <InviteModal domain="design" onClose={closeAdd} />}
        </div>
    );
}
