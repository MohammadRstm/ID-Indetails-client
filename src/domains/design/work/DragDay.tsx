import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import ContextMenu from "@/shared/components/Overlays/ContextMenu";
import { tip } from "@/shared/components/Overlays/tip";
import { dayKey, fmtDur, fmtHourLabel, fmtRange, fmtTime, minutesOfDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useCanChangeMeeting } from "../../shared/meetings/meetingsApi";
import { checkLog, clamp, companyNow, DAY, dayText, isoAt, movesFor, rangeFor, spanOn, wholeOn, workHoursOf, type Moves, type Span } from "./day";
import DayTrack, { type TrackEntry, type TrackMeeting } from "./DayTrack";
import { BOX, dayModel, type Block, type DayTask, type Stuck } from "./dragModel";
import { useDeleteEntry, useDomainSettings, useMyDay, useMySchedule, useOvertimeFor, useResizeMeeting, useRestoreEntry } from "./workApi";

type Mode = "draw" | "l" | "r" | "move" | "task-press" | "task" | "task-l" | "task-r" | "mtg-l" | "mtg-r";

/** What is being dragged, and where it is so far. */
type Drag = {
    mode: Mode;
    s: number;
    e: number;
    swaps: Moves;
    id?: number;
    // drawing a new box
    a?: number;
    cur?: number;
    lo?: number;
    hi?: number;
    fromTask?: boolean;
    // carrying
    grab?: number;
    m0?: number;
    lastSwap?: number | null;
    // pushing
    swaps0?: Moves;
    base?: Block[];
    box?: Span | null;
    // a meeting's ends
    s0?: number;
    e0?: number;
    stuck?: Stuck;
};

type DragDayProps = {
    date: string;
    startMin: number;
    duration: number;
    projectId: number | null;
    /** The entry being edited: left off the timeline, drawn as the box instead. */
    ignoreId?: number | null;
    /** Logged tasks the box traded places with, or pushed along: saved with the log. */
    swaps: Moves;
    onChange: (startMin: number, duration: number, swaps?: Moves) => void;
};

/**
 * The one way to pick a time on a timeline, wherever work is logged (the prototype's UI.DragDay). Press on
 * free time and drag to draw the entry; pressing on a logged task starts it where that task ends. Logged
 * tasks can be moved and resized (pushing their neighbours), and meetings' ends dragged. A logged task is
 * deleted from its right-click menu, or by selecting it (double-click, or Enter) and pressing Delete.
 */
