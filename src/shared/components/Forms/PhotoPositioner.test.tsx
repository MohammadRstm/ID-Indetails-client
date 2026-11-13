import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PhotoPositioner from "./PhotoPositioner";

// jsdom opens no pictures and draws nothing, so the browser's part is stood in for: a wide photo (twice as wide as it is
// tall), and a canvas that records what was cut from it
const bitmap = { width: 2000, height: 1000, close: vi.fn() };
const drawImage = vi.fn();
const photo = () => new File(["pixels"], "me.jpg", { type: "image/jpeg" });

beforeEach(() => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, imageSmoothingQuality: "low" } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["square"], { type: "image/webp" })));
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    drawImage.mockClear();
    bitmap.close.mockClear();
});

function open(file = photo()) {
    const onDone = vi.fn();
    const onCancel = vi.fn();
    render(<PhotoPositioner file={file} onDone={onDone} onCancel={onCancel} />);
    return { onDone, onCancel, ready: () => screen.findByRole("group", { name: /Photo position/ }) };
}

/** The square cut from the picture when "Use this photo" is pressed: where it starts and how wide it is, in the picture's pixels. */
async function cutAfterUse() {
    await userEvent.click(screen.getByRole("button", { name: "Use this photo" }));
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));
    const [source, x, y, side, , toX, toY, edgeW, edgeH] = drawImage.mock.calls[0] as number[];
    expect([toX, toY, edgeW, edgeH]).toEqual([0, 0, 480, 480]);
    return { source, x, y, side };
}

describe("placing a profile picture", () => {
    it("opens with the picture's middle in the circle, and uses that square when nothing is moved", async () => {
        const { ready, onDone } = open();
        await ready();
        const cut = await cutAfterUse();
        expect(cut.source).toBe(bitmap);
        // the picture is twice as wide as it is tall: its middle square starts a quarter of the way in
        expect(cut.x).toBeCloseTo(500, 3);
        expect(cut.y).toBeCloseTo(0, 3);
        expect(cut.side).toBeCloseTo(1000, 3);
        // the square goes on as a picture of its own
        await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
        const sent = onDone.mock.calls[0][0] as File;
        expect(sent).toBeInstanceOf(File);
        expect(sent.type).toBe("image/webp");
        expect(sent.name).toBe("photo.webp");
    });

    it("moves with the arrow keys, and stops at the picture's edge", async () => {
        const { ready } = open();
        const view = await ready();
        fireEvent.keyDown(view, { key: "ArrowRight" });
        fireEvent.keyDown(view, { key: "ArrowRight" });
        const cut = await cutAfterUse();
        // two steps of 8px to the right: the picture moved 16px of a 240px window, so the square starts that much earlier
        expect(cut.x).toBeCloseTo(500 - 16 / 0.24, 3);
    });

    it("can't be moved past its edge", async () => {
        const { ready } = open();
        const view = await ready();
        for (let i = 0; i < 40; i++) fireEvent.keyDown(view, { key: "ArrowRight", shiftKey: true });
        const cut = await cutAfterUse();
        expect(cut.x).toBeCloseTo(0, 3);
    });

    it("zooms in on the middle of what is shown", async () => {
        const { ready } = open();
        await ready();
        fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
        const cut = await cutAfterUse();
        // twice as close: half as much of the picture, around the same middle
        expect(cut.side).toBeCloseTo(500, 3);
        expect(cut.x + cut.side / 2).toBeCloseTo(1000, 3);
        expect(cut.y + cut.side / 2).toBeCloseTo(500, 3);
    });

    it("goes back to the middle when asked to", async () => {
        const { ready } = open();
        const view = await ready();
        for (let i = 0; i < 40; i++) fireEvent.keyDown(view, { key: "ArrowLeft", shiftKey: true });
        await userEvent.click(screen.getByRole("button", { name: "Center" }));
        const cut = await cutAfterUse();
        expect(cut.x).toBeCloseTo(500, 3);
    });

    it("leaves the picture as it was when cancelled", async () => {
        const { ready, onCancel, onDone } = open();
        await ready();
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onDone).not.toHaveBeenCalled();
        expect(drawImage).not.toHaveBeenCalled();
    });

    it("sends a photo the browser can't open as it is, without showing the window", async () => {
        const heic = new File(["pixels"], "me.heic", { type: "image/heic" });
        const { onDone } = open(heic);
        await waitFor(() => expect(onDone).toHaveBeenCalledWith(heic));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("sends a photo it can't read as it is, too", async () => {
        vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("not a picture"); }));
        const file = photo();
        const { onDone } = open(file);
        await waitFor(() => expect(onDone).toHaveBeenCalledWith(file));
    });
});
