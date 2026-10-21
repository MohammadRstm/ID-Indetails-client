import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { preparePicture } from "./preparePicture";
import { uploadAll, uploadingLabel } from "./upload";

describe("uploading files", () => {
    it("sends several a few at a time, answering their ids in the order picked, and says how far it has got", async () => {
        let atOnce = 0;
        let most = 0;
        let arrived = 0;
        server.use(http.post("/api/files", async () => {
            const id = ++arrived;
            atOnce++;
            most = Math.max(most, atOnce);
            // the first to arrive is the slowest, so the answers come back out of order
            await new Promise((done) => setTimeout(done, id === 1 ? 30 : 5));
            atOnce--;
            return HttpResponse.json({ id, name: `${id}.png`, mimeType: "image/png", kind: "image", sizeBytes: 4, createdAt: "2026-10-21T10:00:00Z" }, { status: 201 });
        }));
        const files = ["a", "b", "c", "d", "e"].map((n) => new File(["data"], `${n}.png`, { type: "image/png" }));
        const heard: number[] = [];

        const ids = await uploadAll(files, { onProgress: (done) => heard.push(done) });

        expect(ids).toEqual([1, 2, 3, 4, 5]);
        expect(most).toBe(3);
        expect(heard.at(-1)).toBe(5);
    });

    it("leaves a file the browser can't redraw as it is", async () => {
        const video = new File(["data"], "clip.mp4", { type: "video/mp4" });
        expect(await preparePicture(video)).toBe(video);
    });

    it("says how far an upload has got", () => {
        expect(uploadingLabel(1, 0, 0.4)).toBe("Uploading 40%");
        expect(uploadingLabel(5, 1, 0.38)).toBe("Uploading 2 of 5 · 38%");
    });
});
