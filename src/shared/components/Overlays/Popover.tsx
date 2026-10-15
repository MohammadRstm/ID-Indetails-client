import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/shared/utils/cx";

type PopoverProps = {
    /** Draws the button that opens it. */
    trigger: (open: boolean, toggle: () => void) => ReactNode;
    /** The panel, or a function given `close`. */
    children: ReactNode | ((close: () => void) => ReactNode);
    align?: "left" | "right";
    /** Minimum width of the panel, in pixels. */
    width?: number;
    hostClass?: string;
    className?: string;
    /**
     * Drawn over the page beside its button, instead of inside the button's container: for menus in tables and
     * other scrolling boxes, which would otherwise grow to make room for the panel.
     */
    floating?: boolean;
};

const GAP = 6;
const EDGE = 8;

/** A panel under a button, closed by a click outside or Escape (the prototype's UI.Popover). */
export default function Popover({ trigger, children, align = "right", width, hostClass, className, floating }: PopoverProps) {
    const [open, setOpen] = useState(false);
    const [place, setPlace] = useState<CSSProperties | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
        };
        // Escape closes the menu only, not a dialog it sits in: caught first, on the way down, and stopped there
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        window.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [open]);

    // A floating panel follows its button: below it, or above when there's no room below, and kept on screen.
    useLayoutEffect(() => {
        if (!open || !floating) return;
        function measure() {
            const host = ref.current?.getBoundingClientRect();
            const pop = panelRef.current;
            if (!host || !pop) return;
            const vw = document.documentElement.clientWidth || window.innerWidth;
            const vh = window.innerHeight;
            // the whole height of its contents, whatever height it was given last time
            const w = pop.offsetWidth, h = pop.scrollHeight;
            const left = Math.max(EDGE, Math.min(align === "right" ? host.right - w : host.left, vw - EDGE - w));
            const roomBelow = vh - EDGE - (host.bottom + GAP), roomAbove = host.top - GAP - EDGE;
            const up = h > roomBelow && (h <= roomAbove || roomAbove > roomBelow);
            // a menu taller than the room on either side takes the larger one and scrolls, so no item is out of reach
            const room = up ? roomAbove : roomBelow;
            const height = Math.min(h, room);
            const top = up ? host.top - GAP - height : host.bottom + GAP;
            setPlace({ top: Math.round(top), left: Math.round(left), ...(h > room ? { maxHeight: Math.round(room), overflowY: "auto" } : null) });
        }
        measure();
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
        };
    }, [open, floating, align]);

    // A trigger near either edge (phones, wrapped header rows) must not push the panel off-screen.
    useLayoutEffect(() => {
        if (!open || floating || !panelRef.current) return;
        const pop = panelRef.current;
        pop.style.transform = "";
        const r = pop.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        if (!vw || !r.width) return;
        let dx = 0;
        if (r.right > vw - EDGE) dx = vw - EDGE - r.right;
        if (r.left + dx < EDGE) dx = EDGE - r.left;
        if (dx) pop.style.transform = `translateX(${Math.round(dx)}px)`;
    }, [open, floating]);

    const close = () => {
        setOpen(false);
        setPlace(null);
    };
    // a floating panel is hidden until it has been placed, so it never flashes at the top of the page
    const at: CSSProperties | null = floating ? place ?? { top: 0, left: 0, visibility: "hidden" } : null;
    const panel = open && (
        <div ref={panelRef} className={cx("pop", floating ? "floating" : align, className)} style={{ ...(width ? { minWidth: width } : null), ...at }}>
            {typeof children === "function" ? children(close) : children}
        </div>
    );
    return (
        <div className={cx("pop-host", hostClass)} ref={ref}>
            {trigger(open, () => (open ? close() : setOpen(true)))}
            {floating && panel ? createPortal(panel, document.body) : panel}
        </div>
    );
}
