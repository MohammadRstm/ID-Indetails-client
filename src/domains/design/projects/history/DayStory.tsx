import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PersonAvatar, PersonName, Avatars } from "@/shared/components/Identity/People";
import Modal from "@/shared/components/Overlays/Modal";
import { dayKey, fmtDayDateY, fmtDur, fmtHourLabel, fmtTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { meetingTitle } from "../../../shared/meetings/meetingsApi";
import { dayStart, type Day, type DayItem, type History, type Meeting } from "./history";
import { firstName, list } from "./words";

/*
 * One day of a project as a horizontal card timeline (the prototype's UI.DayStory): one swimlane per team,
 * in the order each picked the work up; every task a card at its real start; work at the same time stacks;
 * meetings in their own lane. A strip above tells the day in stages.
 */

const MIN = 60_000;
const HOUR_PX = 190;
const LABEL_W = 168;
const CARD_MIN = 204;
const ROW_H = 96, ROW_GAP = 8;

const TEAM_COLORS: Record<string, string> = { Engineering: "#3B82F6", Design: "#A855F7", Platform: "#F97316", Data: "#10B981", Marketing: "#EC4899", Operations: "#EAB308" };
const PALETTE = ["#3B82F6", "#A855F7", "#F97316", "#10B981", "#EC4899", "#EAB308", "#14B8A6", "#6366F1", "#84CC16", "#F43F5E"];

/**
 * One colour per team, the same on every day of the project: the prototype's named ones where they
 * apply, then the palette in the order of the teams' names, so two teams never share one.
 */
function teamColors(h: History): (team: string) => string {
    const teams = [...new Set([...h.people.values()].map((p) => p.role || "Other"))].sort();
    const free = PALETTE.filter((c) => !teams.some((t) => TEAM_COLORS[t] === c));
    const map = new Map<string, string>();
    let i = 0;
    for (const t of teams) map.set(t, TEAM_COLORS[t] ?? free[i++ % free.length]);
    return (team) => map.get(team) ?? PALETTE[PALETTE.length - 1];
}

type Item = DayItem & { team: string; name: string };
type Card<T> = { it: T; x: number; trueW: number; w: number; row: number };
type Stage = { sig: string; start: number; end: number; teams: string[]; people: number[]; meetings: Meeting[]; idle: boolean };

/** Cards that overlap on screen go on separate rows of their lane. */
function pack<T>(cards: Card<T>[]): number {
    const rows: number[] = [];
    for (const c of cards) {
        let r = 0;
        while (r < rows.length && rows[r] + 10 > c.x) r++;
        rows[r] = c.x + c.w;
        c.row = r;
    }
    return Math.max(1, rows.length);
}

/** The day cut wherever someone starts or stops, or a meeting begins or ends; neighbours with the same mix merge. */
function stagesOf(items: Item[], meetings: Meeting[]): Stage[] {
    const cuts = [...new Set([...items.flatMap((it) => [it.s, it.e]), ...meetings.flatMap((m) => [m.start, m.end])])].sort((a, b) => a - b);
    const out: Stage[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1];
        if (b - a < MIN) continue;
        const on = items.filter((it) => it.s < b && it.e > a);
        const mt = meetings.filter((m) => m.start < b && m.end > a);
        const teams = [...new Set(on.map((it) => it.team))];
        const people = [...new Set(on.map((it) => it.entry.userId))];
        const sig = `${[...teams].sort().join("|")}#${mt.map((m) => m.id).join("|")}`;
        const last = out[out.length - 1];
        if (last && last.sig === sig && last.end === a) {
            last.end = b;
            for (const id of people) if (!last.people.includes(id)) last.people.push(id);
        } else out.push({ sig, start: a, end: b, teams, people, meetings: mt, idle: !teams.length && !mt.length });
    }
    // a pause shorter than 10 minutes between two stages is noise, not a stage
    return out.filter((s, i) => !(s.idle && s.end - s.start < 10 * MIN && i > 0 && i < out.length - 1));
}

