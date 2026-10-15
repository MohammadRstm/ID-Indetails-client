import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useWidth } from "@/shared/components/Charts/core";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { PresentationItem } from "./presentationTypes";
import { usePhone } from "./usePhone";

type Props<T extends PresentationItem> = {
    items: T[];
    /** What the list is, for screen readers: "3D pictures and videos". */
    label: string;
    card: (item: T) => ReactNode;
};

/** The narrowest a card of the grid gets, and the room between two (the stylesheet's .pp-grid). */
const CARD_MIN = 250;
const GAP = 16;
/** Before the grid has been measured (and where nothing is, as in tests): about a laptop's page. */
const UNMEASURED = 1000;

/**
 * The pictures and videos of 3D or Drawings. Wide screens: one row of the grid, as many as fit, and "Show more" for the
 * rest. Phones: a slider, swiped sideways or moved with its arrows, a card at a time.
 */
export default function MediaStrip<T extends PresentationItem>(props: Props<T>) {
    return usePhone() ? <Slider {...props} /> : <OneRow {...props} />;
}

function OneRow<T extends PresentationItem>({ items, label, card }: Props<T>) {
    const list = useRef<HTMLUListElement>(null);
    const width = useWidth(list, UNMEASURED);
    const [open, setOpen] = useState(false);
    // the grid's own columns: as many cards of at least CARD_MIN as its width takes
    const perRow = Math.max(1, Math.floor((width + GAP) / (CARD_MIN + GAP)));
    const more = items.length - perRow;
    const shown = open ? items : items.slice(0, perRow);

    return (
        <>
            <ul className="pp-grid" ref={list} aria-label={label}>
                {shown.map((item) => <li key={item.id}>{card(item)}</li>)}
            </ul>
            {more > 0 && (
                <div className="pp-more">
                    <button type="button" className="btn pp-more-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
                        <Icon name="chevronsDown" className={cx(open && "up")} />{open ? "Show less" : `Show more (${more})`}
                    </button>
                </div>
            )}
        </>
    );
}

function Slider<T extends PresentationItem>({ items, label, card }: Props<T>) {
    const list = useRef<HTMLUListElement>(null);
    const reducedMotion = useReducedMotion();
    // whether the slider is at its start or its end: that arrow has nowhere to go
    const [edges, setEdges] = useState({ start: true, end: items.length < 2 });

    function measure() {
        const box = list.current;
        if (!box) return;
        const start = box.scrollLeft <= 2;
        const end = box.scrollLeft >= box.scrollWidth - box.clientWidth - 2;
        setEdges((was) => (was.start === start && was.end === end ? was : { start, end }));
    }
    const resized = useEffectEvent(measure);
    useEffect(() => {
        const box = list.current;
        if (!box || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => resized());
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    // about a card at a time, as the cards snap into place
    const by = (direction: number) => {
        const box = list.current;
        box?.scrollBy({ left: direction * box.clientWidth * 0.8, behavior: reducedMotion ? "auto" : "smooth" });
    };

    return (
        <div className="pp-slider">
            <ul className="pp-slides" ref={list} aria-label={label} onScroll={measure}>
                {items.map((item) => <li key={item.id}>{card(item)}</li>)}
            </ul>
            <button type="button" className="pp-slide-btn prev" aria-label="Earlier pictures" disabled={edges.start} onClick={() => by(-1)}>
                <Icon name="chevronLeft" />
            </button>
            <button type="button" className="pp-slide-btn next" aria-label="More pictures" disabled={edges.end} onClick={() => by(1)}>
                <Icon name="chevronRight" />
            </button>
        </div>
    );
}
