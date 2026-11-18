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

    /**
     * The new box's edge stretched to `want`: through free time, then into the task it runs into, which gets shorter
     * (never under 5 minutes; a locked task stops it). Pulled back, a task it had shortened grows back with it, up to
     * its saved length. Only the one task next to the box gives way: nothing is pushed along.
     */
    function stretchBox(sw: Moves, box: Span, edge: "l" | "r", want: number): { s: number; e: number; swaps: Moves } {
        const blocks = spansWith(sw).map((x) => ({ id: x.id, s: x.s, e: x.e, fixed: x.locked || !x.whole }));
        const out: Moves = { ...sw };
        const savedLen = (id: number) => { const t = tasks.find((x) => x.id === id)!; return t.span.e - t.span.s; };
        if (edge === "r") {
            const next = blocks.filter((x) => x.s >= box.e).sort((a, b) => a.s - b.s)[0];
            let e = clamp(want, box.s + 5, limit);
            if (next && e > next.s) {
                if (next.fixed) e = next.s;
                else {
                    e = Math.min(e, next.e - 5);
                    out[next.id] = { s: e, e: next.e };
                }
            } else if (next && !next.fixed && next.s === box.e && e < box.e) {
                out[next.id] = { s: Math.max(e, next.e - savedLen(next.id)), e: next.e };
            }
            return { s: box.s, e, swaps: tidy(out) };
        }
        const prev = blocks.filter((x) => x.e <= box.s).sort((a, b) => b.e - a.e)[0];
        let s = clamp(want, lo, box.e - 5);
        if (prev && s < prev.e) {
            if (prev.fixed) s = prev.e;
            else {
                s = Math.max(s, prev.s + 5);
                out[prev.id] = { s: prev.s, e: s };
            }
        } else if (prev && !prev.fixed && prev.e === box.s && s > box.s) {
            out[prev.id] = { s: prev.s, e: Math.min(s, prev.s + savedLen(prev.id)) };
        }
        return { s, e: box.e, swaps: tidy(out) };
    }

    /**
     * Any block carried by the pointer: the new box (`BOX`) or a logged task that may change. Where the pointer is
     * decides:
     * - free time: the block goes there, past anything in between. A gap shorter than the block shrinks it to fit;
     *   in a roomier gap it grows back, up to `full` (a task's saved length, the box's own length);
     * - another block that may move: the two trade places, as long as nothing else lies between them;
     * - a locked task: it stays where it is.
     * `box` is where the new box is while a task is carried (it may be traded with); null while the box itself is.
     */
    function carryBlock(
        b: { id: number; grab: number; s: number; e: number; full: number; swaps: Moves; box: Span | null; lastSwap: number | null },
        m: number,
    ): { s: number; e: number; swaps: Moves; box: Span | null; lastSwap: number | null } | null {
        const len = b.e - b.s;
        const others: Block[] = spansWith(b.swaps).filter((x) => x.id !== b.id).map((x) => ({ id: x.id, s: x.s, e: x.e, fixed: x.locked || !x.whole }));
        if (b.id !== BOX && b.box) others.push({ id: BOX, s: b.box.s, e: b.box.e, fixed: false });
        let lastSwap = b.lastSwap;
        const hit = others.find((y) => m >= y.s && m < y.e);
        if (lastSwap != null && hit?.id !== lastSwap) lastSwap = null;

        if (hit) {
            if (hit.fixed || hit.id === lastSwap) return null;
            const before = b.s < hit.s;
            const between = others.some((y) => y.id !== hit.id && (before ? y.s >= b.e && y.e <= hit.s : y.s >= hit.e && y.e <= b.s));
            if (between) return null;
            const hl = hit.e - hit.s;
            const [moved, self] = before
                ? [{ s: b.s, e: b.s + hl }, { s: hit.e - len, e: hit.e }]
                : [{ s: b.e - hl, e: b.e }, { s: hit.s, e: hit.s + len }];
            const clash = moved.e > self.s && self.e > moved.s;
            if (clash || Math.min(moved.s, self.s) < lo || Math.max(moved.e, self.e) > limit) return null;
            const sw: Moves = { ...b.swaps };
            let box = b.box;
            if (hit.id === BOX) box = moved;
            else {
                const original = tasks.find((x) => x.id === hit.id)!.span;
                if (original.s === moved.s && original.e === moved.e) delete sw[hit.id];
                else sw[hit.id] = moved;
            }
            return { s: self.s, e: self.e, swaps: sw, box, lastSwap: hit.id };
        }

        // free time: the gap the pointer is in, whichever side of the block it is on
        const [g0, g1] = gapAround(m, others);
        if (g1 - g0 < 5) return null;
        const size = Math.min(Math.max(b.full, len), g1 - g0);
        const grab = Math.min(b.grab, size);
        const s = clamp(place(snap(m - grab), size, others, false), g0, g1 - size);
        if (s === b.s && s + size === b.e) return null;
        return { s, e: s + size, swaps: b.swaps, box: b.box, lastSwap: null };
    }

    return { WD, spans, spansWith, magnet, stickTo, edgesOf, stickBlock, gapAround, anchorAt, blocksNow, pushEdge, withPush, tidy, obstaclesFor, carryTask, carry, carryBlock, stretchBox };
}

export type DayModel = ReturnType<typeof dayModel>;
