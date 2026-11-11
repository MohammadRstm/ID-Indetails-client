import { http as mock, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { printFile } from "./download";

const frame = () => document.querySelector("iframe");

/** Gives the frame a window to print from, then fires the load jsdom doesn't. */
function loadFrame(print: () => void) {
    const el = frame()!;
    const afterPrint: (() => void)[] = [];
    Object.defineProperty(el, "contentWindow", { value: { focus: vi.fn(), print, addEventListener: (_: string, fn: () => void) => afterPrint.push(fn) } });
    el.dispatchEvent(new Event("load"));
    return afterPrint;
}

beforeEach(() => {
    server.use(mock.get("/api/doc.pdf", () => new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } })));
    URL.createObjectURL = vi.fn(() => "blob:doc");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    document.querySelectorAll("iframe").forEach((f) => f.remove());
    // @ts-expect-error jsdom has no matchMedia unless a test adds one
    delete window.matchMedia;
    vi.restoreAllMocks();
});

describe("printFile", () => {
    it("prints the PDF from a hidden frame, then removes the frame and the address", async () => {
        const print = vi.fn();
        const done = printFile("/doc.pdf");
        await vi.waitFor(() => expect(frame()).not.toBeNull());
        expect(frame()!.getAttribute("src")).toBe("blob:doc");
        const afterPrint = loadFrame(print);
        await done;
        expect(print).toHaveBeenCalledTimes(1);
        expect(frame()).not.toBeNull();

        afterPrint[0]();
        expect(frame()).toBeNull();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:doc");
    });

    it("opens the PDF in a new tab on a touch device, with no frame", async () => {
        window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
        const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
        await printFile("/doc.pdf");
        expect(open).toHaveBeenCalledWith("blob:doc", "_blank");
        expect(frame()).toBeNull();
    });

    it("opens a tab on an iPhone too", async () => {
        vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
        const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
        await printFile("/doc.pdf");
        expect(open).toHaveBeenCalledTimes(1);
        expect(frame()).toBeNull();
    });

    it("opens a tab when the frame refuses to print", async () => {
        const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
        const done = printFile("/doc.pdf");
        await vi.waitFor(() => expect(frame()).not.toBeNull());
        loadFrame(() => { throw new Error("blocked"); });
        await done;
        expect(open).toHaveBeenCalledWith("blob:doc", "_blank");
        expect(frame()).toBeNull();
    });

    it("saves the file when the browser blocks the new tab", async () => {
        window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
        vi.spyOn(window, "open").mockReturnValue(null);
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        await printFile("/doc.pdf", undefined, "doc.pdf");
        expect(click).toHaveBeenCalledTimes(1);
    });

    it("fails with the server's error when the PDF can't be made", async () => {
        server.use(mock.get("/api/doc.pdf", () => HttpResponse.json({ code: "nope", message: "Not today" }, { status: 422 })));
        await expect(printFile("/doc.pdf")).rejects.toMatchObject({ message: "Not today" });
        expect(frame()).toBeNull();
    });
});
