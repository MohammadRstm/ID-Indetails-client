import { useEffect, useEffectEvent, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { stop } from "../Forms/useFloating";

type ContextMenuProps = {
    /** Where the pointer was, in the viewport. */
    x: number;
    y: number;
    label: string;
    onClose: () => void;
    /** `.pop-item` buttons with role="menuitem". */
    children: ReactNode;
};

const EDGE = 8;

/**
 * A right-click menu at the pointer, kept on screen. A click outside, Escape, scrolling or resizing closes it;
 * Escape stops there, so a dialog underneath stays open.
 */
export default function ContextMenu({ x, y, label, onClose, children }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const close = useEffectEvent(() => onClose());

    useLayoutEffect(() => {
        const m = ref.current;
        if (!m) return;
        const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
        m.style.left = `${Math.round(Math.max(EDGE, Math.min(x, vw - m.offsetWidth - EDGE)))}px`;
        m.style.top = `${Math.round(Math.max(EDGE, Math.min(y, vh - m.offsetHeight - EDGE)))}px`;
        m.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
    }, [x, y]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            close();
        };
        const onMove = () => close();
        document.addEventListener("mousedown", onDoc);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("scroll", onMove, true);
            window.removeEventListener("resize", onMove);
        };
    }, []);

    return createPortal(
        <div ref={ref} className="pop floating" role="menu" aria-label={label} style={{ minWidth: 170 }}
            onMouseDown={stop} onPointerDown={stop} onClick={stop} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            {children}
        </div>,
        document.body,
    );
}
