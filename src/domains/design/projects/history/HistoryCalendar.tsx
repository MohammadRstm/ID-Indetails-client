import { heatLevel } from "@/shared/components/Charts/core";
import { Avatars } from "@/shared/components/Identity/People";
import { addDays, DAYS, DAYS_LONG, dayKey, daysBetween, fmtDayDateY, fmtDur, fmtDurShort, fmtH, fmtHourLabel, fmtTime, MONTHS_LONG, partsOf, startOfWeek } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { clickable } from "@/shared/utils/clickable";
import { dayStart, matches, teamColors, type Annotation, type DayItem, type Filter, type History, type Meeting } from "./history";
import { AnnChip } from "./HistoryParts";
import { firstName } from "./words";

const HOUR_PX = 46;
const MIN = 60_000;
/** Team hours in a day that make each shade of a calendar cell. */
const DAY_SCALE: [number, number, number, number] = [3, 8, 16, 24];

type CalendarProps = {
    history: History;
    from: string;
    to: string;
    filter: Filter;
    /** Recorded changes (status, progress) in the window, shown on their day. */
    anns: Annotation[];
    onOpenDay: (key: string) => void;
    onEntry: (id: number) => void;
};

/** What one day holds once the filters apply. */
function dayOf(h: History, key: string, filter: Filter) {
    const items = (h.dayIndex.get(key)?.items ?? []).filter((it) => matches(it.entry, filter));
    const meetings = filter.person == null && !filter.q ? h.meetings.filter((m) => dayKey(m.start) === key) : [];
    const minutes = items.reduce((s, it) => s + Math.round((it.e - it.s) / MIN), 0);
    const people = [...new Set(items.map((it) => it.entry.userId))];
    return { key, items, meetings, minutes, people, worked: (h.dayIndex.get(key)?.items.length ?? 0) > 0 };
}

/**
 * The project's work as a calendar: up to a week as columns of hours with every task at its real time, one
 * month as a month grid, and longer stretches as small months shaded by the hours logged.
 */
export default function HistoryCalendar(props: CalendarProps) {
    const n = daysBetween(props.from, props.to) + 1;
    if (n <= 7) return <TimeGrid {...props} />;
    const months = monthsBetween(props.from, props.to);
    if (months.length === 1) return <MonthGrid {...props} month={months[0]} />;
    return (
        <div className="hc-months">
            {months.map((m) => <MonthGrid key={m} {...props} month={m} compact />)}
        </div>
    );
}

function monthsBetween(from: string, to: string): string[] {
    const out: string[] = [];
    for (let k = `${from.slice(0, 7)}-01`; k <= to; k = addDays(k, 40).slice(0, 7) + "-01") out.push(k);
    return out;
}

type Block = { kind: "work"; it: DayItem; s: number; e: number; col: number; cols: number } | { kind: "meeting"; m: Meeting; s: number; e: number; col: number; cols: number };

/** Side by side where they overlap, as a calendar app does. */
function placeBlocks(blocks: Block[]): Block[] {
    const sorted = [...blocks].sort((a, b) => a.s - b.s || b.e - a.e);
    let cluster: Block[] = [], ends: number[] = [], clusterEnd = 0;
    const close = () => { for (const b of cluster) b.cols = ends.length; cluster = []; ends = []; };
    for (const b of sorted) {
        if (cluster.length && b.s >= clusterEnd) close();
        let col = ends.findIndex((end) => end <= b.s);
        if (col < 0) { col = ends.length; ends.push(b.e); } else ends[col] = b.e;
        b.col = col;
        cluster.push(b);
        clusterEnd = Math.max(clusterEnd, b.e);
    }
    close();
    return sorted;
}

