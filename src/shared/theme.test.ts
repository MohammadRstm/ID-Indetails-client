import { afterEach, describe, expect, it } from "vitest";
import { setTheme } from "./theme";

describe("the theme", () => {
    afterEach(() => {
        setTheme("light");
        document.head.querySelector('meta[name="theme-color"]')?.remove();
    });

    it("gives the phone's bar the top bar's colour, light or dark", () => {
        const bar = document.createElement("meta");
        bar.name = "theme-color";
        document.head.append(bar);

        setTheme("dark");
        expect(bar.content).toBe("#131A1B");
        setTheme("light");
        expect(bar.content).toBe("#FFFFFF");
    });
});
