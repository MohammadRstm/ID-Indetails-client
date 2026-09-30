import { useState } from "react";
import { useNavigate } from "react-router";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { canOpen } from "@/app/routing/routeTable";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import Avatar from "@/shared/components/Identity/Avatar";
import { addDays, companyToday, DAYS, fmtDate, fmtH, fmtNumber, formatSettings, partsOf, startOfWeek } from "@/shared/format/time";
import useDebounce from "@/shared/hooks/useDebounce";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { BREAK_AFTER, clock, daysText, hoursText, weekOrder } from "@/domains/shared/settings/workingTime";
import ScheduleModal from "./ScheduleModal";
import { useSchedules, type PersonSchedule } from "./schedulesApi";
import { clickable } from "@/shared/utils/clickable";

type Day = Schemas["ScheduleDayResponse"];

// a day's bar runs from 6 AM to 10 PM
const DAY_LO = 6 * 60, DAY_HI = 22 * 60;

function Cell({ day, own }: { day?: Day; own: boolean }) {
    if (!day) return <td className="sc-cell off"><span>Off</span></td>;
    const left = Math.max(0, ((day.startMinute - DAY_LO) / (DAY_HI - DAY_LO)) * 100);
    const width = Math.max(3, ((Math.min(day.endMinute, DAY_HI) - Math.max(day.startMinute, DAY_LO)) / (DAY_HI - DAY_LO)) * 100);
    const paidBreak = day.endMinute - day.startMinute - day.requiredMinutes;
    return (
        <td className={cx("sc-cell", own && "custom")} title={`${hoursText(day)} · ${fmtH(day.requiredMinutes)} required${paidBreak > 0 ? ` (${fmtH(paidBreak)} paid break)` : ""}`}>
            <div className="sc-bar"><i style={{ left: `${left}%`, width: `${width}%` }} /></div>
            <span className="mono">{hoursText(day)}</span>
        </td>
    );
}

/**
 * Businesses in order, then their departments (teams) alphabetically, with anyone outside a team after them
 * (named with their business when both are shown); people without a business, the super admins, last.
 */
function groupsOf(people: PersonSchedule[], both: boolean) {
    const out: { key: string; name: string; people: PersonSchedule[] }[] = [];
    const byName = (a: PersonSchedule, b: PersonSchedule) => a.name.localeCompare(b.name);
    for (const domain of ["design", "execution"] as Domain[]) {
        const inDomain = people.filter((p) => p.domain === domain);
        for (const team of [...new Set(inDomain.flatMap((p) => (p.team ? [p.team.name] : [])))].sort()) {
            out.push({ key: `${domain}-${team}`, name: team, people: inDomain.filter((p) => p.team?.name === team).sort(byName) });
        }
        const noTeam = inDomain.filter((p) => !p.team);
        if (noTeam.length) out.push({ key: `${domain}-none`, name: both ? `${AREAS[domain].label} · no department` : "No department", people: noTeam.sort(byName) });
    }
    const company = people.filter((p) => !p.domain);
    if (company.length) out.push({ key: "company", name: "Company", people: company.sort(byName) });
    return out;
}

