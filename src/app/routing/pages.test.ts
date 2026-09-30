import { afterEach, describe, expect, it, vi } from "vitest";
import { load } from "./pages";

afterEach(() => sessionStorage.clear());

describe("a page's code", () => {
    it("reloads the app once when it can't be fetched, then shows the error", async () => {
        const reload = vi.fn();
        const missing = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));
        void load(missing, reload)();
        await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
        // after the reload, a second failure is a real one
        await expect(load(missing, reload)()).rejects.toThrow("Failed to fetch dynamically imported module");
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("forgets the reload once a page loads again", async () => {
        const reload = vi.fn();
        sessionStorage.setItem("hourline-reloaded-for-update", "1");
        await expect(load(() => Promise.resolve({ default: "page" }), reload)()).resolves.toEqual({ default: "page" });
        expect(sessionStorage.getItem("hourline-reloaded-for-update")).toBeNull();
    });
});
