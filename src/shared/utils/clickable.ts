import type { KeyboardEvent, MouseEvent } from "react";

type Open = (e: MouseEvent | KeyboardEvent) => void;

/**
 * Makes a clickable row, tile or text reachable from the keyboard, as the prototype's click targets are only
 * reachable with a mouse: Tab stops on it, Enter (or Space) opens it. Nothing when there is nothing to open.
 * A table row keeps its row role; anything else says it is a button or a link.
 */
export function clickable(open: Open | undefined | null | false, role?: "button" | "link") {
    if (!open) return {};
    return {
        role,
        tabIndex: 0,
        onClick: open,
        onKeyDown: (e: KeyboardEvent) => {
            // only the element itself: a button or field inside it keeps its own keys
            if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
            e.preventDefault();
            open(e);
        },
    };
}
