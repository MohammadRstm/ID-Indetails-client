import { describe, expect, it } from "vitest";
import { PROJECT_COLORS, chartColors, hexToHsv, hsvToHex, inkOn, isHexColor } from "./color";

describe("project colours", () => {
    it("are sixteen different hex colours", () => {
        expect(new Set(PROJECT_COLORS.map((c) => c.hex)).size).toBe(16);
        expect(PROJECT_COLORS.every((c) => isHexColor(c.hex))).toBe(true);
    });

    it("are six or eight hex digits after a #", () => {
        expect(isHexColor("#2f9e44")).toBe(true);
        expect(isHexColor(" #2F9E4480 ")).toBe(true);
        expect(isHexColor("2F9E44")).toBe(false);
        expect(isHexColor("#2F9")).toBe(false);
        expect(isHexColor("green")).toBe(false);
    });

    it("go to hue, saturation and value and back unchanged", () => {
        for (const { hex } of PROJECT_COLORS) expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
        expect(hexToHsv("#FF0000")).toEqual({ h: 0, s: 1, v: 1 });
        expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00FF00");
        expect(hsvToHex({ h: 240, s: 0, v: 1 })).toBe("#FFFFFF");
        expect(hexToHsv("nope")).toBeNull();
    });

    it("recolour the charts inside only when there is one", () => {
        expect(chartColors(null)).toBeUndefined();
        expect(chartColors("#2F9E44")).toMatchObject({ "--chart": "#2F9E44" });
    });

    it("pick white text on dark colours and near black on light ones", () => {
        expect(inkOn("#2F6FEB")).toBe("#FFFFFF");
        expect(inkOn("#5F7085")).toBe("#FFFFFF");
        expect(inkOn("#F5E663")).toBe("#111819");
        expect(inkOn("#FFFFFF")).toBe("#111819");
    });
});
