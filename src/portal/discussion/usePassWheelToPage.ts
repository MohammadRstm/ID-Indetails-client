import { useEffect, type RefObject } from "react";

/**
 * A list that scrolls on its own hands the mouse wheel on to the page once it is at its top or bottom. Browsers do
 * that themselves, except when the list's last scroll position is a fraction of a pixel short of its end (on scaled
 * displays): then the wheel stays with the list and the page can't be scrolled from it, only with its scroll bar.
 */
export function usePassWheelToPage(ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const box = ref.current;
        if (!box) return;
        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.deltaY === 0) return;
            const atTop = box.scrollTop <= 1;
            const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
            if ((event.deltaY > 0 && atBottom) || (event.deltaY < 0 && atTop)) {
                event.preventDefault();
                window.scrollBy({ top: event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY });
            }
        };
        // not passive: the list mustn't keep a wheel it can't use
        box.addEventListener("wheel", onWheel, { passive: false });
        return () => box.removeEventListener("wheel", onWheel);
    }, [ref]);
}
