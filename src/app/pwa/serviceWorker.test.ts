import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./serviceWorker";

function fakeWorkers() {
    const update = vi.fn(() => Promise.resolve());
    const register = vi.fn(() => Promise.resolve({ update }));
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    return { register, update };
}

const load = () => window.dispatchEvent(new Event("load"));
const comeBack = () => document.dispatchEvent(new Event("visibilitychange"));

describe("the service worker", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.useRealTimers();
        Reflect.deleteProperty(navigator, "serviceWorker");
        Reflect.deleteProperty(document, "visibilityState");
    });

    it("isn't registered outside production builds", () => {
        const { register } = fakeWorkers();
        registerServiceWorker();
        load();
        expect(register).not.toHaveBeenCalled();
    });

    it("is registered from the site's root once the page has loaded, never from the browser's cache", () => {
        vi.stubEnv("PROD", true);
        const { register } = fakeWorkers();
        registerServiceWorker();
        expect(register).not.toHaveBeenCalled();
        load();
        expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    });

    it("looks for a new worker when the app comes back, at most once an hour", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.stubEnv("PROD", true);
        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        const { register, update } = fakeWorkers();
        registerServiceWorker();
        load();
        await register.mock.results[0].value;

        comeBack();
        expect(update).not.toHaveBeenCalled();
        vi.setSystemTime(Date.now() + 61 * 60_000);
        comeBack();
        comeBack();
        expect(update).toHaveBeenCalledTimes(1);
    });
});
