/**
 * A CSS length measured in pixels: a variable that holds a `calc()` or an `env()` (the top bar's height, the phone's
 * bottom bar with the home indicator under it) comes out as the number the page is drawn with. `fallback` is used where
 * the page has no such length (jsdom, which draws nothing).
 */
export function cssPx(length: string, fallback: number): number {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;height:${length}`;
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return px > 0 ? px : fallback;
}