/** When each person is expected to work, across both businesses (the prototype's P.CompanySchedules). */
export default function SchedulesPage() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const [domain, setDomain] = useState<Domain | "all">("all");
    const [q, setQ] = useState("");
    const [editing, setEditing] = useState<PersonSchedule | null>(null);
    const search = useDebounce({ value: q.trim(), debounceTimeMs: 250 });
    const schedules = useSchedules({ domain: domain === "all" ? null : domain, search });
    const s = schedules.data;
    const domains = (["design", "execution"] as Domain[]).filter((d) => permissions.canSeeDomain(d));
    const today = companyToday();
    const weekStart = formatSettings().weekStart;
    const order = weekOrder(weekStart);
    const monday = startOfWeek(today);
    const people = s?.people ?? [];
    const groups = groupsOf(people, domain === "all" && domains.length > 1);
    const own = people.filter((p) => p.isOwn).length;
    const weekTotal = people.reduce((t, p) => t + p.requiredMinutesPerWeek, 0);
    const cw = s?.companyWeek;
    // settings live in a business's area; the company week is the same in both
    const settingsIn = domain === "all" ? domains[0] : domain;
    const canSettings = !!settingsIn && permissions.has(P.WORKING_TIME_MANAGE) && canOpen(permissions, settingsIn, "settings");
    const canEdit = (p: PersonSchedule) => p.role !== "super_admin" || permissions.has(P.EMPLOYEE_INVITE_SUPER_ADMIN);

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Schedules</h1>
                    <div className="page-sub">When each employee is expected to work, across both businesses</div>
                </div>
            </div>

            {schedules.isError ? <div className="panel"><div className="panel-body"><LoadError error={schedules.error} retry={() => schedules.refetch()} what="the schedules" /></div></div> : (
                <>
                    <div className="sc-default">
                        <Icon name="clock" />
                        <div className="grow">
                            {!cw ? <SkeletonLines lines={1} /> : (
                                <>
                                    <b>Company default: {daysText(cw.workDays, weekStart)} · {clock(cw.startMinute)} – {clock(cw.endMinute)}{cw.breakMinutes ? ` · ${fmtH(cw.breakMinutes)} break` : ""}</b>
                                    <span className="muted"> · {fmtH(cw.requiredMinutesPerWeek)} required a week.
                                        {cw.breakMinutes ? ` The break is paid and taken whenever suits, on days over ${fmtH(BREAK_AFTER)}.` : ""}
                                        {" "}Everyone works this unless they have their own schedule{own ? ` (${own} do)` : ""}.</span>
                                </>
                            )}
                        </div>
                        {canSettings && <button className="btn btn-sm" onClick={() => navigate(`/${settingsIn}/settings?section=time`)}><Icon name="settings" />Change in Settings</button>}
                    </div>

                    <div className="filters mt">
                        {domains.length > 1 && (
                            <Segmented aria-label="Business" value={domain} onChange={setDomain}
                                options={[{ value: "all" as const, label: "All" }, ...domains.map((d) => ({ value: d, label: AREAS[d].label }))]} />
                        )}
                        <SearchInput value={q} onChange={setQ} placeholder="Find a person or department" width={240} />
                        <span className="grow" />
                        <span className="sc-legend">
                            <span><i className="d" />Company default</span><span><i className="c" />Own schedule</span><span><i className="o" />Off</span>
                        </span>
                    </div>

                    <div className="panel mt">
                        {!s ? <div className="panel-body"><SkeletonLines lines={8} /></div> : (
                            <>
                                <div className="tbl-wrap">
                                    <table className="sc-tbl">
                                        <thead>
                                            <tr>
                                                <th className="sc-who">{fmtNumber(people.length)} employees · {fmtH(weekTotal)} a week</th>
                                                {order.map((d, i) => {
                                                    const date = addDays(monday, i);
                                                    return <th key={d} className={cx("sc-day", date === today && "today")}>{DAYS[d]}<span>{partsOf(date).day}</span></th>;
                                                })}
                                                <th className="r">Week</th><th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groups.flatMap((g) => [
                                                <tr key={`d-${g.key}`} className="sc-dept"><td colSpan={order.length + 3}>{g.name}</td></tr>,
                                                ...g.people.map((p) => {
                                                    const editable = canEdit(p);
                                                    return (
                                                        <tr key={p.userId} className="sc-row" style={editable ? undefined : { cursor: "default" }} {...clickable(editable ? () => setEditing(p) : undefined)}>
                                                            <td className="sc-who">
                                                                <div className="row" style={{ gap: 9, minWidth: 0 }}>
                                                                    <Avatar person={{ name: p.name, photoFileId: p.photoFileId }} size={26} />
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <div className="trunc" style={{ fontWeight: 600 }}>{p.name}</div>
                                                                        <div className="muted trunc" style={{ fontSize: 11 }}>
                                                                            {[p.position, p.isOwn ? "own schedule" : null, p.nextChangeOn ? `changes ${fmtDate(p.nextChangeOn)}` : null].filter(Boolean).join(" · ")}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {order.map((d) => <Cell key={d} day={p.days.find((x) => x.weekday === d)} own={p.isOwn} />)}
                                                            <td className="r mono sc-total">{fmtH(p.requiredMinutesPerWeek)}</td>
                                                            <td className="sc-act">
                                                                {editable && (
                                                                    <button className="btn btn-sm btn-quiet" aria-label={`Edit ${p.name}'s schedule`} onClick={(e) => { e.stopPropagation(); setEditing(p); }}>
                                                                        <Icon name="edit" />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                }),
                                            ])}
                                        </tbody>
                                    </table>
                                </div>
                                {people.length === 0 && <Empty art="search" title="No one matches" text="Try another name, or show both businesses." />}
                            </>
                        )}
                    </div>
                </>
            )}
            {editing && cw && <ScheduleModal person={editing} companyWeek={cw} onClose={() => setEditing(null)} />}
        </div>
    );
}
