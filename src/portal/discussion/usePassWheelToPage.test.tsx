import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePassWheelToPage } from "./usePassWheelToPage";

/*
 * A chat or comments list hands the mouse wheel on to the page at its ends, so the page can still be scrolled from it
 * (the browser alone doesn't when the list stops a fraction of a pixel short of its end).
 */

function List() {
    const ref = useRef<HTMLDivElement>(null);
    usePassWheelToPage(ref);
    return <div ref={ref} data-testid="list" />;
}

/** A list 400px tall holding 1000px, scrolled to `top`. */
function listAt(top: number) {
    const { getByTestId } = render(<List />);
    const list = getByTestId("list");
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 });
    list.scrollTop = top;
    return list;
}

const wheel = (list: HTMLElement, deltaY: number) => {
    const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
    list.dispatchEvent(event);
    return event;
};

afterEach(() => vi.restoreAllMocks());

describe("a list that hands the wheel on to the page", () => {
    it("scrolls the page when the list is at its end, at the bottom or a fraction short of it", () => {
        const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
        const list = listAt(599.5);
        const event = wheel(list, 120);
        expect(event.defaultPrevented).toBe(true);
        expect(scrollBy).toHaveBeenCalledWith({ top: 120 });
    });

    it("scrolls the page upwards from the top of the list", () => {
        const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
        wheel(listAt(0), -80);
        expect(scrollBy).toHaveBeenCalledWith({ top: -80 });
    });

    it("leaves the wheel to the list while it can still scroll that way", () => {
        const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
        const list = listAt(300);
        expect(wheel(list, 120).defaultPrevented).toBe(false);
        expect(wheel(list, -120).defaultPrevented).toBe(false);
        expect(scrollBy).not.toHaveBeenCalled();
    });
});
