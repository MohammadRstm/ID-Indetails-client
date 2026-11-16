/**
 * A touch screen (phones and tablets, in a browser or the installed app): no right-click, no hover, and usually no
 * keyboard. A browser without media queries (a test's jsdom) is a computer.
 */
export function touchScreen(): boolean {
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}
