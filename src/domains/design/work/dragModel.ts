import { clamp, snap, type Moves, type Span } from "./day";

/*
 * The rules of the drag timeline (the prototype's UI.DragDay), as plain functions over minutes of one day.
 *
 * - Times stick to the working day's start and end, and to the edges of logged tasks.
 * - The new log's box slides through free time. Pushed into a logged task, the two trade places.
 * - Stretching an edge pushes the neighbours along, back to back. A locked task (past the edit window)
 *   never moves: the edge stops against it.
 * - Nothing goes past `limit` (now, on today) or before the start of the visible range.
 */

/** A logged task on the day: where it was saved, whether it lies wholly on the day, and whether it may change. */
export type DayTask = { id: number; span: Span; whole: boolean; locked: boolean };
export type TaskSpan = Span & { id: number; whole: boolean; locked: boolean };
export type Block = Span & { id: number; fixed: boolean };
export type PushResult = Span & { moved: Moves; over: number };
/** Edges held by the working day or a task's edge, while dragging. */
export type Stuck = { cur?: number | null; edge?: number | null; s?: number | null; e?: number | null };

/** The new log's box, as a block among the tasks. */
export const BOX = -1;

const MAGNET = 10;
const CATCH = 10;
const ESCAPE = 25;

type ModelInput = {
    tasks: DayTask[];
    range: [number, number];
    limit: number;
    workHours: Span | null;
    /** The new log's box, when it has a length. */
    box: Span | null;
    /** Where tasks are right now: moves already pending, and any the current drag makes. */
    live: Moves;
};