export default function DragDay({ date, startMin, duration, projectId, ignoreId, swaps, onChange }: DragDayProps) {
    const { today, minute: nowMin } = companyNow();
    const isToday = date === today;
    const day = useMyDay(date);
    const schedule = useMySchedule(date);
    const settings = useDomainSettings("design").data;
    const remove = useDeleteEntry();
    const restore = useRestoreEntry();
    const resize = useResizeMeeting();
    const canChangeMeeting = useCanChangeMeeting();
    const [drag, setDrag] = useState<Drag | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    const scheduleDay = schedule.data?.day;
    const workHours = workHoursOf(scheduleDay);
    const list = (day.data?.entries ?? []).filter((e) => e.id !== ignoreId);
    const tasks: DayTask[] = list.map((e) => ({ id: e.id, span: spanOn(e, date), whole: wholeOn(e, date), locked: !e.canEdit }));

    const taskMode = drag != null && (drag.mode === "task" || drag.mode === "task-l" || drag.mode === "task-r");
    const mtgMode = drag != null && (drag.mode === "mtg-l" || drag.mode === "mtg-r");
    let live: Moves = drag ? drag.swaps : swaps;
    if (taskMode) live = { ...live, [drag.id!]: { s: drag.s, e: drag.e } };

    // the day's meetings ride along the top; they don't block logging, and their ends can be dragged
    const meetings = (day.data?.meetings ?? []).map((m) => {
        const s0 = dayKey(m.startsAt) === date ? minutesOfDay(m.startsAt) : 0;
        const e0 = dayKey(m.endsAt) === date ? minutesOfDay(m.endsAt) || DAY : DAY;
        const x = { m, s: s0, e: e0, s0, e0 };
        if (mtgMode && drag.id === m.id) Object.assign(x, { s: drag.s, e: drag.e });
        return x;
    });

    let r = rangeFor(tasks.map((t) => t.span), [7 * 60, 21 * 60]);
    for (const x of meetings) r = [Math.min(r[0], Math.floor(x.s0 / 60) * 60), Math.max(r[1], Math.ceil(x.e0 / 60) * 60)];
    // keep the entry being edited in view, even at 6 AM or late at night
    r = [Math.min(r[0], Math.floor(startMin / 60) * 60), Math.max(r[1], Math.min(DAY, Math.ceil((startMin + duration) / 60) * 60))];
    const limit = isToday && !settings?.allowFutureEntries ? Math.min(nowMin, r[1]) : r[1];
    const selNow = { s: startMin, e: startMin + duration };
    const model = dayModel({ tasks, range: r, limit, workHours, box: duration > 0 ? selNow : null, live });
    const { spans, WD } = model;

    function rawMin(ev: { clientX: number }) {
        const rect = trackRef.current!.getBoundingClientRect();
        const f = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        return r[0] + f * (r[1] - r[0]);
    }

    function removeTask(id: number) {
        const e = list.find((x) => x.id === id);
        if (!e) return;
        if (!e.canEdit) {
            toast({ text: "That log can no longer be changed", sub: "It is past the edit window set by your admin.", icon: "lock" });
            return;
        }
        tip.hide();
        setSelected(null);
        remove.mutate(id, {
            onSuccess: () => toast({
                text: `Deleted “${e.description}”`, sub: `${fmtRange(e.startedAt, e.endedAt)} · ${fmtDur(e.minutes)}`, icon: "trash",
                actionLabel: "Undo", action: () => restore.mutate(id),
            }),
            onError: (err) => toast({ text: "That log wasn't deleted", sub: errorMessage(err), icon: "alert" }),
        });
        if (swaps[id]) {
            const rest = { ...swaps };
            delete rest[id];
            onChange(startMin, duration, rest);
        }
        // keep the keyboard somewhere sensible: the next task, or the new log
        setTimeout(() => {
            const el = trackRef.current?.querySelector<HTMLElement>("[data-eid]") ?? trackRef.current?.querySelector<HTMLElement>(".dt-sel");
            el?.focus();
        }, 0);
    }

    function resizeMeeting(id: number, s0: number, e0: number, s1: number, e1: number) {
        if (s0 === s1 && e0 === e1) return;
        const m = meetings.find((x) => x.m.id === id)?.m;
        if (!m) return;
        const save = (s: number, e: number) => ({ id, body: { topic: m.topic, description: m.description, startsAt: isoAt(date, s), endsAt: isoAt(date, e) } });
        resize.mutate(save(s1, e1), {
            onSuccess: () => toast({
                text: `Meeting now ${fmtRange(isoAt(date, s1), isoAt(date, e1))}`, sub: `${m.topic || "Meeting"} · ${fmtDur(e1 - s1)}`, icon: "calendar",
                actionLabel: "Undo", action: () => resize.mutate(save(s0, e0)),
            }),
            onError: (err) => toast({ text: "The meeting didn't move", sub: errorMessage(err), icon: "alert" }),
        });
    }

    function commitTask(d: Drag) {
        const mv = { ...d.swaps };
        const original = tasks.find((t) => t.id === d.id)!.span;
        if (original.s === d.s && original.e === d.e) delete mv[d.id!];
        else mv[d.id!] = { s: d.s, e: d.e };
        onChange(startMin, duration, mv);
    }

    /** The editable logged task an event happened on. */
    const taskOf = (target: EventTarget) => (target as HTMLElement).closest<HTMLElement>("[data-eid]");

    function select(ev: MouseEvent<HTMLDivElement>) {
        const el = taskOf(ev.target);
        if (!el) return;
        setSelected(Number(el.getAttribute("data-eid")));
        el.focus();
    }

    function openMenu(ev: MouseEvent<HTMLDivElement>) {
        const el = taskOf(ev.target);
        if (!el) return;
        ev.preventDefault();
        tip.hide();
        setMenu({ id: Number(el.getAttribute("data-eid")), x: ev.clientX, y: ev.clientY });
    }

    // the selection goes with the focus, so Delete never removes a task the person has moved away from
    function blur(ev: FocusEvent<HTMLDivElement>) {
        if (selected == null) return;
        const next = ev.relatedTarget as HTMLElement | null;
        if (!next || Number(taskOf(next)?.getAttribute("data-eid")) !== selected) setSelected(null);
    }

    function down(ev: PointerEvent<HTMLDivElement>) {
        if (ev.button !== 0) return;
        const t = ev.target as HTMLElement;
        if (selected != null && Number(taskOf(t)?.getAttribute("data-eid")) !== selected) setSelected(null);
        const handle = t.closest("[data-h]");
        const onBox = t.closest(".dt-sel");
        // an end of a meeting: resize the meeting
        const mh = t.closest("[data-mh]");
        if (mh) {
            ev.preventDefault();
            ev.currentTarget.setPointerCapture?.(ev.pointerId);
            const id = Number(mh.closest("[data-mid]")!.getAttribute("data-mid"));
            const mm = meetings.find((x) => x.m.id === id);
            if (mm) setDrag({ mode: mh.getAttribute("data-mh") === "l" ? "mtg-l" : "mtg-r", id, s: mm.s, e: mm.e, s0: mm.s, e0: mm.e, swaps });
            return;
        }
        // no capture: the drag still works while the pointer stays on the track
        ev.currentTarget.setPointerCapture?.(ev.pointerId);
        const m = rawMin(ev);
        // an edge of a logged task: stretch or shrink it
        const inTask = handle?.closest("[data-eid]");
        if (handle && inTask) {
            const id = Number(inTask.getAttribute("data-eid"));
            const sp = spans.find((x) => x.id === id);
            if (sp && sp.whole && !sp.locked) {
                setDrag({ mode: handle.getAttribute("data-h") === "l" ? "task-l" : "task-r", id, s: sp.s, e: sp.e, swaps, swaps0: swaps, base: model.blocksNow(swaps), box: null });
            }
            return;
        }
        // an edge of the box
        if (handle && duration > 0) {
            setDrag({ mode: handle.getAttribute("data-h") === "l" ? "l" : "r", s: selNow.s, e: selNow.e, swaps, swaps0: swaps, base: model.blocksNow(swaps) });
            return;
        }
        // the box itself: carry it along
        if (onBox && duration > 0) {
            setDrag({ mode: "move", grab: m - selNow.s, s: selNow.s, e: selNow.e, swaps, lastSwap: null });
            return;
        }
        // a logged task: dragging moves it; a plain click starts the new box after it
        const onTask = t.closest("[data-eid]");
        if (onTask) {
            const id = Number(onTask.getAttribute("data-eid"));
            const sp = spans.find((x) => x.id === id);
            if (sp && sp.whole && !sp.locked) {
                setDrag({ mode: "task-press", id, m0: m, grab: m - sp.s, s: sp.s, e: sp.e, swaps });
                return;
            }
        }
        // anywhere else: draw a new box
        const pressed = model.magnet(m), a = model.anchorAt(pressed), g = model.gapAround(a);
        if (a >= limit || g[1] - a < 5) {
            toast({
                text: a >= limit ? (a === pressed ? "That time hasn't happened yet" : "That task runs up to now - nothing to add after it yet") : "There is no free time right after that task",
                icon: "info",
            });
            return;
        }
        setDrag({ mode: "draw", s: 0, e: 0, a, cur: a, lo: a === pressed ? g[0] : a, hi: g[1], fromTask: a !== pressed, swaps });
    }

    function move(ev: PointerEvent<HTMLDivElement>) {
        if (!drag) return;
        const m = rawMin(ev), d = drag;
        const st = d.stuck ?? {};
        let next: Drag | null = null;
        if (d.mode === "draw") {
            const sd = model.stickTo(st.cur, m, model.edgesOf(spans));
            next = { ...d, cur: clamp(sd.v, d.lo!, d.hi!), stuck: { cur: sd.stuck } };
        } else if (d.mode === "l" || d.mode === "r") {
            // resizing pushes neighbours, so only the working day's edges hold it
            const sr = model.stickTo(st.edge, m, WD);
            const rb = model.pushEdge(d.base!, BOX, d.mode, sr.v);
            next = { ...d, stuck: { edge: sr.stuck } };
            if (rb) Object.assign(next, { s: rb.s, e: rb.e, swaps: model.withPush(d.swaps0!, rb).swaps });
        } else if (d.mode === "move") {
            const bm = model.stickBlock(st, m - d.grab!, d.e - d.s, model.edgesOf(model.spansWith(d.swaps)));
            const dm = { ...d, stuck: bm.stuck };
            const moved = model.carry({ grab: d.grab!, s: d.s, e: d.e, swaps: d.swaps, lastSwap: d.lastSwap ?? null }, bm.want + d.grab!, true);
            next = moved ? { ...dm, ...moved } : dm;
        } else if (d.mode === "task-press" || d.mode === "task") {
            if (d.mode === "task-press" && Math.abs(m - d.m0!) < 5) return;
            const tm = model.stickBlock(st, m - d.grab!, d.e - d.s, [...WD, ...model.obstaclesFor(d.id!, d.swaps).flatMap((x) => [x.s, x.e])]);
            const dt: Drag = { ...d, mode: "task", stuck: tm.stuck };
            const moved = model.carryTask({ id: d.id!, grab: d.grab!, s: d.s, e: d.e, swaps: d.swaps }, tm.want + d.grab!, true);
            next = moved ? { ...dt, ...moved } : dt;
        } else if (d.mode === "mtg-l" || d.mode === "mtg-r") {
            const sm = model.stickTo(st.edge, m, WD);
            const nm = d.mode === "mtg-l" ? { s: clamp(sm.v, r[0], d.e - 5), e: d.e } : { s: d.s, e: clamp(sm.v, d.s + 5, r[1]) };
            next = { ...d, ...nm, stuck: { edge: sm.stuck } };
        } else if (d.mode === "task-l" || d.mode === "task-r") {
            const sk = model.stickTo(st.edge, m, WD);
            const rt = model.pushEdge(d.base!, d.id!, d.mode === "task-l" ? "l" : "r", sk.v);
            next = { ...d, stuck: { edge: sk.stuck } };
            if (rt) {
                const wt = model.withPush(d.swaps0!, rt);
                Object.assign(next, { s: rt.s, e: rt.e, swaps: wt.swaps, box: wt.box });
            }
        }
        if (next) setDrag(next);
    }

    function up() {
        if (!drag) return;
        const d = drag;
        setDrag(null);
        if (d.mode === "mtg-l" || d.mode === "mtg-r") return resizeMeeting(d.id!, d.s0!, d.e0!, d.s, d.e);
        if (d.mode === "task-press") {
            // a click, not a drag: the new box goes right after this task, keeping its length where it fits
            const ga = model.gapAround(d.e);
            if (d.e < limit && ga[1] - d.e >= 5) onChange(d.e, Math.max(5, Math.min(duration || 60, ga[1] - d.e)), d.swaps);
            else toast({ text: d.e >= limit ? "That task runs up to now, so there is nothing to add after it yet" : "There is no free time right after that task", icon: "info" });
            return;
        }
        if (d.mode === "task") return commitTask(d);
        if (d.mode === "task-l" || d.mode === "task-r") {
            const sw = { ...d.swaps, [d.id!]: { s: d.s, e: d.e } };
            return onChange(d.box ? d.box.s : startMin, d.box ? d.box.e - d.box.s : duration, model.tidy(sw));
        }
        if (d.mode === "l" || d.mode === "r") return onChange(d.s, d.e - d.s, model.tidy(d.swaps));
        if (d.mode === "draw") {
            const s = Math.min(d.a!, d.cur!), e = Math.max(d.a!, d.cur!);
            if (e - s >= 5) onChange(s, e - s, d.swaps);
            // a click on a task without dragging: the next log starts right after it
            else if (d.fromTask) onChange(d.a!, Math.max(5, Math.min(duration, d.hi! - d.a!)), d.swaps);
            return;
        }
        onChange(d.s, d.e - d.s, d.swaps);
    }

    // Keyboard: Tab to the box or a logged task, then ← → move it five minutes (Ctrl: fifteen);
    // Shift + ← → changes its end, Alt + ← → its start. Enter selects a logged task and Delete removes it.
    function key(ev: KeyboardEvent<HTMLDivElement>) {
        const k = ev.key, t = ev.target as HTMLElement;
        const mEl = t.closest("[data-mid]");
        if (mEl) {
            if ((k !== "ArrowLeft" && k !== "ArrowRight") || !(ev.shiftKey || ev.altKey)) return;
            ev.preventDefault();
            const mx = meetings.find((x) => x.m.id === Number(mEl.getAttribute("data-mid")));
            if (!mx) return;
            const stp = (k === "ArrowRight" ? 1 : -1) * (ev.ctrlKey || ev.metaKey ? 15 : 5);
            if (ev.shiftKey) resizeMeeting(mx.m.id, mx.s, mx.e, mx.s, clamp(mx.e + stp, mx.s + 5, r[1]));
            else resizeMeeting(mx.m.id, mx.s, mx.e, clamp(mx.s + stp, r[0], mx.e - 5), mx.e);
            return;
        }
        if (k === "Enter" || k === " ") {
            const el = taskOf(t);
            if (el) {
                ev.preventDefault();
                setSelected(Number(el.getAttribute("data-eid")));
            }
            return;
        }
        if (k === "Delete" || k === "Backspace") {
            const id = Number(taskOf(t)?.getAttribute("data-eid"));
            if (id && id === selected) {
                ev.preventDefault();
                removeTask(id);
            }
            return;
        }
        if (k !== "ArrowLeft" && k !== "ArrowRight") return;
        const step = (k === "ArrowRight" ? 1 : -1) * (ev.ctrlKey || ev.metaKey ? 15 : 5);
        const kind = ev.shiftKey ? "end" : ev.altKey ? "start" : "move";
        const taskEl = t.closest("[data-eid]");
        if (taskEl) {
            const id = Number(taskEl.getAttribute("data-eid"));
            const sp = spans.find((x) => x.id === id);
            if (!sp || !sp.whole || sp.locked) return;
            ev.preventDefault();
            if (kind === "move") {
                const n = model.carryTask({ id, grab: 0, s: sp.s, e: sp.e, swaps }, sp.s + step, true);
                if (n) commitTask({ mode: "task", id, swaps, ...n });
                return;
            }
            const rk = model.pushEdge(model.blocksNow(swaps), id, kind === "start" ? "l" : "r", (kind === "start" ? sp.s : sp.e) + step);
            if (!rk) return;
            const wk = model.withPush(swaps, rk);
            wk.swaps[id] = { s: rk.s, e: rk.e };
            onChange(wk.box ? wk.box.s : startMin, wk.box ? wk.box.e - wk.box.s : duration, model.tidy(wk.swaps));
            return;
        }
        if (!t.closest(".dt-sel") || !(duration > 0)) return;
        ev.preventDefault();
        if (kind === "move") {
            const n = model.carry({ grab: 0, s: selNow.s, e: selNow.e, swaps, lastSwap: null }, selNow.s + step, true);
            if (n) onChange(n.s, n.e - n.s, n.swaps);
            return;
        }
        const rb = model.pushEdge(model.blocksNow(swaps), BOX, kind === "start" ? "l" : "r", (kind === "start" ? selNow.s : selNow.e) + step);
        if (rb && (rb.s !== selNow.s || rb.e !== selNow.e)) onChange(rb.s, rb.e - rb.s, model.tidy(model.withPush(swaps, rb).swaps));
    }

    const sel: Span = drag && taskMode && drag.box ? drag.box
        : !drag || taskMode || mtgMode || drag.mode === "task-press" ? selNow
            : drag.mode === "draw" ? { s: Math.min(drag.a!, drag.cur!), e: Math.max(drag.a!, drag.cur!) }
                : { s: drag.s, e: drag.e };
    // while a logged task is carried, the label describes that task instead of the new box
    const carrying = taskMode ? list.find((e) => e.id === drag.id) : undefined;
    const sizingMtg = mtgMode ? meetings.find((x) => x.m.id === drag.id) : undefined;
    const lab = carrying || sizingMtg ? { s: drag!.s, e: drag!.e } : sel;
    const len = lab.e - lab.s;
    const { preview } = useOvertimeFor(len > 0 && !sizingMtg
        ? { startedAt: isoAt(date, lab.s), endedAt: isoAt(date, lab.e), entryId: carrying ? carrying.id : ignoreId ?? null, moves: movesFor(date, live) }
        : null);
    const ot = preview?.overtimeMinutes ?? 0;
    const bad = !drag && !!checkLog({
        projectId: projectId ?? -1, day: date, startMin: sel.s, duration: sel.e - sel.s, others: list, moves: swaps, ignoreId,
        allowFuture: !!settings?.allowFutureEntries, allowOverlap: !!settings?.allowOverlap,
    });
    const nSwapped = Object.keys(live).length;

    // the label sits over the box: centred, or lined up with its outer edge near either end of the day
    const pctOf = (m: number) => clamp(((m - r[0]) / (r[1] - r[0])) * 100, 0, 100);
    const mid = (pctOf(lab.s) + pctOf(lab.e)) / 2;
    const labelPos = mid < 30 ? { left: `${pctOf(lab.s)}%`, transform: "none" }
        : mid > 70 ? { left: `${pctOf(lab.e)}%`, transform: "translateX(-100%)" }
            : { left: `${mid}%` };
    const verb = !drag ? null : drag.mode === "move" ? "move" : drag.mode === "draw" ? "plus" : "resize";
    let held: number | null = null;
    if (drag?.stuck) for (const v of Object.values(drag.stuck)) if (v != null && WD.includes(v)) held = v;

    const shown: TrackEntry[] = list.map((e) => {
        const at = live[e.id];
        const sp = at ?? spanOn(e, date);
        return {
            id: e.id, s: sp.s, e: sp.e, description: e.description, projectTitle: e.project.title, locked: !e.canEdit, moved: !!at,
            range: at ? fmtRange(isoAt(date, at.s), isoAt(date, at.e)) : fmtRange(e.startedAt, e.endedAt), overtime: e.overtimeMinutes,
        };
    });
    const trackMeetings: TrackMeeting[] = meetings.map((x) => ({
        id: x.m.id, s: x.s, e: x.e, topic: x.m.topic, projectTitle: x.m.project.title, setBy: x.m.createdBy?.name ?? null,
        range: fmtRange(isoAt(date, x.s), isoAt(date, x.e)), editable: canChangeMeeting(x.m),
    }));

    return (
        <div className={cx("dd", drag && "dragging", drag && `dd-${drag.mode}`, meetings.length > 0 && "has-mtg")}>
            <div className="dd-label-row">
                {len > 0 ? (
                    <span className={cx("dd-label", drag && drag.mode !== "task-press" && "dd-live", carrying && "dd-task", sizingMtg && "dd-mtg", bad && "bad")} style={labelPos}>
                        {carrying ? <span className="trunc dd-task-name">{carrying.description}</span>
                            : sizingMtg ? <span className="trunc dd-task-name"><Icon name="calendar" /> {sizingMtg.m.topic || "Meeting"}</span>
                                : verb === "plus" ? <Icon name="plus" /> : verb ? <Icon name="clock" /> : null}
                        <b className="mono">{fmtDur(len)}</b>
                        <span className="mono">{fmtRange(isoAt(date, lab.s), isoAt(date, lab.e))}</span>
                        {ot > 0 && <span className="dd-ot">{fmtDur(ot)} overtime</span>}
                        {held != null && <span className="dd-held" title="Pull further to break free">held at {fmtHourLabel(held)}</span>}
                    </span>
                ) : <span className="dd-hint">Press on free time and drag</span>}
            </div>
            <DayTrack big lo={r[0]} hi={r[1]} workHours={workHours} entries={shown} meetings={trackMeetings} nowMin={isToday ? nowMin : null}
                sel={sel} selBad={bad} selected={selected} editable held={held} ref={trackRef} onPointerDown={down} onPointerMove={move} onPointerUp={up}
                onDoubleClick={select} onContextMenu={openMenu} onKeyDown={key} onBlur={blur} />
            {menu && (
                <ContextMenu x={menu.x} y={menu.y} label="Logged task" onClose={() => setMenu(null)}>
                    <button type="button" role="menuitem" className="pop-item danger" onClick={() => { setMenu(null); removeTask(menu.id); }}>
                        <Icon name="trash" />Delete this log
                    </button>
                </ContextMenu>
            )}
            <div className="row wrap mt-s legend-row">
                <span><i className="lg-e" />logged ({list.length}), drag to move, edges to resize (pushing neighbours along), right-click to delete</span>
                <span><i className="lg-sel" />{ignoreId ? "this entry" : "new log"} - drag it to move, its edges to resize</span>
                {meetings.length > 0 && <span><i className="lg-mtg" />meetings ({meetings.length}), drag their ends to resize</span>}
                {workHours && <span><i className="lg-wd" />your working day, {dayText(scheduleDay)}</span>}
                <span><i className="lg-ot" />{workHours ? "outside your working day" : "your day off"} · overtime</span>
                {isToday && <span><i className="lg-now" />now {fmtTime(new Date())}</span>}
            </div>
            <div className="dd-keys"><Icon name="info" />Keyboard: Tab to a block, then <kbd>←</kbd> <kbd>→</kbd> move it 5 min (<kbd>Ctrl</kbd> for 15);
                {" "}<kbd>Shift</kbd> + arrows change its end, <kbd>Alt</kbd> + arrows its start. Double-click a logged task (or <kbd>Enter</kbd>) to select it, then <kbd>Delete</kbd> removes it.</div>
            {nSwapped > 0 && !drag && (
                <div className="dd-swapped">
                    <Icon name="refresh" />
                    <span className="grow">
                        {nSwapped === 1 ? "1 logged task moves" : `${nSwapped} logged tasks move`} when you save this log:{" "}
                        {list.filter((e) => live[e.id]).map((e) => `${e.description} → ${fmtRange(isoAt(date, live[e.id].s), isoAt(date, live[e.id].e))}`).join("; ")}.
                    </span>
                    <button type="button" className="link" onClick={() => onChange(startMin, duration, {})}>Put {nSwapped === 1 ? "it" : "them"} back</button>
                </div>
            )}
        </div>
    );
}
