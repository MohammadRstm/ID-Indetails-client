import { useEffectEvent, useLayoutEffect, type RefObject } from "react";

/**
 * Places a floating panel drawn into <body> under its anchor (above it when there's more room there), keeps
 * it on screen, and closes it on a click outside or Escape. Escape stops there, so a modal underneath stays open.
 */
export function useFloating(
    open: boolean,
    anchorRef: RefObject<HTMLElement | null>,
    panelRef: RefObject<HTMLElement | null>,
    onClose: (refocus: boolean) => void,
    options?: { matchWidth?: boolean; list?: () => HTMLElement | null },
) {
    const close = useEffectEvent((refocus: boolean) => onClose(refocus));
    const currentOptions = useEffectEvent(() => options);

    useLayoutEffect(() => {
        if (!open) return;

        function place() {
            const a = anchorRef.current, m = panelRef.current;
            if (!a || !m) return;
            const r = a.getBoundingClientRect();
            const vw = document.documentElement.clientWidth, vh = window.innerHeight;
            m.style.minWidth = currentOptions()?.matchWidth ? `${Math.round(r.width)}px` : "";
            const below = vh - r.bottom - 10, above = r.top - 10;
            const list = currentOptions()?.list?.();
            if (list) {
                const chrome = m.offsetHeight - list.offsetHeight;
                list.style.maxHeight = `${Math.max(120, Math.min(300, Math.max(below, above) - chrome - 6))}px`;
            }
            const h = m.offsetHeight, w = m.offsetWidth;
            const up = h > below && above > below;
            const top = up ? r.top - h - 4 : r.bottom + 4;
            const left = Math.min(Math.max(8, r.left), vw - w - 8);
            m.style.top = `${Math.round(Math.max(8, top))}px`;
            m.style.left = `${Math.round(Math.max(8, left))}px`;
            m.classList.toggle("up", up);
        }
        place();

        function onDoc(e: MouseEvent) {
            const a = anchorRef.current, m = panelRef.current, t = e.target as Node;
            if ((a && a.contains(t)) || (m && m.contains(t))) return;
            close(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            e.preventDefault();
            close(true);
        }
        function onScroll(e: Event) {
            if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
            place();
        }

        document.addEventListener("mousedown", onDoc);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", place);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", place);
        };
    }, [open, anchorRef, panelRef]);
}

/** Clicks inside a floating panel must not reach the parents it was rendered from. */
export function stop(e: { stopPropagation(): void }) {
    e.stopPropagation();
}
