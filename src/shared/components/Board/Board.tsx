import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toast } from "@/shared/components/Feedback/toast";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { resolveOrder, useBoardLayout, useSaveBoardLayout } from "./boardLayouts";

/*
 * Rearrangeable dashboards (the prototype's UI.Board). A page hands the board its cards in their default
 * order, each with its width there (a span of a 12-column grid). Those widths are the page's slots:
 * rearranging changes which card sits in which slot, and a card takes the width of wherever it is put,
 * so the page keeps its shape whatever the order. Each person's order is saved on the server, per board.
 */

export type BoardCard = { key: string; label: string; span?: number; node: ReactNode };

/** "Customize" in the page header: turns arranging on and off. */
export function BoardButton({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
    return (
        <button className={cx("btn bd-toggle", editing && "on")} title="Rearrange the cards on this page" onClick={onToggle}>
            <Icon name={editing ? "check" : "grid"} />{editing ? "Done" : "Customize"}
        </button>
    );
}

type Drag = { key: string; dx: number; dy: number; ghost: HTMLElement; over: string | null; order: string[] };

type BoardProps = {
    /** Where the order is saved, e.g. "overview-design". */
    id: string;
    cards: (BoardCard | null | false)[];
    editing: boolean;
    onDone: () => void;
};

export default function Board({ id, cards, editing, onDone }: BoardProps) {
    const list = cards.filter((c): c is BoardCard => !!c);
    const byKey = new Map(list.map((c) => [c.key, c]));
    const defaults = list.map((c) => c.key);
    const spans = list.map((c) => c.span ?? 12);
    const layout = useBoardLayout(id);
    const save = useSaveBoardLayout(id);
    const [order, setOrder] = useState<string[] | null>(null);
    const [dragKey, setDragKey] = useState<string | null>(null);
    const [savedTick, setSavedTick] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const rects = useRef<Record<string, DOMRect> | null>(null);
    const drag = useRef<Drag | null>(null);

    const current = resolveOrder(order ?? layout.data?.order, defaults);
    const custom = current.join("|") !== defaults.join("|");

    // cards glide from where they were to their new slot
    function measure() {
        const out: Record<string, DOMRect> = {};
        root.current?.querySelectorAll<HTMLElement>("[data-bd]").forEach((el) => { out[el.dataset.bd!] = el.getBoundingClientRect(); });
        rects.current = out;
    }
    const orderKey = current.join("|");
    useLayoutEffect(() => {
        const before = rects.current;
        rects.current = null;
        if (!before || !root.current) return;
        root.current.querySelectorAll<HTMLElement>("[data-bd]").forEach((el) => {
            const a = before[el.dataset.bd!];
            if (!a) return;
            const b = el.getBoundingClientRect();
            const dx = a.left - b.left, dy = a.top - b.top;
            if (!dx && !dy) return;
            el.style.transition = "none";
            el.style.transform = `translate(${dx}px,${dy}px)`;
            el.getBoundingClientRect();
            el.style.transition = "transform .22s cubic-bezier(.2,.7,.2,1)";
            el.style.transform = "";
        });
    }, [orderKey]);

    function commit(next: string[], quiet = false) {
        measure();
        setOrder(next);
        save.mutate(next.join("|") === defaults.join("|") ? null : next, {
            onError: () => toast({ text: "The arrangement wasn't saved", sub: "It stays as it is until you leave the page.", icon: "alert" }),
        });
        if (!quiet) setSavedTick((n) => n + 1);
    }
    function move(key: string, to: number) {
        const from = current.indexOf(key);
        if (from < 0 || to < 0 || to >= current.length || to === from) return;
        const next = current.slice();
        next.splice(from, 1);
        next.splice(to, 0, key);
        commit(next);
    }

    // dragging: a copy of the card follows the pointer; the card's own place travels through the layout
    // as a dashed outline, taking the size of each slot it passes into
    function onMove(e: PointerEvent) {
        const d = drag.current;
        if (!d || !root.current) return;
        d.ghost.style.left = `${e.clientX - d.dx}px`;
        d.ghost.style.top = `${e.clientY - d.dy}px`;
        // near the top or bottom of the window, keep scrolling
        if (e.clientY < 70) window.scrollBy(0, -12);
        else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
        let hit: string | null = null;
        root.current.querySelectorAll<HTMLElement>("[data-bd]").forEach((el) => {
            if (el.dataset.bd === d.key) return;
            const r = el.getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) hit = el.dataset.bd!;
        });
        if (!hit || hit === d.over) {
            if (!hit) d.over = null;
            return;
        }
        d.over = hit;
        const next = d.order.slice();
        next.splice(next.indexOf(d.key), 1);
        next.splice(next.indexOf(hit), 0, d.key);
        d.order = next;
        measure();
        setOrder(next);
    }
    function onUp() {
        const d = drag.current;
        drag.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!d) return;
        d.ghost.remove();
        setDragKey(null);
        commit(d.order, d.order.join("|") === orderKey);
    }
    function onDown(e: ReactPointerEvent<HTMLDivElement>, key: string) {
        if (!editing || e.button !== 0 || (e.target as HTMLElement).closest(".bd-btns")) return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add("bd-ghost");
        Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
        document.body.appendChild(ghost);
        drag.current = { key, dx: e.clientX - r.left, dy: e.clientY - r.top, ghost, over: null, order: current.slice() };
        setDragKey(key);
        e.preventDefault();
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }
    useEffect(() => () => {
        drag.current?.ghost.remove();
        drag.current = null;
    }, []);

    return (
        <div className={cx("bd", editing && "editing", dragKey && "dragging")} ref={root}>
            {editing && (
                <div className="bd-bar">
                    <Icon name="grid" />
                    <div className="grow">
                        <b>Arranging this page</b>
                        <span className="muted"> · drag a card to a new place, or use its arrows. Each place keeps its size; a card takes the size of wherever it lands.</span>
                    </div>
                    <span className={cx("bd-saved", savedTick > 0 && "on")} key={savedTick}><Icon name="check" />Saved</span>
                    <button className="btn btn-sm btn-quiet" disabled={!custom} onClick={() => commit(defaults)}><Icon name="refresh" />Reset</button>
                    <button className="btn btn-sm btn-primary" onClick={onDone}>Done</button>
                </div>
            )}
            <div className="bd-grid">
                {current.map((key, i) => {
                    const c = byKey.get(key);
                    if (!c) return null;
                    const span = spans[i] ?? 12;
                    return (
                        <div key={key} data-bd={key} className={cx("bd-item", dragKey === key && "placeholder")} style={{ gridColumn: `span ${span}` }}
                            onPointerDown={editing ? (e) => onDown(e, key) : undefined}>
                            {editing && (
                                <div className="bd-handle">
                                    <span className="bd-pill"><Icon name="menu" /><span className="trunc">{c.label}</span></span>
                                    <span className="bd-size">{span === 12 ? "full width" : `${span}/12`}</span>
                                    <span className="bd-btns">
                                        <button type="button" aria-label={`Move ${c.label} earlier`} disabled={i === 0} onClick={() => move(key, i - 1)}><Icon name="chevronLeft" /></button>
                                        <button type="button" aria-label={`Move ${c.label} later`} disabled={i === current.length - 1} onClick={() => move(key, i + 1)}><Icon name="chevronRight" /></button>
                                    </span>
                                </div>
                            )}
                            <div className="bd-body">{c.node}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
