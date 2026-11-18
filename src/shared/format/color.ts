import type { CSSProperties } from "react";

/**
 * The thirty project colours (the API's palette, its docs/projects.md, "Colours"), in the picker's hue order. Deep,
 * picked from Coolors' elegant palettes so no two are close; each reads with a white icon on it. Design and Execution
 * use the same thirty, each on its own.
 */
export const PROJECT_COLORS = [
    { name: "Raspberry", hex: "#A53860" }, { name: "Rose", hex: "#DA627D" }, { name: "Cocoa", hex: "#3D2C2E" }, { name: "Burgundy", hex: "#6E0D25" }, { name: "Dusty rose", hex: "#A26769" },
    { name: "Oxblood", hex: "#81171B" }, { name: "Coral", hex: "#FE5F55" }, { name: "Terracotta", hex: "#C75146" }, { name: "Brick", hex: "#AD2E24" }, { name: "Chestnut", hex: "#6A381F" },
    { name: "Copper", hex: "#DA7422" }, { name: "Taupe", hex: "#6F5E53" }, { name: "Walnut", hex: "#8E6E53" }, { name: "Ochre", hex: "#A59132" }, { name: "Olive", hex: "#625834" },
    { name: "Moss", hex: "#48483A" }, { name: "Sage", hex: "#808F85" }, { name: "Jade", hex: "#2A7F62" }, { name: "Forest", hex: "#26413C" }, { name: "Lagoon", hex: "#407076" },
    { name: "Petrol", hex: "#0B525B" }, { name: "Turquoise", hex: "#1B9AAA" }, { name: "Slate", hex: "#4C5760" }, { name: "Steel", hex: "#748CAB" }, { name: "Navy", hex: "#1D2D44" },
    { name: "Dusk", hex: "#4B4E6D" }, { name: "Storm", hex: "#6A6B83" }, { name: "Aubergine", hex: "#4D194D" }, { name: "Mulberry", hex: "#6D466B" }, { name: "Heather", hex: "#A28F9D" },
] as const;

/** The palette's name for a colour; null for one outside it (an older project's, or #RRGGBBAA). */
export function colorName(hex: string | null | undefined): string | null {
    if (!hex) return null;
    return PROJECT_COLORS.find((c) => c.hex.toLowerCase() === hex.trim().toLowerCase())?.name ?? null;
}

/** #RRGGBB; the API also keeps #RRGGBBAA, which some older projects have. */
export const isHexColor = (value: string) => /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());

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
