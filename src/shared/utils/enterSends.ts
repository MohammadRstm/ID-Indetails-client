import type { KeyboardEvent } from "react";
import { touchScreen } from "./touchScreen";

/**
 * Whether a key press in a chat box sends what is written: Enter on a computer. Shift+Enter, Enter while an input
 * method is still composing a word, and Enter on a touch screen (phones and tablets, in a browser or the installed
 * app), where the send button sends, start a new line instead.
 */
export function enterSends(e: KeyboardEvent<HTMLElement>): boolean {
    return e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touchScreen();
}
