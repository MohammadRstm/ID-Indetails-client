import { useLayoutEffect, useState, type RefObject } from "react";

/** The width of a chart's box, followed as the page resizes. */
export function useWidth(ref: RefObject<HTMLElement | null>, initial = 600): number {
    const [width, setWidth] = useState(initial);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        const apply = (w: number) => {
            if (w) setWidth((prev) => (Math.abs(w - prev) > 1 ? w : prev));
        };
        apply(node.clientWidth);
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
        observer.observe(node);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}

/** A bar with rounded top corners, as an SVG path. */
export function barPath(x: number, y: number, w: number, h: number, r: number): string {
    r = Math.min(r, w / 2, h);
    if (h <= 0.6) return `M${x} ${y + h}h${w}v-0.6h${-w}z`;
    return `M${x} ${y + h}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h}z`;
}

/** A round axis maximum at or above v: 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceMax(v: number): number {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
}

/** The heat level 0–4 of a day's minutes (1.5 h, 3.5 h, 6 h and 8 h by default). */
export function heatLevel(minutes: number, scale: [number, number, number, number] = [1.5, 3.5, 6, 8]): number {
    if (!minutes) return 0;
    const h = minutes / 60;
    if (h < scale[0]) return 1;
    if (h < scale[1]) return 2;
    if (h < scale[2]) return 3;
    return 4;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const fmtCount = (v: number) => Math.round(v).toLocaleString("en-US");
