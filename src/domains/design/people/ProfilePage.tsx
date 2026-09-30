import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { downloadFile } from "@/api/download";
import { errorMessage, isStatus } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { MissingRecord } from "@/app/pages/NotFound";
import { useDomain } from "@/app/routing/domainContext";
import { useCurrentUser } from "@/app/session/useSession";
import { RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import DayRuler from "@/shared/components/Charts/DayRuler";
import Figure from "@/shared/components/Charts/Figure";
import { CalendarHeat } from "@/shared/components/Charts/Heat";
import { Presence, ProjectTile } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { CostRow } from "@/shared/components/Data/Money";
import { PROJECT_STATUS } from "@/shared/components/Data/status";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton, { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Avatar from "@/shared/components/Identity/Avatar";
import { money } from "@/shared/format/money";
import { quarterOf, quarterStart } from "@/shared/format/periods";
import { dayKey, fmtDate, fmtDateY, fmtDayDateY, fmtDur, fmtH, fmtNumber, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { currentPay } from "../pay/payRules";
import { HoursBalance, MyHoursBalance } from "../pay/HoursBalance";
import EntryModal from "../projects/EntryModal";
import { companyNow } from "../work/day";
import EntryRow from "../work/EntryRow";
import OvertimePanel from "../work/OvertimePanel";
import type { WorkEntry } from "../work/workApi";
import SiteWork from "../../execution/staff/SiteWork";
import PermissionsModal from "../../shared/settings/PermissionsModal";
import EditProfileModal, { type ProfilePerson } from "./EditProfileModal";
import PersonActions from "./PersonActions";
import { useEmployee, useLabourCost, usePayHistory, usePersonEntries, usePersonHours, usePersonWorkSummary } from "./peopleWorkApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

type Extra = { online?: boolean; lastSeenAt?: string | null; joinedOn?: string | null; leftOn?: string | null; status?: string; role?: string; isJoker?: boolean };

/** Someone's profile, for admins (the prototype's P.Profile). */
export function PersonProfilePage() {
    const { id } = useParams();
    const domain = useDomain();
    const userId = Number(id);
    const valid = Number.isInteger(userId) && userId > 0;
    const employee = useEmployee(userId, valid);
    if (!valid || isStatus(employee.error, 404)) return <MissingRecord title="Employee not found" to={`/${domain}/people`} back="Back to employees" />;
    if (loadFailed(employee)) return <div className="page"><LoadError error={employee.error} retry={() => employee.refetch()} what="the profile" /></div>;
    const e = employee.data;
    if (!e) return <ProfileSkeleton />;
    return (
        <Profile self={false} person={{ id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email, phone: e.phone, photoFileId: e.photoFileId, position: e.position, team: e.team, domain: e.domain }}
            extra={{ online: e.online, lastSeenAt: e.lastSeenAt, joinedOn: e.joinedOn, leftOn: e.leftOn, status: e.status, role: e.role, isJoker: e.isJoker }} />
    );
}

/** The signed-in employee's own profile. */
export function MyProfilePage() {
    const me = useCurrentUser();
    return (
        <Profile self person={{ id: me.id, firstName: me.firstName, lastName: me.lastName, email: me.email, phone: me.phone, photoFileId: me.photoFileId, position: me.position, team: me.team, domain: me.domain }}
            extra={{ online: true, joinedOn: me.joinedOn }} />
    );
}

function ProfileSkeleton() {
    return (
        <div className="page" aria-busy="true">
            <div className="page-head"><div className="row start" style={{ gap: 15 }}><Skeleton width={72} height={72} style={{ borderRadius: "50%" }} />
                <div><Skeleton width={220} height={20} /><Skeleton width={300} height={11} style={{ marginTop: 10 }} /></div></div></div>
            <SkeletonLines lines={6} />
        </div>
    );
}

const fullNameOf = (p: ProfilePerson) => `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email;

function Profile({ person, self, extra }: { person: ProfilePerson; self: boolean; extra: Extra }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const domain = useDomain();
    const [params, setParams] = useSearchParams();
    const [editing, setEditing] = useState(false);
    const [permissionsOpen, setPermissionsOpen] = useState(false);
    const name = fullNameOf(person);
    const first = name.split(" ")[0];
    const execution = person.domain === "execution";
    const seesWork = self || permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const entryId = Number(params.get("entry")) || null;
    const closeEntry = () => { params.delete("entry"); setParams(params, { replace: true }); };
    const avatar = { name, photoFileId: person.photoFileId, online: extra.online };
    // an admin can reach their own profile here too; the API lets nobody message themselves or change their own permissions
    const me = useCurrentUser();
    const own = person.id === me.id;

    async function exportTimesheet() {
        const { today } = companyNow();
        const q = quarterOf(today);
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        try {
            await downloadFile("/work-entries/export", `timesheet-${slug}-${q.year}-q${q.quarter}.csv`, { userId: person.id, from: quarterStart(q.year, q.quarter), to: today });
        } catch (e) {
            toast({ text: "The timesheet wasn't exported", sub: errorMessage(e), icon: "alert" });
        }
    }

    return (
        <div className="page">
            {entryId != null && <EntryModal entryId={entryId} onClose={closeEntry} />}
            {!self && domain === "design" && (
                <div className="crumbs"><Link to="/design/people">Employees</Link><Icon name="chevronRight" /><span>{name}</span></div>
            )}

            <div className="page-head">
                <div className="row start" style={{ gap: 15, minWidth: 0 }}>
                    <Avatar person={avatar} size={72} presence />
                    <div style={{ minWidth: 0 }}>
                        <h1 className="page-title">{name}</h1>
                        <div className="page-sub">{[person.position, person.team?.name].filter(Boolean).join(" · ") || " "}</div>
                        <div className="row wrap mt-s" style={{ gap: 14, fontSize: 12, color: "var(--ink-3)" }}>
                            {extra.online != null && <Presence online={extra.online} lastSeenAt={extra.lastSeenAt} />}
                            <span className="row" style={{ gap: 6 }}><Icon name="mail" style={{ width: 14, height: 14 }} />{person.email}</span>
                            {person.phone && <span className="row" style={{ gap: 6 }}><Icon name="phone" style={{ width: 14, height: 14 }} />{person.phone}</span>}
                            {extra.joinedOn && <span className="row" style={{ gap: 6 }}><Icon name="calendar" style={{ width: 14, height: 14 }} />Joined {fmtDateY(extra.joinedOn)}</span>}
                            {extra.status === "invited" && <StatusBadge status="invited" />}
                            {extra.status === "deactivated" && <span className="badge badge-archived"><Icon name="lock" />{extra.leftOn ? `Left ${fmtDateY(extra.leftOn)}` : "Deactivated"}</span>}
                            {extra.isJoker && <span className="badge" title="Holds a different set of permissions from the role's">Custom access</span>}
                        </div>
                    </div>
                </div>
                <div className="page-actions">
                    {self ? (
                        <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" />Edit profile</button>
                    ) : (
                        <div className="row" style={{ gap: 8 }}>
                            {extra.status === "active" && !own && <button className="btn" onClick={() => navigate(`/${domain}/messages?with=${person.id}`)}><Icon name="chat" />Send message</button>}
                            {permissions.hasAny(P.EMPLOYEE_MANAGE, P.EMPLOYEE_PAY_MANAGE) && <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" />Edit profile</button>}
                            {permissions.has(P.PERMISSION_MANAGE) && !own && extra.role !== "super_admin" && extra.status !== "deactivated" && (
                                <button className="btn" onClick={() => setPermissionsOpen(true)}><Icon name="shield" />Permissions</button>
                            )}
                            {!execution && permissions.has(P.WORK_ENTRY_VIEW_ALL) && <button className="btn" onClick={exportTimesheet}><Icon name="download" />Export timesheet</button>}
                            {extra.status && extra.role && (
                                <PersonActions account={{ id: person.id, name, role: extra.role, domain: person.domain, status: extra.status, leftOn: extra.leftOn ?? null }} />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {execution ? (
                (self || permissions.has(P.EMPLOYEE_VIEW)) && <SiteWork userId={self ? null : person.id} joinedOn={extra.joinedOn ?? null} />
            ) : seesWork ? (
                <DesignWork userId={self ? null : person.id} first={first} self={self} />
            ) : null}

            {editing && <EditProfileModal person={person} self={self} onClose={() => setEditing(false)} />}
            {permissionsOpen && <PermissionsModal person={{ id: person.id, name, domain: person.domain }} onClose={() => setPermissionsOpen(false)} />}
        </div>
    );
}

/** A Design person's work: totals, overtime, hours balance, cost, activity, weeks, projects and recent work. */
function DesignWork({ userId, first, self }: { userId: number | null; first: string; self: boolean }) {
    const navigate = useNavigate();
    const [, setParams] = useSearchParams();
    const permissions = usePermissions();
    const summary = usePersonWorkSummary(userId);
    const entries = usePersonEntries(userId);
    const hours = usePersonHours(userId ?? 0, userId != null && permissions.has(P.SALARY_VIEW));
    const s = summary.data;
    const projectPath = (id: number) => `/design/projects/${id}`;
    const openEntry = (e: WorkEntry) => setParams({ entry: String(e.id) });

    if (loadFailed(summary)) return <div className="panel"><div className="panel-body"><LoadError error={summary.error} retry={() => summary.refetch()} what="their work" /></div></div>;
    const weekly = (s?.weekly ?? []).slice(-16);
    const lastTwelve = weekly.slice(-13, -1);
    const avgWeek = lastTwelve.length ? lastTwelve.reduce((a, w) => a + w.minutes, 0) / 12 : 0;
    const daily = new Map((s?.daily ?? []).map((d) => [d.day, d.minutes]));
    const groups = groupByDay(entries.data?.items ?? []);

    return (
        <>
            <KpiStrip loading={!s} items={[
                {
                    key: "total", label: "Total hours", value: fmtH(s?.totalMinutes ?? 0),
                    sub: <span>{s?.totalOvertimeMinutes ? <><span className="ot-text">{fmtH(s.totalOvertimeMinutes)} overtime</span> · </> : null}{s?.firstEntryDay ? `since ${fmtDateY(s.firstEntryDay)}` : "no work yet"}</span>,
                },
                { key: "entries", label: "Work entries", value: fmtNumber(s?.entryCount ?? 0), sub: <span>avg {s?.entryCount ? fmtDur(s.totalMinutes / s.entryCount) : "-"}</span> },
                { key: "quarter", label: "This quarter", value: fmtH(s?.thisQuarterMinutes ?? 0) },
                { key: "avg", label: "Average week", value: fmtH(avgWeek), sub: <span>last 12 weeks</span> },
                { key: "projects", label: "Projects", value: s?.projectCount ?? 0 },
                { key: "days", label: "Active days", value: s?.activeDaysLastYear ?? 0, sub: <span>longest streak {s?.longestStreakLastYear ?? 0} days</span> },
            ]} />

            {userId != null && <OvertimePanel userId={userId} />}
            {self ? <MyHoursBalance /> : hours.data ? <HoursBalance hours={hours.data} self={false} /> : null}
            {userId != null && permissions.has(P.FINANCIAL_VIEW) && <CostPanel userId={userId} first={first} entries={s?.entryCount ?? 0} />}

            <div className="panel mt">
                <div className="panel-head">
                    <div><div className="panel-title">Activity</div><div className="panel-sub">Every day {self ? "you" : first} logged work in the last year.</div></div>
                </div>
                <div className="panel-body">{!s ? <SkeletonLines lines={4} /> : <CalendarHeat weeks={52} value={(k) => daily.get(k) ?? 0} />}</div>
            </div>

            <div className="grid g-7-5 mt">
                <Figure title="Hours per week" sub="Last 16 weeks - is the pace changing?"
                    table={{ cols: [{ label: "Week of" }, { label: "Hours", right: true }, { label: "Entries", right: true }], rows: weekly.map((w) => [fmtDateY(w.weekStart), (w.minutes / 60).toFixed(1), w.entries]) }}>
                    {!s ? <SkeletonLines lines={5} /> : (
                        <Columns height={180} labelEvery={3} format={(v) => `${Math.round(v)}h`}
                            data={weekly.map((w) => ({ label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)}`, value: w.minutes / 60, note: `${w.entries} entries` }))} />
                    )}
                </Figure>
                <Figure title="Project distribution" sub="All time.">
                    {!s ? <SkeletonLines lines={5} /> : (
                        <RankBars showPct onClick={(it) => navigate(projectPath(Number(it.id)))}
                            items={s.byProject.slice(0, 8).map((p) => ({ id: p.projectId, label: p.title, value: p.minutes, node: <><ProjectTile icon={p.icon} tint={p.tint} size="sm" /><span className="trunc">{p.title}</span></> }))} />
                    )}
                </Figure>
            </div>

            <div className="grid g-7-5 mt">
                <div className="panel">
                    <div className="panel-head"><div><div className="panel-title">Recent work</div><div className="panel-sub">Newest entries, grouped by day.</div></div></div>
                    <div className="panel-body" style={{ paddingTop: 2 }}>
                        {loadFailed(entries) ? <LoadError error={entries.error} retry={() => entries.refetch()} what="their entries" />
                            : !entries.data ? <SkeletonLines lines={5} />
                                : groups.map((g) => (
                                    <div key={g.key} className="day-group">
                                        <div className="day-head">
                                            <h4>{relDay(g.key)}</h4>
                                            <span className="muted" style={{ fontSize: "11.5px" }}>{fmtDayDateY(g.key)}</span>
                                            <span className="day-total mono">{fmtDur(g.minutes)}</span>
                                        </div>
                                        <DayRuler blocks={g.items.map((e) => ({ start: e.startedAt, end: e.endedAt }))} scale={false} />
                                        <div style={{ marginTop: 6 }}>{g.items.map((e) => <EntryRow key={e.id} entry={e} canAttach={self} onOpen={openEntry} />)}</div>
                                    </div>
                                ))}
                        {entries.data && groups.length === 0 && <Empty art="time" title="No work logged yet" />}
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-head"><div><div className="panel-title">Projects</div></div></div>
                    {!s ? <div className="panel-body"><SkeletonLines lines={4} /></div> : (
                        <div className="tbl-wrap">
                            <table className="tbl">
                                <thead><tr><th>Project</th><th className="r">Normal</th><th className="r">Overtime</th><th className="r">Total</th><th className="r">Entries</th><th>Last</th></tr></thead>
                                <tbody>
                                    {s.byProject.map((p) => (
                                        <tr key={p.projectId} className="click" {...clickable(() => navigate(projectPath(p.projectId)))}>
                                            <td>
                                                <div className="pname">
                                                    <ProjectTile icon={p.icon} tint={p.tint} size="sm" />
                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="trunc" style={{ fontWeight: 600 }}>{p.title}</div>
                                                        <div className="muted" style={{ fontSize: 11 }}>{PROJECT_STATUS[p.status]?.label ?? p.status}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="r mono">{fmtH(p.minutes - p.overtimeMinutes)}</td>
                                            <td className={cx("r mono", p.overtimeMinutes ? "ot-text" : "muted")}>{p.overtimeMinutes ? fmtH(p.overtimeMinutes) : "-"}</td>
                                            <td className="r mono" style={{ fontWeight: 600 }}>{fmtH(p.minutes)}</td>
                                            <td className="r num">{p.entries}</td>
                                            <td className="muted nowrap">{relDay(p.lastStartedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

/** "Cost to the company": what their hours cost, visible to admins only, never to them. */
function CostPanel({ userId, first, entries }: { userId: number; first: string; entries: number }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const { today } = companyNow();
    const cost = useLabourCost(userId, true);
    const pays = usePayHistory(userId, permissions.has(P.EMPLOYEE_PAY_MANAGE));
    const current = currentPay(pays.data, today);
    const c = cost.data;
    const show = (l: { usd: number; unconverted: { amount: number; currency: string }[] } | undefined) =>
        !l ? "-" : l.usd ? money.short(l.usd) : l.unconverted[0] ? money.short(l.unconverted[0].amount, l.unconverted[0].currency) : "-";
    const history = [...(pays.data ?? [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Cost to the company</div>
                    <div className="panel-sub">Derived from {fmtNumber(entries)} work entries - visible to admins only, never to {first}.</div>
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(cost) ? <LoadError error={cost.error} retry={() => cost.refetch()} what="their cost" /> : (
                    <div className="grid g-7-5">
                        <div>
                            <div className="kpis" style={{ border: 0 }}>
                                <div className="kpi">
                                    <div className="kpi-label">Hourly cost</div>
                                    <div className="kpi-val">{current ? `${money.short(current.hourlyCostRate, current.currency)}/h` : "-"}</div>
                                    <div className="kpi-delta"><span>{!current ? "" : current.currency === "USD" ? "internal cost" : `paid in ${current.currency} - not converted`}</span></div>
                                </div>
                                <div className="kpi"><div className="kpi-label">Labour cost (all time)</div><div className="kpi-val">{show(c?.allTime)}</div></div>
                                <div className="kpi"><div className="kpi-label">This quarter</div><div className="kpi-val">{show(c?.thisQuarter)}</div></div>
                            </div>
                            {history.length > 1 && (
                                <div className="mt">
                                    <div className="u" style={{ marginBottom: 4 }}>Rate history</div>
                                    {history.map((r, i) => (
                                        <CostRow key={r.id} label={`${money.fmt(r.hourlyCostRate, r.currency)} per hour`} meta={`from ${fmtDateY(r.effectiveFrom)}${r.note ? ` · ${r.note}` : ""}`} value={i === 0 ? "current" : ""} />
                                    ))}
                                    <p className="hint mt-s">Hours keep the rate they were logged at, so closed projects never change value.</p>
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="u" style={{ marginBottom: 6 }}>Cost by project</div>
                            {!c ? <SkeletonLines lines={4} /> : (
                                <RankBars format={(v) => money.short(v)} unit="Cost" onClick={(it) => navigate(`/design/projects/${it.id}`)}
                                    items={c.byProject.filter((p) => p.cost.usd > 0).sort((a, b) => b.cost.usd - a.cost.usd).slice(0, 8).map((p) => ({
                                        id: p.projectId, label: p.title, value: p.cost.usd, node: <><ProjectTile icon={p.icon} tint={p.tint} size="sm" /><span className="trunc">{p.title}</span></>,
                                    }))} />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

type DayGroup = { key: string; items: WorkEntry[]; minutes: number };

function groupByDay(entries: WorkEntry[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const e of entries) {
        const k = dayKey(e.startedAt);
        let g = groups[groups.length - 1];
        if (!g || g.key !== k) groups.push((g = { key: k, items: [], minutes: 0 }));
        g.items.push(e);
        g.minutes += e.minutes;
    }
    return groups;
}