function layout(day: Day, h: History) {
    const teamColor = teamColors(h);
    const items: Item[] = day.items
        .map((it) => ({ ...it, team: it.entry.team || "Other", name: h.people.get(it.entry.userId)?.name ?? it.entry.userName }))
        .sort((a, b) => a.s - b.s || a.e - b.e);
    const meetings = [...day.meetings].sort((a, b) => a.start - b.start);
    const base = dayStart(day.key);
    const hoursOf = (t: number) => (t - base) / 3_600_000;
    let lo = 24, hi = 0;
    for (const it of items) { lo = Math.min(lo, hoursOf(it.s)); hi = Math.max(hi, hoursOf(it.e)); }
    for (const m of meetings) { lo = Math.min(lo, hoursOf(m.start)); hi = Math.max(hi, hoursOf(m.end)); }
    if (lo > hi) { lo = 9; hi = 17; }
    lo = Math.max(0, Math.floor(lo));
    hi = Math.min(24, Math.ceil(hi));
    if (hi - lo < 4) {
        const pad = 4 - (hi - lo);
        lo = Math.max(0, lo - Math.floor(pad / 2));
        hi = Math.min(24, lo + 4);
    }
    const from = base + lo * 3_600_000;
    const X = (t: number) => ((t - from) / 3_600_000) * HOUR_PX;

    // teams in the order they first picked the project up that day
    const teams: { name: string; color: string; items: Item[]; people: number[]; cards: Card<Item>[]; rows: number }[] = [];
    for (const it of items) {
        let t = teams.find((x) => x.name === it.team);
        if (!t) teams.push((t = { name: it.team, color: teamColor(it.team), items: [], people: [], cards: [], rows: 1 }));
        t.items.push(it);
        if (!t.people.includes(it.entry.userId)) t.people.push(it.entry.userId);
    }
    for (const t of teams) {
        t.cards = t.items.map((it) => {
            const x = X(it.s), trueW = Math.max(2, X(it.e) - x);
            return { it, x, trueW, w: Math.max(CARD_MIN, trueW), row: 0 };
        });
        t.rows = pack(t.cards);
    }
    const mCards: Card<Meeting>[] = meetings.map((m) => {
        const x = X(m.start), trueW = Math.max(2, X(m.end) - x);
        return { it: m, x, trueW, w: Math.max(CARD_MIN, trueW), row: 0 };
    });
    const mRows = mCards.length ? pack(mCards) : 0;
    return { items, meetings, teams, mCards, mRows, lo, hi, X, width: (hi - lo) * HOUR_PX, stages: stagesOf(items, meetings), teamColor };
}

type DayStoryProps = { history: History; projectTitle: string; dayKey: string; onEntry: (id: number) => void; onClose: () => void };

