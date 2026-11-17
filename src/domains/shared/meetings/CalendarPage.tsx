import { useState } from "react";
import { useNavigate } from "react-router";
import { loadFailed } from "@/api/queryState";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import { canOpen } from "@/app/routing/routeTable";
import { ProjectTile } from "@/shared/components/Data/Bits";
import Panel, { PageHead } from "@/shared/components/Data/Panel";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { PersonName } from "@/shared/components/Identity/People";
import Modal from "@/shared/components/Overlays/Modal";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import {
    addDays, addMonths, companyToday, DAYS, daysBetween, dayKey, fmtDayDateY, fmtDur, fmtRange, fmtTime, MONTHS_LONG, partsOf, startOfWeek,
} from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { clickable } from "@/shared/utils/clickable";
import { cx } from "@/shared/utils/cx";
import { MeetingModal, MeetingNames } from "./Meetings";
import { meetingTitle, useCanChangeMeeting, useMeetings, type Meeting } from "./meetingsApi";

/** Meetings a day cell lists before "+N more". */
const SHOWN = 3;

/**
 * The meetings the person may see, a month at a time: each day lists its meetings (time, topic, and the project or
 * "General"), today is marked, and a meeting opens its details. Employees' page in both businesses; the Meetings page
 * keeps the list.
 */
export function CalendarPage() {
    const domain = useDomain();
    const today = companyToday();
    const [month, setMonth] = useState(today.slice(0, 7));
    const [open, setOpen] = useState<Meeting | null>(null);
    const [day, setDay] = useState<string | null>(null);
    const [editing, setEditing] = useState<Meeting | null>(null);
    const first = `${month}-01`;
    const monthEnd = addDays(`${addMonths(month, 1)}-01`, -1);
    const gridStart = startOfWeek(first);
    const keys = Array.from({ length: Math.ceil((daysBetween(gridStart, monthEnd) + 1) / 7) * 7 }, (_, i) => addDays(gridStart, i));
    const query = useMeetings({ domain, from: keys[0], to: keys[keys.length - 1] });
    const byDay = new Map<string, Meeting[]>();
    for (const m of [...(query.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
        byDay.set(dayKey(m.startsAt), [...(byDay.get(dayKey(m.startsAt)) ?? []), m]);
    }
    const p = partsOf(first);
    const count = (query.data ?? []).filter((m) => dayKey(m.startsAt).startsWith(month)).length;

    const chip = (m: Meeting) => (
        <button key={m.id} type="button" className="mcal-mtg" title={`${fmtRange(m.startsAt, m.endsAt)} · ${m.topic || meetingTitle(m)}`}
            onClick={() => { setDay(null); setOpen(m); }}>
            <span className="t">{fmtTime(m.startsAt)}</span>
            <span className="tp">{m.topic || "Meeting"}</span>
            <span className="w">{m.project?.title ?? "General"}</span>
        </button>
    );

    return (
        <div className="page">
            <PageHead title="Calendar" sub={`The meetings you can see in ${DOMAIN_LABEL[domain]}, a month at a time`} />
            <Panel title={`${MONTHS_LONG[p.month]} ${p.year}`}
                sub={query.isPending ? "…" : `${count} meeting${count === 1 ? "" : "s"}`}
                tools={
                    <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-sm btn-quiet" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" /></button>
                        <button className="btn btn-sm" disabled={month === today.slice(0, 7)} onClick={() => setMonth(today.slice(0, 7))}>Today</button>
                        <button className="btn btn-sm btn-quiet" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" /></button>
                    </div>
                }>
                {query.isPending ? <SkeletonLines lines={6} />
                    : loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the meetings" />
                        : (
                            <div className="mcal-grid">
                                {keys.slice(0, 7).map((k) => <div key={k} className="mcal-wd">{DAYS[partsOf(k).weekday]}</div>)}
                                {keys.map((k) => {
                                    const meetings = byDay.get(k) ?? [];
                                    return (
                                        <div key={k} role="group" aria-label={fmtDayDateY(k)}
                                            className={cx("mcal-cell", !k.startsWith(month) && "out", k === today && "today")}>
                                            <div className="mcal-day">{partsOf(k).day}{k === today && <span className="mcal-today">Today</span>}</div>
                                            {meetings.slice(0, SHOWN).map(chip)}
                                            {meetings.length > SHOWN && (
                                                <button type="button" className="mcal-more" onClick={() => setDay(k)}>+{meetings.length - SHOWN} more</button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
            </Panel>
            {day && (
                <Modal title={fmtDayDateY(day)} sub={`${byDay.get(day)?.length ?? 0} meetings`} onClose={() => setDay(null)}>
                    <div className="mcal-day-list">{(byDay.get(day) ?? []).map(chip)}</div>
                </Modal>
            )}
            {open && <MeetingDetails meeting={open} onClose={() => setOpen(null)} onEdit={() => { setEditing(open); setOpen(null); }} />}
            {editing && <MeetingModal domain={domain} meeting={editing} onClose={() => setEditing(null)} />}
        </div>
    );
}

/** One meeting: when, what it is about, who set it, who is invited, and its description. */
function MeetingDetails({ meeting: m, onClose, onEdit }: { meeting: Meeting; onClose: () => void; onEdit: () => void }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const canChange = useCanChangeMeeting();
    // a company-wide meeting is shown in the business the page is in
    const here = useDomain();
    const domain = (m.domain as Domain | null) ?? here;
    const projectPath = m.project && `projects/${m.project.id}?tab=meetings`;
    const opens = projectPath && canOpen(permissions, domain, projectPath);

    return (
        <Modal title={m.topic || meetingTitle(m)} sub={`${fmtDayDateY(m.startsAt)} · ${fmtRange(m.startsAt, m.endsAt)}`} onClose={onClose}
            foot={
                <>
                    <span className="grow" />
                    {canChange(m) && <button className="btn" onClick={onEdit}><Icon name="edit" />Edit</button>}
                    <button className="btn btn-primary" onClick={onClose}>Close</button>
                </>
            }>
            <dl className="mcal-facts">
                <dt>When</dt>
                <dd>{fmtDayDateY(m.startsAt)}, {fmtRange(m.startsAt, m.endsAt)} <span className="muted">· {fmtDur(m.minutes)}</span></dd>
                <dt>About</dt>
                <dd>
                    {m.project ? (
                        opens ? (
                            <span className="row link-quiet" style={{ gap: 6, cursor: "pointer" }} {...clickable(() => navigate(`/${domain}/${projectPath}`), "link")}>
                                <ProjectTile icon={m.project.icon} tint={m.project.tint} size="sm" />{m.project.title}
                            </span>
                        ) : (
                            <span className="row" style={{ gap: 6 }}><ProjectTile icon={m.project.icon} tint={m.project.tint} size="sm" />{m.project.title}</span>
                        )
                    ) : `General meeting · ${m.domain ? DOMAIN_LABEL[m.domain] : "the whole company"}`}
                </dd>
                <dt>{m.project ? "Invited" : "With"}</dt>
                <dd>{m.attendees.length ? <MeetingNames people={m.attendees} /> : <span className="muted">Nobody invited: everyone on the project sees it</span>}</dd>
                {m.createdBy && (
                    <>
                        <dt>Set by</dt>
                        <dd><PersonName person={m.createdBy} /></dd>
                    </>
                )}
                {m.description && (
                    <>
                        <dt>Description</dt>
                        <dd className="desc">{m.description}</dd>
                    </>
                )}
            </dl>
        </Modal>
    );
}