/** A day to a week as columns of hours: every task and meeting at its real time, coloured by team. */
function TimeGrid({ history: h, from, to, filter, anns, onOpenDay, onEntry }: CalendarProps) {
    const colorOf = teamColors(h);
    const keys = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
    const days = keys.map((k) => dayOf(h, k, filter));
    const hoursIn = (key: string, t: number) => (t - dayStart(key)) / 3_600_000;
    let lo = 8, hi = 18;
    for (const d of days) {
        for (const it of d.items) { lo = Math.min(lo, Math.floor(hoursIn(d.key, it.s))); hi = Math.max(hi, Math.ceil(hoursIn(d.key, it.e))); }
        for (const m of d.meetings) { lo = Math.min(lo, Math.floor(hoursIn(d.key, m.start))); hi = Math.max(hi, Math.ceil(hoursIn(d.key, m.end))); }
    }
    lo = Math.max(0, lo);
    hi = Math.min(24, hi);
    const hours = Array.from({ length: hi - lo }, (_, i) => lo + i);
    const height = (hi - lo) * HOUR_PX;
    const now = h.now, today = dayKey(now);
    const nameOf = (id: number) => h.people.get(id)?.name ?? "Someone";
    const annsOf = (key: string) => anns.filter((a) => dayKey(a.at) === key);
    const teams = [...new Set(days.flatMap((d) => d.items.map((it) => it.entry.team || "Other")))].sort();

    return (
        <div className="hc">
            <div className="hc-scroll">
                <div className="hc-grid" style={{ ["--hc-cols" as string]: keys.length, minWidth: keys.length > 1 ? 60 + keys.length * 128 : undefined }}>
                    <div className="hc-corner" />
                    {days.map((d) => {
                        const p = partsOf(d.key);
                        const label = `${keys.length === 1 ? DAYS_LONG[p.weekday] : DAYS[p.weekday]} ${p.day}`;
                        return (
                            <div key={d.key} className={cx("hc-head", d.key === today && "today", (p.weekday === 0 || p.weekday === 6) && "we")}>
                                {d.worked ? (
                                    <button type="button" className="hc-day" aria-label={`Open day ${fmtDayDateY(d.key)}`} title="See the day in detail" onClick={() => onOpenDay(d.key)}>
                                        <b>{label}</b><Icon name="arrowRight" />
                                    </button>
                                ) : <b className="hc-day plain">{label}</b>}
                                <div className="hc-head-sub mono">{d.minutes ? fmtH(d.minutes) : "-"}{d.people.length > 0 && ` · ${d.people.length} ${d.people.length === 1 ? "person" : "people"}`}</div>
                                {annsOf(d.key).map((a) => <AnnChip key={a.id} ann={a} nameOf={nameOf} />)}
                            </div>
                        );
                    })}

                    <div className="hc-hours" style={{ height }}>
                        {hours.map((hr) => <span key={hr} style={{ top: (hr - lo) * HOUR_PX }}>{fmtHourLabel(hr * 60)}</span>)}
                    </div>
                    {days.map((d) => {
                        const p = partsOf(d.key);
                        const blocks = placeBlocks([
                            ...d.meetings.map((m): Block => ({ kind: "meeting", m, s: m.start, e: m.end, col: 0, cols: 1 })),
                            ...d.items.map((it): Block => ({ kind: "work", it, s: it.s, e: it.e, col: 0, cols: 1 })),
                        ]);
                        return (
                            <div key={d.key} className={cx("hc-col", (p.weekday === 0 || p.weekday === 6) && "we")} style={{ height }}>
                                {hours.map((hr) => <i key={hr} className="hc-line" style={{ top: (hr - lo) * HOUR_PX }} />)}
                                {d.key === today && <i className="hc-now" style={{ top: (hoursIn(d.key, now) - lo) * HOUR_PX }} />}
                                {blocks.map((b) => {
                                    const top = (hoursIn(d.key, b.s) - lo) * HOUR_PX;
                                    const tall = Math.max(20, ((b.e - b.s) / 3_600_000) * HOUR_PX - 2);
                                    const style = { top, height: tall, left: `calc(${(b.col / b.cols) * 100}% + 2px)`, width: `calc(${100 / b.cols}% - 4px)` };
                                    if (b.kind === "meeting") {
                                        return (
                                            <div key={`m${b.m.id}`} className="hc-block mtg" style={style} title={`Meeting ${fmtTime(b.m.start)} – ${fmtTime(b.m.end)}${b.m.topic ? ` · ${b.m.topic}` : ""}`}>
                                                <div className="hc-time mono"><Icon name="calendar" />{fmtTime(b.m.start)}</div>
                                                {tall >= 34 && <div className="hc-what">{b.m.topic || "Meeting"}</div>}
                                            </div>
                                        );
                                    }
                                    const e = b.it.entry;
                                    return (
                                        <div key={`${e.id}:${b.s}`} className="hc-block" style={{ ...style, ["--dc" as string]: colorOf(e.team || "Other") }}
                                            title={`${e.userName} · ${fmtTime(e.start)} – ${fmtTime(e.end)} · ${fmtDur(e.minutes)}\n${e.description}`}
                                            {...clickable(() => onEntry(e.id), "button")}>
                                            <div className="hc-time mono">{fmtTime(b.it.s)} · {fmtDurShort(Math.round((b.it.e - b.it.s) / MIN))}</div>
                                            {tall >= 34 && <div className="hc-who trunc">{firstName(nameOf(e.userId))}</div>}
                                            {tall >= 52 && <div className="hc-what">{e.description || "No description"}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
            {(teams.length > 0 || days.some((d) => d.meetings.length)) && (
                <div className="ds-legend hc-legend">
                    {teams.map((t) => <span key={t}><i style={{ background: colorOf(t) }} />{t}</span>)}
                    {days.some((d) => d.meetings.length) && <span><i className="mtg" />Meeting</span>}
                </div>
            )}
        </div>
    );
}

/** A month as a calendar grid; `compact` keeps only the shading and the hours, for many months at once. */
function MonthGrid({ history: h, from, to, filter, anns, onOpenDay, month, compact }: CalendarProps & { month: string; compact?: boolean }) {
    const p = partsOf(month);
    const monthEnd = addDays(`${addDays(month, 40).slice(0, 7)}-01`, -1);
    const first = startOfWeek(month);
    const weeks = Math.ceil((daysBetween(first, monthEnd) + 1) / 7);
    const keys = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i));
    const today = dayKey(h.now);
    const nameOf = (id: number) => h.people.get(id)?.name ?? "Someone";
    const people = (ids: number[]) => ids.map((id) => ({ id, name: nameOf(id) }));

    return (
        <div className={cx("hc-month", compact && "compact")}>
            {compact && <div className="hc-month-title">{MONTHS_LONG[p.month]} {p.year}</div>}
            <div className="hc-mgrid">
                {keys.slice(0, 7).map((k) => <div key={k} className="hc-wd">{compact ? DAYS[partsOf(k).weekday].slice(0, 1) : DAYS[partsOf(k).weekday]}</div>)}
                {keys.map((k) => {
                    const inMonth = k >= month && k <= monthEnd;
                    const inWindow = inMonth && k >= from && k <= to;
                    if (!inWindow) return <div key={k} className="hc-cell out" />;
                    const d = dayOf(h, k, filter);
                    const lvl = heatLevel(d.minutes, DAY_SCALE);
                    const open = d.worked ? () => onOpenDay(k) : undefined;
                    const tip = `${fmtDayDateY(k)} · ${d.minutes ? `${fmtH(d.minutes)} by ${d.people.length} ${d.people.length === 1 ? "person" : "people"}` : "no work"}`;
                    if (compact) {
                        return (
                            <div key={k} className={cx("hc-cell", `lv${lvl}`, k === today && "today", open && "click")} title={tip}
                                aria-label={open ? `Open day ${fmtDayDateY(k)}` : undefined} {...(open ? clickable(open, "button") : {})}>
                                <span style={lvl ? { color: `var(--on-lv${lvl})` } : undefined}>{partsOf(k).day}</span>
                            </div>
                        );
                    }
                    const items = [...d.items].sort((a, b) => a.s - b.s);
                    const dayAnns = anns.filter((a) => dayKey(a.at) === k);
                    return (
                        <div key={k} className={cx("hc-cell", k === today && "today", open && "click")} title={tip}
                            aria-label={open ? `Open day ${fmtDayDateY(k)}` : undefined} {...(open ? clickable(open, "button") : {})}>
                            <div className="hc-cell-head">
                                <b>{partsOf(k).day}</b>
                                {d.minutes > 0 && <span className={cx("hc-hrs mono", `lv${lvl}`)} style={{ color: `var(--on-lv${lvl})` }}>{fmtH(d.minutes)}</span>}
                            </div>
                            {items.slice(0, 2).map((it) => (
                                <div key={`${it.entry.id}:${it.s}`} className="hc-line-item trunc">
                                    <span className="mono muted">{fmtTime(it.s)}</span> {firstName(nameOf(it.entry.userId))} · {it.entry.description}
                                </div>
                            ))}
                            {items.length > 2 && <div className="hc-more muted">+{items.length - 2} more</div>}
                            <div className="hc-cell-foot">
                                {d.people.length > 0 && <Avatars people={people(d.people)} max={3} size={18} />}
                                {d.meetings.length > 0 && <span className="muted" title={`${d.meetings.length} meeting${d.meetings.length === 1 ? "" : "s"}`}><Icon name="calendar" />{d.meetings.length}</span>}
                                {dayAnns.length > 0 && <span className="hc-flag" title={dayAnns.map((a) => a.kind === "status" ? `Status: ${a.status}` : `Progress ${a.value}%`).join(", ")}><Icon name="flag" /></span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
