import { useEffect, useRef } from "react";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex='-1'])";

let locks = 0;
let overflowBefore = "";

/** Stops the page behind from scrolling. Layers can be stacked: the page scrolls again when the last one is gone. */
function lockScroll(): () => void {
    if (locks++ === 0) {
        overflowBefore = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    }
    return () => {
        if (--locks === 0) document.body.style.overflow = overflowBefore;
    };
}

/**
 * A layer over the whole page (the draft preview, the lightbox): the page behind doesn't scroll, the keyboard moves
 * into the layer and stays there (Tab goes round), and goes back to where it was when the layer closes. Returns the
 * ref for the layer's element.
 */
export function useLayer<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    useEffect(() => {
        const layer = ref.current;
        if (!layer) return;
        const before = document.activeElement as HTMLElement | null;
        const unlock = lockScroll();
        layer.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const focusable = [...layer.querySelectorAll<HTMLElement>(FOCUSABLE)];
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const at = document.activeElement;
            if (e.shiftKey && (at === first || at === layer)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && at === last) {
                e.preventDefault();
                first.focus();
            }
        };
        layer.addEventListener("keydown", onKeyDown);
        return () => {
            layer.removeEventListener("keydown", onKeyDown);
            unlock();
            before?.focus?.();
        };
    }, []);
    return ref;
}
