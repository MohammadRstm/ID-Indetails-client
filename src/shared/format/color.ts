import type { CSSProperties } from "react";

/**
 * The project colours a new project is given one of: the API's palette (its docs/projects.md, "Colours"). Each reads
 * with a white icon on it and shows on the dark theme too. Anyone editing a project may still pick any colour.
 */
export const PROJECT_COLORS = [
    { name: "Blue", hex: "#2F6FEB" }, { name: "Indigo", hex: "#5B5BD6" }, { name: "Violet", hex: "#8B5CF6" }, { name: "Purple", hex: "#9D3FC7" },
    { name: "Magenta", hex: "#C026A3" }, { name: "Pink", hex: "#D6336C" }, { name: "Coral", hex: "#E0603F" }, { name: "Orange", hex: "#D9730D" },
    { name: "Amber", hex: "#B7791F" }, { name: "Olive", hex: "#7C8A16" }, { name: "Green", hex: "#2F9E44" }, { name: "Emerald", hex: "#0F9F75" },
    { name: "Teal", hex: "#0E8A84" }, { name: "Cyan", hex: "#0B8DB8" }, { name: "Slate", hex: "#5F7085" }, { name: "Brown", hex: "#9C6644" },
] as const;

/** #RRGGBB, the colours picked here; the API also keeps #RRGGBBAA, which some older projects have. */
export const isHexColor = (value: string) => /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());

/** Hue (0 to 360), saturation and value (0 to 1). */
export type Hsv = { h: number; s: number; v: number };

export function hexToHsv(hex: string): Hsv | null {
    if (!isHexColor(hex)) return null;
    const n = parseInt(hex.trim().slice(1, 7), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
    const f = (k: number) => {
        const x = (k + h / 60) % 6;
        return Math.round(255 * (v - v * s * Math.max(0, Math.min(x, 4 - x, 1))));
    };
    return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** The text colour that reads on a solid fill of the colour: white, or near black on a light colour. */
export function inkOn(hex: string): string {
    const n = parseInt(hex.trim().slice(1, 7), 16);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
    // the one of the two with the higher contrast against it
    return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.0587 ? "#FFFFFF" : "#111819";
}

/** Draws the charts inside in a colour of their own, such as their project's: the marks, the area under a line, the hover. */
export function chartColors(color: string | null | undefined): CSSProperties | undefined {
    if (!color) return undefined;
    return {
        ["--chart" as string]: color,
        ["--chart-soft" as string]: `color-mix(in srgb, ${color} 14%, transparent)`,
        ["--accent-2" as string]: `color-mix(in srgb, ${color} 75%, var(--ink))`,
    };
}
