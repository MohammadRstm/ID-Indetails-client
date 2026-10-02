import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./server";
import { clearToasts, TOAST_MS } from "@/shared/components/Feedback/toast";

// Toasts stay put through a test, however slowly it runs (toast.test.ts checks the real timings).
TOAST_MS.short = TOAST_MS.long = 60_000;

// Pages load on demand, so the first test to open one waits for its code as well as its data.
configure({ asyncUtilTimeout: 5000 });

// The live connection talks to a stand-in hub: tests send its signals with live.emit.
vi.mock("@microsoft/signalr", () => import("./liveHub"));

// jsdom doesn't scroll, or watch sizes.
window.scrollTo = () => {};
Element.prototype.scrollTo = () => {};
Element.prototype.scrollBy = () => {};
window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
    cleanup();
    server.resetHandlers();
    // toasts live outside React, so one test's would show in the next
    clearToasts();
});
afterAll(() => server.close());
