import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

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
});
afterAll(() => server.close());
