import { HttpResponse } from "msw";

/*
 * Test helpers: the streaming endpoint's answers as Server-Sent Events, the way the API sends them.
 */

const encoder = new TextEncoder();

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

/** A whole answer at once: optional status lines, the text in two pieces, then done with `reply`. */
export function sseReply(reply: { reply: string }, statuses: string[] = []) {
    const half = Math.ceil(reply.reply.length / 2);
    const body = statuses.map((text) => event("status", { text })).join("")
        + event("delta", { trip: 1, text: reply.reply.slice(0, half) })
        + event("delta", { trip: 1, text: reply.reply.slice(half) })
        + event("done", reply);
    return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
}

/** An error after the answer started: still a 200, with an error event in the API's uniform shape. */
export function sseError(error: { type: string; code: string; message: string }) {
    return new HttpResponse(event("error", { ...error, errors: null, traceId: "t" }), { headers: { "Content-Type": "text/event-stream" } });
}

/**
 * An answer the test writes as it goes: `send` pushes an event, `finish` ends it with done. The stream also ends if
 * the client aborts (Stop).
 */
export function liveReply() {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
    return {
        response: () => new HttpResponse(stream, { headers: { "Content-Type": "text/event-stream" } }),
        send: (name: string, data: unknown) => controller?.enqueue(encoder.encode(event(name, data))),
        finish: (reply: unknown) => {
            controller?.enqueue(encoder.encode(event("done", reply)));
            controller?.close();
        },
    };
}
