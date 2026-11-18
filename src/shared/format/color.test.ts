import { describe, expect, it } from "vitest";
import { PROJECT_COLORS, chartColors, colorName, inkOn, isHexColor } from "./color";

describe("project colours", () => {
    it("are thirty different hex colours with different names, each readable with white on it", () => {
        expect(new Set(PROJECT_COLORS.map((c) => c.hex)).size).toBe(30);
        expect(new Set(PROJECT_COLORS.map((c) => c.name)).size).toBe(30);
        expect(PROJECT_COLORS.every((c) => isHexColor(c.hex))).toBe(true);
        expect(PROJECT_COLORS.every((c) => inkOn(c.hex) === "#FFFFFF")).toBe(true);
    });

    it("are named, whatever the case of the hex code; a colour outside the palette has no name", () => {
        expect(colorName("#2a7f62")).toBe("Jade");
        expect(colorName("#123456")).toBeNull();
        expect(colorName(null)).toBeNull();
    });

    it("are six or eight hex digits after a #", () => {
        expect(isHexColor("#2f9e44")).toBe(true);
        expect(isHexColor(" #2F9E4480 ")).toBe(true);
        expect(isHexColor("2F9E44")).toBe(false);
        expect(isHexColor("#2F9")).toBe(false);
        expect(isHexColor("green")).toBe(false);
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
