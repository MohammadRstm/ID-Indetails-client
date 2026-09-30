import type { KeyboardEvent, MouseEvent } from "react";
import { StatusBadge as ProjectStatus } from "@/shared/components/Data/Pills";
import { Avatars, PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import { tip } from "@/shared/components/Overlays/tip";
import { dayKey as keyOf, fmtDate, fmtDayDate, fmtDayDateY, fmtDur, fmtHourLabel, fmtRange, fmtTime, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { meetingTitle } from "../../../shared/meetings/meetingsApi";
import { clamp, dayStart, hoursOf, matches, progressAt, roundMin, segmentsFor, type Annotation, type Day as HistoryDay, type Filter, type Gap as HistoryGap, type History, type StatusAt } from "./history";
import { annView, firstName, list, STATUS_WORD, type SourceKind } from "./words";
import { clickable } from "@/shared/utils/clickable";

/** Where a figure comes from: recorded, estimated, inferred or calculated. */
export function Src({ kind, title }: { kind: SourceKind; title?: string }) {
    return <span className={`vt-src src-${kind}`} title={title}>{kind}</span>;
}

/** A status at a moment, including "not created yet". */
export function HistoryStatus({ status }: { status: StatusAt["status"] }) {
    if (status in STATUS_WORD) return <ProjectStatus status={status} />;
    return <span className="badge">{status === "not-created" ? "Not created yet" : "Unknown"}</span>;
}

export function AnnChip({ ann, nameOf }: { ann: Annotation; nameOf: (id: number) => string }) {
    const v = annView(ann, nameOf);
    if (!v) return null;
    return (
        <span className={cx("vt-ann", ann.kind === "status" && `st-${ann.status}`)}>
            <Icon name={v.icon} /><span>{v.text}</span><Src kind={v.src} />
        </span>
    );
}

export type Scale = { lo: number; hi: number; ticks: number[] };

type DayProps = {
    day: HistoryDay;
    history: History;
    scale: Scale;
    at: number | null;
    filter: Filter;
    anns: Annotation[];
    expanded: boolean;
    tasksOpen: boolean;
    onToggleTasks: () => void;
    onExpand: () => void;
    onPick: (t: number) => void;
    onEntry: (id: number) => void;
    onPerson: (id: number) => void;
    onOpenDay: (key: string) => void;
};

/** One day in the vertical history: who worked at once, and, opened, each person's lane and the day in slices. */
export function Day({ day, history: h, scale, at, filter, anns, expanded, tasksOpen, onToggleTasks, onExpand, onPick, onEntry, onPerson, onOpenDay }: DayProps) {
    const nameOf = (id: number) => h.people.get(id)?.name ?? "Someone";
    const segs = segmentsFor(day, filter);
    const lanes: { id: number; items: HistoryDay["items"] }[] = [];
    for (const it of day.items) {
        if (!matches(it.entry, filter)) continue;
        let l = lanes.find((x) => x.id === it.entry.userId);
        if (!l) lanes.push((l = { id: it.entry.userId, items: [] }));
        l.items.push(it);
    }
    const shown = lanes.reduce((s, l) => s + l.items.reduce((a, it) => a + (it.e - it.s) / 60_000, 0), 0);
    const here = at != null && keyOf(at) === day.key;
    const pct = (t: number) => clamp(((hoursOf(t) - scale.lo) / (scale.hi - scale.lo)) * 100, 0, 100);
    const prog = progressAt(h, dayStart(day.key) + 86_400_000 - 1);
    const peak = segs.reduce((m, s) => Math.max(m, s.n), 0);
    const shownLanes = expanded || lanes.length <= 8 ? lanes : lanes.slice(0, 8);
    const taskCount = lanes.reduce((s, l) => s + l.items.length, 0);

    function pick(ev: MouseEvent<HTMLDivElement>) {
        const r = ev.currentTarget.getBoundingClientRect();
        const hour = scale.lo + clamp((ev.clientX - r.left) / r.width, 0, 1) * (scale.hi - scale.lo);
        onPick(roundMin(dayStart(day.key) + hour * 3_600_000));
    }
    const atLine = here ? <span className="lane-at" style={{ left: `${pct(at!)}%` }} /> : null;
    // the card opens the day as a card timeline; what's clickable inside it keeps its own job
    function openDay(ev: MouseEvent | KeyboardEvent) {
        if ((ev.target as HTMLElement).closest("button, a, .link, .plink, .lane-track, .lane-depth, .vt-seg, .vt-desc, .vt-ann")) return;
        onOpenDay(day.key);
    }

    return (
        <div className={cx("vt-row vt-day", here && "sel")} id={`vt-${day.key}`}>
            <span className="vt-node" />
            <div className="vt-card click" {...clickable(openDay, "button")} title="Open this day as a card timeline">
                <div className="vt-head">
                    <h4>{relDay(day.key)}</h4>
                    <span className="muted" style={{ fontSize: "11.5px" }}>{fmtDayDateY(day.key)}</span>
                    {peak >= 2 && <span className="vt-n">{peak} at once</span>}
                    <span className="grow" />
                    {prog.value != null && (
                        <span className="muted" style={{ fontSize: "11.5px" }}>Progress {prog.basis === "checkpoint" || prog.basis === "held" ? "" : "~"}{Math.round(prog.value)}%</span>
                    )}
                    <span className="mono day-total" style={{ marginLeft: 0 }}>{fmtDur(shown)}</span>
                    <Avatars people={lanes.map((l) => ({ id: l.id, name: nameOf(l.id) }))} max={6} size={20} link />
                    <button className="btn btn-sm btn-quiet vt-open" onClick={() => onOpenDay(day.key)}>Open day<Icon name="arrowRight" /></button>
                </div>
                {anns.length > 0 && <div className="vt-anns">{anns.map((a) => <AnnChip key={a.id} ann={a} nameOf={nameOf} />)}</div>}

                <div className="lanes">
                    <div className="lane lane-scale-row">
                        <span className="lane-name muted">{lanes.length > 1 ? "People at once" : ""}</span>
                        <div className="lane-depth" onClick={pick} title="Darker means more people working at the same time">
                            {segs.filter((s) => s.n > 0).map((s) => (
                                <i key={s.start} className={`d${Math.min(4, s.n)}`} style={{ left: `${pct(s.start)}%`, width: `${Math.max(0.4, pct(s.end) - pct(s.start))}%` }} />
                            ))}
                            {atLine}
                        </div>
                    </div>
                    {expanded && day.meetings.length > 0 && (
                        <div className="lane">
                            <span className="lane-name muted">Meetings</span>
                            <div className="lane-track" onClick={pick}>
                                {day.meetings.map((m) => (
                                    <i key={m.id} className="meeting" style={{ left: `${pct(m.start)}%`, width: `${Math.max(0.6, pct(m.end) - pct(m.start))}%` }}
                                        onMouseMove={(ev) => tip.show(ev, [{ big: meetingTitle({ startsAt: new Date(m.start).toISOString() }) }, m.topic ? { k: "Topic", v: m.topic } : null, { k: "Time", v: fmtRange(m.start, m.end) }])}
                                        onMouseLeave={tip.hide} />
                                ))}
                                {atLine}
                            </div>
                        </div>
                    )}
                    {expanded && shownLanes.map((l) => {
                        const person = { id: l.id, name: nameOf(l.id) };
                        const role = h.people.get(l.id)?.role;
                        return (
                            <div key={l.id} className="lane">
                                <span className="lane-name" title={`${person.name}${role ? ` · ${role}` : ""}`}>
                                    <PersonAvatar person={person} size={18} /><span className="trunc"><PersonName person={person} text={firstName(person.name)} /></span>
                                </span>
                                <div className="lane-track" onClick={pick}>
                                    {l.items.map((it) => (
                                        <i key={it.entry.id} className={cx(it.continued && "cont")} style={{ left: `${pct(it.s)}%`, width: `${Math.max(0.6, pct(it.e) - pct(it.s))}%` }}
                                            onMouseMove={(ev) => tip.show(ev, [{ big: person.name }, { k: "Task", v: it.entry.description }, { k: "Time", v: fmtRange(it.entry.start, it.entry.end) }, { k: "Duration", v: fmtDur(it.entry.minutes) }])}
                                            onMouseLeave={tip.hide} />
                                    ))}
                                    {atLine}
                                </div>
                            </div>
                        );
                    })}
                    {expanded && lanes.length > shownLanes.length && <div className="hint" style={{ paddingLeft: 120 }}>+{lanes.length - shownLanes.length} more people</div>}
                    <div className="lane">
                        <span />
                        <div className="lane-scale">
                            {scale.ticks.map((hr) => <span key={hr} style={{ left: `${((hr - scale.lo) / (scale.hi - scale.lo)) * 100}%` }}>{fmtHourLabel(hr * 60)}</span>)}
                        </div>
                    </div>
                </div>

                {!expanded ? (
                    <button className="btn btn-quiet btn-sm mt-s" onClick={onExpand}><Icon name="chevronDown" />Show who worked when</button>
                ) : !tasksOpen ? (
                    <button className="link vt-tasks-toggle" onClick={onToggleTasks} aria-expanded="false"><Icon name="chevronDown" />Show tasks · {taskCount}</button>
                ) : (
                    <>
                        <button className="link vt-tasks-toggle" onClick={onToggleTasks} aria-expanded="true"><Icon name="chevronUp" />Hide tasks</button>
                        <div className="vt-spine">
                            {segs.filter((s) => !s.minor).map((s, i, arr) => {
                                const sel = here && s.start <= at! && at! < s.end;
                                const began = s.startedHere.filter((id) => filter.person == null || id === filter.person);
                                const ended = s.endedHere.filter((id) => filter.person == null || id === filter.person);
                                const isLast = i === arr.length - 1;
                                // a task is spelled out where it begins (or on the chosen slice); people carrying on are named
                                const full = s.active.filter((a) => sel || a.entryStart === s.start || i === 0);
                                const cont = s.active.filter((a) => !full.includes(a));
                                return (
                                    <div key={s.start} className={cx("vt-seg", s.kind === "idle" && "idle", sel && "sel")} onClick={() => onPick(roundMin((s.start + s.end) / 2))}>
                                        <div className="vt-seg-time mono">{fmtTime(s.start)} – {fmtTime(s.end)}<div className="muted">{fmtDur(s.minutes)}</div></div>
                                        <div style={{ minWidth: 0 }}>
                                            {(ended.length > 0 || began.length > 0) && (
                                                <div className="vt-change">
                                                    {ended.length > 0 && <span>← {list(ended.map((id) => firstName(nameOf(id))))}'s work ended</span>}
                                                    {ended.length > 0 && began.length > 0 && <span> · </span>}
                                                    {began.length > 0 && <span>→ {list(began.map((id) => firstName(nameOf(id))))}'s work began</span>}
                                                </div>
                                            )}
                                            {s.kind === "idle" ? <div className="muted">No one was working on the project</div> : (
                                                <>
                                                    {full.map((a) => {
                                                        const role = h.people.get(a.userId)?.role;
                                                        return (
                                                            <div key={a.entry.id} className="vt-who">
                                                                <PersonAvatar person={{ id: a.userId, name: nameOf(a.userId) }} size={18} />
                                                                <b className="link" onClick={(ev) => { ev.stopPropagation(); onPerson(a.userId); }}>{firstName(nameOf(a.userId))}</b>
                                                                {role && <span className="muted">{role}</span>}
                                                                <span className="muted">·</span>
                                                                <span className="trunc vt-desc" onClick={(ev) => { ev.stopPropagation(); onEntry(a.entry.id); }}>{a.description}</span>
                                                            </div>
                                                        );
                                                    })}
                                                    {cont.length > 0 && (
                                                        <div className="vt-who muted">
                                                            <Avatars people={cont.map((a) => ({ id: a.userId, name: nameOf(a.userId) }))} max={5} size={16} link />
                                                            <span className="trunc">{full.length ? "Still working: " : "Working: "}{list(cont.map((a) => firstName(nameOf(a.userId))))}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {isLast && s.endedAfter && s.endedAfter.length > 0 && (
                                                <div className="vt-change" style={{ marginTop: 3 }}>
                                                    ← {list(s.endedAfter.filter((id) => filter.person == null || id === filter.person).map((id) => firstName(nameOf(id))))}'s work ended · last work that day
                                                </div>
                                            )}
                                        </div>
                                        <div>{s.n >= 2 && <span className="vt-n">{s.n} at once</span>}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/** A stretch of days with no work logged. */
export function Gap({ gap: g }: { gap: HistoryGap }) {
    const caption = g.kind === "hold" ? "The project was on hold - a recorded status change."
        : g.kind === "trailing" ? "Nothing has been logged since - the project is still open."
            : "No reason for this pause is recorded.";
    return (
        <div className={cx("vt-row vt-gap", g.kind)}>
            <span className="vt-node" />
            <div className="vt-gap-box">
                <div className="row wrap" style={{ gap: 8 }}>
                    <Icon name={g.kind === "hold" ? "pause" : "clock"} />
                    <b>{g.days} day{g.days === 1 ? "" : "s"} with no work logged</b>
                    <span className="muted mono" style={{ fontSize: 11 }}>{fmtDate(g.from)} – {g.open ? "now" : fmtDate(g.to)}</span>
                    {g.kind === "hold" && <Src kind="recorded" />}
                </div>
                <div className="hint" style={{ marginTop: 3 }}>{caption}</div>
            </div>
        </div>
    );
}

/** Recorded events on a day nobody worked. */
export function EventRow({ at, anns, nameOf }: { at: number; anns: Annotation[]; nameOf: (id: number) => string }) {
    return (
        <div className="vt-row vt-event">
            <span className="vt-node" />
            <div className="row wrap" style={{ gap: 8 }}>
                <span className="mono muted" style={{ fontSize: 11 }}>{fmtDayDate(at)} · {fmtTime(at)}</span>
                {anns.map((a) => <AnnChip key={a.id} ann={a} nameOf={nameOf} />)}
            </div>
        </div>
    );
}
