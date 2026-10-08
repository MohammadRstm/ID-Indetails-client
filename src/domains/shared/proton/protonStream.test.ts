import { describe, expect, it } from "vitest";
import { parseSse } from "./protonStream";

describe("reading Proton's stream", () => {
    it("splits complete events and keeps a cut-off one for the next piece", () => {
        const { events, rest } = parseSse('event: status\ndata: {"text":"Looking it up…"}\n\nevent: delta\ndata: {"trip":1,"te');
        expect(events).toEqual([{ name: "status", data: '{"text":"Looking it up…"}' }]);

        const next = parseSse(`${rest}xt":"Hi"}\n\n`);
        expect(next.events).toEqual([{ name: "delta", data: '{"trip":1,"text":"Hi"}' }]);
        expect(next.rest).toBe("");
    });

    it("skips the pings and accepts CRLF line ends", () => {
        const { events } = parseSse(': ping\n\nevent: done\r\ndata: {"reply":"Done."}\r\n\r\n');
        expect(events).toEqual([{ name: "done", data: '{"reply":"Done."}' }]);
    });
});
