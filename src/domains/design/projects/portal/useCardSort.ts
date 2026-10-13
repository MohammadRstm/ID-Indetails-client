import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

/*
 * Rearranging a section's cards, by pointer (mouse, pen or touch) or by keys, the way the dashboards are
 * rearranged (see Board). A card is picked up by its handle. With a pointer, a copy of the card follows it while the
 * card's own place travels through the grid as a dashed outline; with keys, the card itself moves one place per
 * arrow. The others slide to make room. The new order is handed over once, when the card is dropped.
 */

/** Where the cards' help text is: the handles point to it. */
export const REORDER_HELP_ID = "pc-reorder-help";

export type MoveTo = "start" | "earlier" | "later" | "end";

/** A card that was picked up: with a pointer (it follows it), or with the keys (it moves in place). */
export type Held = { id: number; by: "pointer" | "keys" };

export type GripProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
    "aria-describedby": string;
};

type Options = {
    /** The cards that can be moved, in their saved order. */
    ids: number[];
    enabled: boolean;
    titleOf: (id: number) => string;
    /** Saves a new order; settles once it is saved or has been refused. */
    onCommit: (ids: number[]) => Promise<unknown>;
};

const same = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const sameCards = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));

/** The order with `id` taken out and put at place `to` (counted without it). */
function moved(order: number[], id: number, to: number): number[] {
    const next = order.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    return next;
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EDGE = 70;

export function useCardSort({ ids, enabled, titleOf, onCommit }: Options) {
    const grid = useRef<HTMLDivElement>(null);
    // the order a card has been moved to and not saved yet: shown until the save is over
    const [draft, setDraft] = useState<number[] | null>(null);
    const [held, setHeld] = useState<Held | null>(null);
    const [said, setSaid] = useState("");
    const rects = useRef<Map<string, DOMRect> | null>(null);
    const stop = useRef<(() => void) | null>(null);
    const latest = useRef({ ids, titleOf, onCommit });
    useEffect(() => {
        latest.current = { ids, titleOf, onCommit };
    });

    const order = draft && sameCards(draft, ids) ? draft : ids;
    const orderKey = order.join("|");

    const cards = () => Array.from(grid.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []);

    // the cards glide from where they were to their new places
    function measure() {
        rects.current = new Map(cards().map((el) => [el.dataset.card!, el.getBoundingClientRect()]));
    }
    useLayoutEffect(() => {
        const before = rects.current;
        rects.current = null;
        if (!before || reducedMotion()) return;
        for (const el of Array.from(grid.current?.querySelectorAll<HTMLElement>("[data-card]") ?? [])) {
            const a = before.get(el.dataset.card!);
            if (!a) continue;
            const b = el.getBoundingClientRect();
            const dx = a.left - b.left, dy = a.top - b.top;
            if (!dx && !dy) continue;
            el.style.transition = "none";
            el.style.transform = `translate(${dx}px,${dy}px)`;
            el.getBoundingClientRect();
            el.style.transition = "transform .22s cubic-bezier(.2,.7,.2,1)";
            el.style.transform = "";
        }
    }, [orderKey]);

    // moving a card in the page can take the keyboard's place with it: it goes back to the card that is held
    useLayoutEffect(() => {
        if (held?.by === "keys") grid.current?.querySelector<HTMLElement>(`[data-card="${held.id}"] .pc-grip`)?.focus();
    }, [orderKey, held]);

    // a click or touch anywhere puts a card held by the keys down
    useEffect(() => {
        if (held?.by !== "keys") return;
        const away = () => {
            setHeld(null);
            setDraft(null);
        };
        document.addEventListener("pointerdown", away, true);
        return () => document.removeEventListener("pointerdown", away, true);
    }, [held]);

    useEffect(() => () => stop.current?.(), []);

    const place = (list: number[], id: number) => `position ${list.indexOf(id) + 1} of ${list.length}`;

    function commit(next: number[]) {
        setDraft(next);
        setHeld(null);
        void latest.current.onCommit(next).finally(() => setDraft(null));
    }

    // ---- with a pointer ----

    function pick(e: ReactPointerEvent<HTMLElement>, id: number) {
        if (!enabled || e.button !== 0 || stop.current) return;
        const card = e.currentTarget.closest<HTMLElement>("[data-card]");
        if (!card) return;
        e.preventDefault();
        const box = card.getBoundingClientRect();
        const ghost = card.cloneNode(true) as HTMLElement;
        ghost.classList.add("pc-ghost");
        ghost.removeAttribute("data-card");
        ghost.setAttribute("aria-hidden", "true");
        ghost.setAttribute("inert", "");
        Object.assign(ghost.style, { width: `${box.width}px`, height: `${box.height}px`, left: `${box.left}px`, top: `${box.top}px` });
        document.body.appendChild(ghost);

        const dx = e.clientX - box.left, dy = e.clientY - box.top;
        let x = e.clientX, y = e.clientY;
        let over: number | null = null;
        let frame = 0;
        let next = latest.current.ids;
        setDraft(null);
        setHeld({ id, by: "pointer" });

        // the card under the pointer gives up its place to the one being dragged
        function retarget() {
            let hit: number | null = null;
            for (const el of cards()) {
                const other = Number(el.dataset.card);
                if (other === id) continue;
                const r = el.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = other;
            }
            if (hit == null || hit === over) {
                if (hit == null) over = null;
                return;
            }
            over = hit;
            const changed = moved(next, id, next.indexOf(hit));
            if (same(changed, next)) return;
            next = changed;
            measure();
            setDraft(next);
        }
        function follow(ev: PointerEvent) {
            x = ev.clientX;
            y = ev.clientY;
            ghost.style.left = `${x - dx}px`;
            ghost.style.top = `${y - dy}px`;
            retarget();
        }
        // near the top or bottom of the window the page keeps scrolling, however still the pointer is
        function scroll() {
            const by = y < EDGE ? -Math.ceil((EDGE - y) / 4) : y > window.innerHeight - EDGE ? Math.ceil((y - (window.innerHeight - EDGE)) / 4) : 0;
            if (by) {
                window.scrollBy(0, by);
                retarget();
            }
            frame = requestAnimationFrame(scroll);
        }
        function end(drop: boolean) {
            window.removeEventListener("pointermove", follow);
            window.removeEventListener("pointerup", release);
            window.removeEventListener("pointercancel", abandon);
            window.removeEventListener("keydown", escape);
            cancelAnimationFrame(frame);
            ghost.remove();
            stop.current = null;
            setHeld(null);
            if (drop && !same(next, latest.current.ids)) commit(next);
            else setDraft(null);
        }
        function release() {
            end(true);
        }
        function abandon() {
            end(false);
        }
        function escape(ev: KeyboardEvent) {
            if (ev.key === "Escape") end(false);
        }

        stop.current = abandon;
        window.addEventListener("pointermove", follow);
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", abandon);
        window.addEventListener("keydown", escape);
        frame = requestAnimationFrame(scroll);
    }

    // ---- with the keys ----

    function press(e: ReactKeyboardEvent<HTMLElement>, id: number) {
        if (!enabled) return;
        const title = latest.current.titleOf(id);
        const key = e.key;
        if (held?.by !== "keys" || held.id !== id) {
            if (key !== " " && key !== "Enter") return;
            e.preventDefault();
            setDraft(order);
            setHeld({ id, by: "keys" });
            setSaid(`Picked up ${title}, ${place(order, id)}. Use the arrow keys to move it, Space or Enter to drop it, Escape to cancel.`);
            return;
        }

        const at = order.indexOf(id);
        const to = key === "ArrowLeft" || key === "ArrowUp" ? at - 1 : key === "ArrowRight" || key === "ArrowDown" ? at + 1
            : key === "Home" ? 0 : key === "End" ? order.length - 1 : null;
        if (to != null) {
            e.preventDefault();
            const next = moved(order, id, to);
            if (same(next, order)) return setSaid(`${title}, ${place(order, id)}, as far as it goes`);
            measure();
            setDraft(next);
            setSaid(`${title}, ${place(next, id)}`);
        } else if (key === " " || key === "Enter") {
            e.preventDefault();
            if (same(order, latest.current.ids)) {
                setDraft(null);
                setHeld(null);
                setSaid(`${title} put down, ${place(order, id)}`);
            } else {
                commit(order);
                setSaid(`${title} moved to ${place(order, id)}`);
            }
        } else if (key === "Escape" || key === "Tab") {
            // Tab goes on to the next control; either way the card goes back
            if (key === "Escape") e.preventDefault();
            setDraft(null);
            setHeld(null);
            setSaid(`Move cancelled. ${title} is at ${place(latest.current.ids, id)}`);
        }
    }

    /** One place at a time, or to either end, for the card's menu. */
    function move(id: number, to: MoveTo) {
        const at = order.indexOf(id);
        if (at < 0 || !enabled) return;
        const next = moved(order, id, to === "start" ? 0 : to === "end" ? order.length - 1 : to === "earlier" ? at - 1 : at + 1);
        if (same(next, order)) return;
        measure();
        commit(next);
        setSaid(`${latest.current.titleOf(id)} moved to ${place(next, id)}`);
    }

    return {
        grid,
        /** The cards' ids as they are drawn now. */
        order,
        held,
        /** What a screen reader is told (a polite live region). */
        said,
        handle: (id: number): GripProps => ({
            onPointerDown: (e) => pick(e, id),
            onKeyDown: (e) => press(e, id),
            "aria-describedby": REORDER_HELP_ID,
        }),
        move,
    };
}
