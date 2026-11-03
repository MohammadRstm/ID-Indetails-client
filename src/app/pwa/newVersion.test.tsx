import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entryScript } from "./newVersion";

const QUARTER_HOUR = 15 * 60_000;
const page = (script: string) => `<!doctype html><html><head><script type="module" crossorigin src="${script}"></script></head><body></body></html>`;

describe("a new version of the app", () => {
    let running: HTMLScriptElement;
    let server: ReturnType<typeof vi.fn>;

    /** The banner and the watch, fresh for each test (the module remembers once a new version was seen). */
    async function start(deployed: string) {
        server = vi.fn(() => Promise.resolve(new Response(page(deployed))));
        vi.stubGlobal("fetch", server);
        vi.resetModules();
        const { watchForNewVersion } = await import("./newVersion");
        const { default: UpdateBanner } = await import("./UpdateBanner");
        render(<UpdateBanner />);
        watchForNewVersion();
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
        vi.stubEnv("PROD", true);
        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        running = document.createElement("script");
        running.type = "module";
        running.setAttribute("src", "/assets/index-old.js");
        document.head.append(running);
    });

    afterEach(() => {
        running.remove();
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        Reflect.deleteProperty(document, "visibilityState");
    });

    it("reads the app's code a page loads", () => {
        expect(entryScript(page("/assets/index-a1b2.js"))).toBe("/assets/index-a1b2.js");
        expect(entryScript("<html><head></head></html>")).toBeNull();
    });

    it("offers to reload once a newer version has gone out", async () => {
        await start("/assets/index-new.js");
        expect(screen.queryByRole("status")).toBeNull();

        vi.advanceTimersByTime(QUARTER_HOUR);
        expect(await screen.findByRole("status")).toHaveTextContent("A new version of ID InDetails is ready.");
        expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
        expect(server).toHaveBeenCalledWith("/index.html", { cache: "no-store" });
    });

    it("says nothing while the server has the version running here", async () => {
        await start("/assets/index-old.js");
        vi.advanceTimersByTime(QUARTER_HOUR);
        await vi.waitFor(() => expect(server).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("asks the server at most every 15 minutes, coming back to the app included", async () => {
        await start("/assets/index-old.js");
        document.dispatchEvent(new Event("visibilitychange"));
        expect(server).not.toHaveBeenCalled();

        vi.advanceTimersByTime(QUARTER_HOUR);
        document.dispatchEvent(new Event("visibilitychange"));
        expect(server).toHaveBeenCalledTimes(1);
    });

    it("never asks outside production builds", async () => {
        vi.stubEnv("PROD", false);
        await start("/assets/index-new.js");
        vi.advanceTimersByTime(4 * QUARTER_HOUR);
        expect(server).not.toHaveBeenCalled();
    });
});