export function dayModel({ tasks, range, limit, workHours, box, live }: ModelInput) {
    const [lo] = range;
    const WD = workHours ? [workHours.s, workHours.e] : [];

    function spansWith(sw: Moves): TaskSpan[] {
        return tasks.map((t) => ({ ...(sw[t.id] ?? t.span), id: t.id, whole: t.whole, locked: t.locked }));
    }
    const spans = spansWith(live);

    /** Within ten minutes of the working day's edges or a task's edge, it snaps there; else to five minutes. */
    function magnet(m: number, sp: Span[] = spans): number {
        const targets = [...WD, ...sp.flatMap((x) => [x.s, x.e])];
        let best: number | null = null;
        for (const t of targets) if (Math.abs(m - t) <= MAGNET && (best == null || Math.abs(m - t) < Math.abs(m - best))) best = t;
        return best ?? snap(m);
    }

    /** A sticky edge: caught within CATCH minutes of a target, it holds until pulled ESCAPE minutes away. */
    function stickTo(stuck: number | null | undefined, raw: number, targets: number[]): { v: number; stuck: number | null } {
        if (stuck != null && Math.abs(raw - stuck) <= ESCAPE) return { v: stuck, stuck };
        let best: number | null = null;
        for (const t of targets) if (Math.abs(raw - t) <= CATCH && (best == null || Math.abs(raw - t) < Math.abs(raw - best))) best = t;
        return best != null ? { v: best, stuck: best } : { v: snap(raw), stuck: null };
    }

    function edgesOf(sp: TaskSpan[], skipId?: number): number[] {
        return [...WD, ...sp.filter((x) => x.id !== skipId).flatMap((x) => [x.s, x.e])];
    }

    /** A whole block carried along: whichever of its edges is stuck wins. */
    function stickBlock(stuck: Stuck | undefined, raw: number, len: number, targets: number[]): { want: number; stuck: Stuck } {
        const st = stuck ?? {};
        const a = stickTo(st.s, raw, targets), b = stickTo(st.e, raw + len, targets);
        if (a.stuck != null && (b.stuck == null || Math.abs(raw - a.v) <= Math.abs(raw + len - b.v))) return { want: a.v, stuck: { s: a.stuck, e: null } };
        if (b.stuck != null) return { want: b.v - len, stuck: { s: null, e: b.stuck } };
        return { want: snap(raw), stuck: {} };
    }

    /** The free stretch around a moment: from the end of the task before it to the start of the next. */
    function gapAround(m: number, sp: Span[] = spans): [number, number] {
        let lower = lo, upper = limit;
        for (const x of sp) {
            if (x.e <= m) lower = Math.max(lower, x.e);
            if (x.s >= m) upper = Math.min(upper, x.s);
        }
        return [lower, upper];
    }

    /** A press on a logged task starts the new box where that task ends: "and then I did…". */
    function anchorAt(m: number): number {
        const hit = spans.find((sp) => m >= sp.s && m < sp.e);
        return hit ? hit.e : m;
    }

    function blocksNow(sw: Moves): Block[] {
        const out: Block[] = spansWith(sw).map((x) => ({ id: x.id, s: x.s, e: x.e, fixed: x.locked || !x.whole }));
        if (box) out.push({ id: BOX, s: box.s, e: box.e, fixed: false });
        return out;
    }

    /** Stretches one edge of a block to `want`, pushing its neighbours along; null when it can't go there at all. */
    function pushEdge(base: Block[], selfId: number, edge: "l" | "r", want: number): PushResult | null {
        const self = base.find((x) => x.id === selfId);
        if (!self) return null;
        const others = base.filter((x) => x.id !== selfId);
        function attempt(w: number): PushResult {
            const moved: Moves = {};
            let over = 0;
            if (edge === "r") {
                let cur = Math.max(self!.s + 5, w);
                const endSelf = cur;
                const after = others.filter((y) => y.s >= self!.e).sort((a, b) => a.s - b.s);
                for (const x of after) {
                    if (x.s >= cur) break;
                    if (x.fixed) { over = cur - x.s; break; }
                    moved[x.id] = { s: cur, e: cur + (x.e - x.s) };
                    cur = moved[x.id].e;
                }
                if (!over && cur > limit) over = cur - limit;
                return { s: self!.s, e: endSelf, moved, over };
            }
            let cur = Math.min(self!.e - 5, w);
            const startSelf = cur;
            const before = others.filter((y) => y.e <= self!.s).sort((a, b) => b.e - a.e);
            for (const x of before) {
                if (x.e <= cur) break;
                if (x.fixed) { over = x.e - cur; break; }
                moved[x.id] = { s: cur - (x.e - x.s), e: cur };
                cur = moved[x.id].s;
            }
            if (!over && cur < lo) over = lo - cur;
            return { s: startSelf, e: self!.e, moved, over };
        }
        let res = attempt(want);
        for (let k = 0; k < 8 && res.over > 0; k++) {
            want = edge === "r" ? want - res.over : want + res.over;
            res = attempt(want);
        }
        return res.over > 0 ? null : res;
    }

    /** Folds a push into the pending moves; the new log's box, if pushed, comes back separately. */
    function withPush(sw0: Moves, res: PushResult): { swaps: Moves; box: Span | null } {
        const sw: Moves = { ...sw0 };
        let pushedBox: Span | null = null;
        for (const [id, sp] of Object.entries(res.moved)) {
            if (+id === BOX) pushedBox = sp;
            else sw[+id] = sp;
        }
        return { swaps: sw, box: pushedBox };
    }

    /** Tasks that ended up back where they were are no longer moved. */
    function tidy(sw: Moves): Moves {
        const out: Moves = {};
        for (const [id, sp] of Object.entries(sw)) {
            const t = tasks.find((x) => x.id === +id);
            if (t && (t.span.s !== sp.s || t.span.e !== sp.e)) out[+id] = sp;
        }
        return out;
    }

    /** What a moved task can't slide through: the other tasks and the new log's box. */
    function obstaclesFor(id: number, sw: Moves): Span[] {
        const obst: Span[] = spansWith(sw).filter((x) => x.id !== id);
        if (box) obst.push(box);
        return obst;
    }

    /** Snaps a carried block's start or end to a nearby edge, unless it was placed exactly (a key press). */
    function place(want: number, len: number, sp: Span[], exact: boolean): number {
        const ms = magnet(want, sp), me = magnet(want + len, sp);
        if (exact) return want;
        if (ms !== snap(want) && Math.abs(ms - want) <= Math.abs(me - (want + len))) return ms;
        if (me !== snap(want + len)) return me - len;
        return want;
    }

    /** A logged task carried through free time: it stops at other tasks, the new box and now. */
    function carryTask(t: { id: number; grab: number; s: number; e: number; swaps: Moves }, m: number, exact: boolean): Span | null {
        const len = t.e - t.s;
        const obst = obstaclesFor(t.id, t.swaps);
        let want = place(snap(m - t.grab), len, obst, exact);
        const g = gapAround(t.s + len / 2, obst);
        if (g[1] - g[0] < len) return null;
        want = clamp(want, g[0], g[1] - len);
        return want === t.s ? null : { s: want, e: want + len };
    }

    /**
     * The new box carried along: it slides through free time, and pushed into a logged task the two trade
     * places, the gap between them kept as it was.
     */
    function carry(b: { grab: number; s: number; e: number; swaps: Moves; lastSwap: number | null }, m: number, exact: boolean):
        { s: number; e: number; swaps: Moves; lastSwap: number | null } | null {
        const len = b.e - b.s, sp = spansWith(b.swaps);
        const want0 = place(snap(m - b.grab), len, sp, exact);
        const center = want0 + len / 2;
        let lastSwap = b.lastSwap;
        if (lastSwap != null) {
            const ls = sp.find((x) => x.id === lastSwap);
            if (!ls || center < ls.s || center >= ls.e) lastSwap = null;
        }
        const hit = sp.find((x) => x.whole && !x.locked && x.id !== lastSwap && center >= x.s && center < x.e);
        if (hit) {
            const tl = hit.e - hit.s;
            // the box was before the task, or after it
            const [task, boxAt] = b.s < hit.s
                ? [{ s: b.s, e: b.s + tl }, { s: hit.e - len, e: hit.e }]
                : [{ s: b.e - tl, e: b.e }, { s: hit.s, e: hit.s + len }];
            if (boxAt.e <= limit && task.e <= limit && boxAt.s >= lo && task.s >= lo) {
                const sw: Moves = { ...b.swaps, [hit.id]: task };
                const original = tasks.find((x) => x.id === hit.id)!.span;
                if (original.s === task.s && original.e === task.e) delete sw[hit.id];
                return { s: boxAt.s, e: boxAt.e, swaps: sw, lastSwap: hit.id };
            }
        }
        // no swap: slide within the free stretch the box is in now - never onto a task
        const g = gapAround(b.s + len / 2, sp);
        if (g[1] - g[0] < len) return null;
        const want = clamp(want0, g[0], g[1] - len);
        return want === b.s ? null : { s: want, e: want + len, swaps: b.swaps, lastSwap };
    }

    return { WD, spans, spansWith, magnet, stickTo, edgesOf, stickBlock, gapAround, anchorAt, blocksNow, pushEdge, withPush, tidy, obstaclesFor, carryTask, carry };
}

export type DayModel = ReturnType<typeof dayModel>;