export default function DayStory({ history: h, projectTitle, dayKey: initial, onEntry, onClose }: DayStoryProps) {
    const days = h.days;
    const [key, setKey] = useState(initial);
    const idx = days.findIndex((d) => d.key === key);
    const day = days[idx];
    const scrollRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ l: false, r: false });

    function measure() {
        const el = scrollRef.current;
        if (!el) return;
        const l = el.scrollLeft > 4, r = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
        setEdges((o) => (o.l === l && o.r === r ? o : { l, r }));
    }
    const by = (dir: number) => {
        const el = scrollRef.current;
        if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.7), behavior: "smooth" });
    };

    // a new day starts at its first piece of work
    useLayoutEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = 0;
        if (flowRef.current) flowRef.current.scrollLeft = 0;
    }, [key]);
    // the fades at either edge follow the canvas's size as well as the scrolling
    useEffect(() => {
        const ro = new ResizeObserver(() => measure());
        if (scrollRef.current) ro.observe(scrollRef.current);
        if (canvasRef.current) ro.observe(canvasRef.current);
        return () => ro.disconnect();
    }, []);
    // ← → move sideways, unless typing or another window is on top
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = (e.target as HTMLElement | null)?.tagName;
            if (t === "INPUT" || t === "TEXTAREA" || document.querySelectorAll(".scrim").length > 1) return;
            if (e.key === "ArrowRight") { by(1); e.preventDefault(); }
            if (e.key === "ArrowLeft") { by(-1); e.preventDefault(); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    // drag the empty canvas to pan in any direction, like a map; cards and links keep their clicks
    function onDown(e: ReactPointerEvent<HTMLDivElement>) {
        const el = scrollRef.current;
        if (!el || e.button !== 0 || (e.target as HTMLElement).closest(".ds-card, .ds-lane-label, a, button")) return;
        let v: HTMLElement | null = el.parentElement;
        while (v && v !== document.body && !(v.scrollHeight > v.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(v).overflowY))) v = v.parentElement;
        const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, v: v && v !== document.body ? v : null, top: v ? v.scrollTop : 0 };
        el.classList.add("grabbing");
        const move = (ev: PointerEvent) => {
            el.scrollLeft = start.left - (ev.clientX - start.x);
            if (start.v) start.v.scrollTop = start.top - (ev.clientY - start.y);
        };
        const up = () => {
            el.classList.remove("grabbing");
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }

    if (!day) return null;
    const L = layout(day, h);
    const nameOf = (id: number) => h.people.get(id)?.name ?? "Someone";
    const total = L.items.reduce((s, it) => s + Math.round((it.e - it.s) / MIN), 0);
    const people = [...new Set(L.items.map((it) => it.entry.userId))];
    let peak = 0;
    for (const s of L.stages) peak = Math.max(peak, L.items.filter((it) => it.s < s.end && it.e > s.start).length);
    const now = h.now, isToday = dayKey(now) === day.key;
    const ticks = Array.from({ length: L.hi - L.lo + 1 }, (_, i) => L.lo + i);
    const canvasW = LABEL_W + L.width + 40;
    const laneHeight = (rows: number) => rows * ROW_H + (rows - 1) * ROW_GAP + 20;
    const marks: { t: number; x: number; label: boolean }[] = [];
    let lastX = -1e9;
    L.stages.forEach((s, i) => {
        if (!i || s.idle) return;
        const x = L.X(s.start);
        const label = x - lastX >= 74;
        marks.push({ t: s.start, x, label });
        if (label) lastX = x;
    });
    const first = L.items.length ? L.items[0].s : null;
    const last = L.items.reduce<number | null>((m, it) => (m == null || it.e > m ? it.e : m), null);
    const goTo = (t: number) => scrollRef.current?.scrollTo({ left: Math.max(0, L.X(t) - 60), behavior: "smooth" });

    const nav = (
        <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" disabled={idx <= 0} aria-label="Previous day with activity" title="Previous day" onClick={() => setKey(days[idx - 1].key)}><Icon name="chevronLeft" /></button>
            <button className="icon-btn" disabled={idx >= days.length - 1} aria-label="Next day with activity" title="Next day" onClick={() => setKey(days[idx + 1].key)}><Icon name="chevronRight" /></button>
        </div>
    );

    return (
        <Modal size="xl ds-modal" flush onClose={onClose} headTools={nav} title={fmtDayDateY(day.key)}
            sub={
                <span>
                    {projectTitle} · <b className="mono">{fmtDur(total)}</b> logged by {people.length} {people.length === 1 ? "person" : "people"}{" "}
                    across {L.teams.length} {L.teams.length === 1 ? "department" : "departments"}
                    {L.meetings.length ? ` · ${L.meetings.length} meeting${L.meetings.length === 1 ? "" : "s"}` : ""}
                </span>
            }>
            <div className="ds">
                <div className="ds-facts">
                    {first != null && <span><span className="muted">First work</span> <b className="mono">{fmtTime(first)}</b></span>}
                    {last != null && <span><span className="muted">Last work ended</span> <b className="mono">{fmtTime(last)}</b></span>}
                    {peak >= 2 && <span><span className="muted">Busiest</span> <b>{peak} tasks at once</b></span>}
                    <span className="grow" />
                    <span className="ds-legend">
                        {L.teams.map((t) => <span key={t.name}><i style={{ background: t.color }} />{t.name}</span>)}
                        {L.meetings.length > 0 && <span><i className="mtg" />Meeting</span>}
                    </span>
                </div>

                {L.stages.length > 0 && (
                    <div className="ds-flow-wrap">
                        <div className="ds-flow-title">How the day moved</div>
                        <div className="ds-flow" ref={flowRef}>
                            {L.stages.map((s, i) => (
                                <span key={s.start} style={{ display: "contents" }}>
                                    {i > 0 && <span className="ds-arrow"><Icon name="arrowRight" /></span>}
                                    <button type="button" className={cx("ds-stage", s.idle && "idle", s.meetings.length > 0 && !s.teams.length && "mtg")} onClick={() => goTo(s.start)} title="Show this part of the day">
                                        <div className="ds-stage-time mono">{fmtTime(s.start)} – {fmtTime(s.end)} <span className="muted">· {fmtDur(Math.round((s.end - s.start) / MIN))}</span></div>
                                        <div className="ds-stage-what">
                                            {s.idle && <span className="muted">No one working</span>}
                                            {s.teams.map((t, j) => (
                                                <span key={t} className="ds-dep">{j > 0 && <span className="ds-plus">+</span>}<i style={{ background: L.teamColor(t) }} /><b>{t}</b></span>
                                            ))}
                                            {s.meetings.map((m) => (
                                                <span key={m.id} className="ds-dep">{s.teams.length > 0 && <span className="ds-plus">+</span>}<Icon name="calendar" /><b>Meeting</b></span>
                                            ))}
                                        </div>
                                        <div className="ds-stage-sub muted">
                                            {s.teams.length > 1 && <span className="ds-par">At the same time</span>}
                                            {s.people.length > 0 && <span className="trunc">{list(s.people.map((id) => firstName(nameOf(id))))}</span>}
                                            {!s.people.length && s.meetings.length > 0 && <span className="trunc">{meetingTitle({ startsAt: new Date(s.meetings[0].start).toISOString() })}</span>}
                                        </div>
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className={cx("ds-view", edges.l && "fade-l", edges.r && "fade-r")}>
                    <button className="ds-edge l" aria-label="Earlier" onClick={() => by(-1)} tabIndex={-1}><Icon name="chevronLeft" /></button>
                    <button className="ds-edge r" aria-label="Later" onClick={() => by(1)} tabIndex={-1}><Icon name="chevronRight" /></button>
                    <div className="ds-scroll" ref={scrollRef} onScroll={measure} onPointerDown={onDown}>
                        <div className="ds-canvas" ref={canvasRef} style={{ width: canvasW }}>
                            <div className="ds-ruler">
                                <div className="ds-lane-label ds-ruler-label muted">Time</div>
                                <div className="ds-ruler-track" style={{ width: L.width }}>
                                    {ticks.map((hr) => <span key={hr} style={{ left: (hr - L.lo) * HOUR_PX }}>{fmtHourLabel(hr * 60)}</span>)}
                                    {marks.filter((m) => m.label).map((m) => <b key={`m${m.t}`} className="ds-ruler-mark mono" style={{ left: m.x }}>{fmtTime(m.t)}</b>)}
                                </div>
                            </div>

                            <div className="ds-lanes">
                                <div className="ds-grid" style={{ left: LABEL_W, width: L.width }}>
                                    {ticks.map((hr) => <i key={hr} style={{ left: (hr - L.lo) * HOUR_PX }} />)}
                                    {marks.map((m) => <i key={`s${m.t}`} className="stage" style={{ left: m.x }} />)}
                                    {isToday && now > dayStart(day.key) && L.X(now) < L.width && <i className="now" style={{ left: L.X(now) }}><b>Now</b></i>}
                                </div>

                                {L.mCards.length > 0 && (
                                    <div className="ds-lane ds-lane-mtg" style={{ height: laneHeight(L.mRows) }}>
                                        <div className="ds-lane-label">
                                            <div className="ds-lane-name"><Icon name="calendar" />Meetings</div>
                                            <div className="muted">{L.meetings.length} scheduled</div>
                                        </div>
                                        <div className="ds-lane-body" style={{ width: L.width }}>
                                            {L.mCards.map((c) => (
                                                <div key={c.it.id} className="ds-card ds-mtg" style={{ left: c.x, width: c.w, top: c.row * (ROW_H + ROW_GAP), height: ROW_H }}
                                                    title={meetingTitle({ startsAt: new Date(c.it.start).toISOString() })}>
                                                    <div className="ds-card-time mono"><Icon name="calendar" className="ds-ic" />{fmtTime(c.it.start)} – {fmtTime(c.it.end)}
                                                        <span className="ds-card-dur">{fmtDur(Math.round((c.it.end - c.it.start) / MIN))}</span></div>
                                                    <div className="ds-card-task"><b>{meetingTitle({ startsAt: new Date(c.it.start).toISOString() })}</b></div>
                                                    <div className="ds-card-who muted">{c.it.topic ? `Topic: ${c.it.topic}` : "Meeting"}</div>
                                                    <span className="ds-true" style={{ width: Math.min(c.trueW, c.w) }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {L.teams.map((t) => (
                                    <div key={t.name} className="ds-lane" style={{ height: laneHeight(t.rows), ["--dc" as string]: t.color }}>
                                        <div className="ds-lane-label">
                                            <div className="ds-lane-name"><i style={{ background: t.color }} />{t.name}</div>
                                            <div className="muted trunc">{t.people.length} {t.people.length === 1 ? "person" : "people"}</div>
                                            <Avatars people={t.people.map((id) => ({ id, name: nameOf(id) }))} max={4} size={18} link />
                                        </div>
                                        <div className="ds-lane-body" style={{ width: L.width }}>
                                            {t.cards.map((c) => {
                                                const e = c.it.entry;
                                                return (
                                                    <div key={`${e.id}:${c.it.s}`} className="ds-card" role="button" tabIndex={0}
                                                        style={{ left: c.x, width: c.w, top: c.row * (ROW_H + ROW_GAP), height: ROW_H, ["--dc" as string]: t.color }}
                                                        title={`${e.description} - open the entry`} onClick={() => onEntry(e.id)} onKeyDown={(ev) => { if (ev.key === "Enter") onEntry(e.id); }}>
                                                        <div className="ds-card-time mono">
                                                            {c.it.continued && <span className="ds-cont" title="Started the day before">↤</span>}
                                                            {fmtTime(e.start)} – {fmtTime(e.end)}
                                                            <span className="ds-card-dur">{fmtDur(e.minutes)}</span>
                                                        </div>
                                                        <div className="ds-card-task">{e.description || "No description"}</div>
                                                        <div className="ds-card-who">
                                                            <PersonAvatar person={{ id: e.userId, name: c.it.name }} size={18} />
                                                            <span className="trunc"><PersonName person={{ id: e.userId, name: c.it.name }} /></span>
                                                        </div>
                                                        <span className="ds-true" style={{ width: Math.min(c.trueW, c.w) }} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {!L.teams.length && !L.mCards.length && <div className="empty" style={{ padding: 30 }}><h4>Nothing on this day</h4></div>}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="ds-hint muted">Drag the empty space to move around in any direction, or move sideways with Shift + mouse wheel, a trackpad swipe, the arrows or the ← → keys. Click a task to open it; click a stage to jump to it.</div>
            </div>
        </Modal>
    );
}
