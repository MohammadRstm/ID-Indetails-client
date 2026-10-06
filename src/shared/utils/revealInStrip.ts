/** Scrolls a row that scrolls sideways (tabs on a phone) just enough to show the chosen item, without moving the page. */
export function revealInStrip(item: HTMLElement | null) {
    const strip = item?.parentElement;
    if (!item || !strip) return;
    const s = strip.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.left < s.left) strip.scrollLeft -= s.left - r.left + 16;
    else if (r.right > s.right) strip.scrollLeft += r.right - s.right + 16;
}
