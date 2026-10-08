import { ApiError, type ApiErrorBody } from "@/api/errors";
import { refreshSession, sessionExpired } from "@/api/http";
import { tokenStore } from "@/api/tokenStore";
import type { AskBody, ProtonReply } from "./protonApi";

/*
 * Asking Proton live: POST /api/proton/messages/stream answers with Server-Sent Events (status, delta, then done or
 * error). It goes through fetch rather than the axios client, which can't read a body as it arrives, so the token
 * and the one refresh on a 401 are done here the same way the client does them.
 */

export type SseEvent = { name: string; data: string };

export type StreamListener = {
    onStatus: (text: string) => void;
    onDelta: (trip: number, text: string) => void;
};

/**
 * The complete events in `buffer`, and what is left of it (an event cut off mid-way). Comments (": ping") and
 * events without data are skipped.
 */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
    const normalised = buffer.replace(/\r\n/g, "\n");
    const blocks = normalised.split("\n\n");
    const rest = blocks.pop() ?? "";
    const events: SseEvent[] = [];
    for (const block of blocks) {
        let name = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
            if (line.startsWith(":")) continue;
            if (line.startsWith("event:")) name = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }

        if (data.length > 0) events.push({ name, data: data.join("\n") });
    }

    return { events, rest };
}

/** The status the API gives each kind of error, for an error that comes as an event after the answer started. */
const STATUS: Record<string, number> = {
    validation: 400, authentication: 401, authorization: 403, not_found: 404, conflict: 409, business_rule: 422, rate_limited: 429, unavailable: 503,
};

function post(body: AskBody, signal: AbortSignal) {
    const token = tokenStore.get();
    return fetch("/api/proton/messages/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal,
    });
}

async function errorOf(response: Response): Promise<ApiError> {
    try {
        return new ApiError(response.status, (await response.json()) as Partial<ApiErrorBody>);
    } catch {
        return new ApiError(response.status, {});
    }
}

/**
 * One question, answered live: `listener` hears what Proton is doing and the answer as it is written, and the
 * promise gives the finished reply (the same as the JSON endpoint's). Rejects with an ApiError, or with the abort
 * when `signal` stops it.
 */
export async function streamQuestion(body: AskBody, listener: StreamListener, signal: AbortSignal): Promise<ProtonReply> {
    let response: Response;
    try {
        response = await post(body, signal);
        if (response.status === 401) {
            const auth = await refreshSession();
            if (!auth) {
                sessionExpired();
                throw await errorOf(response);
            }

            response = await post(body, signal);
        }
    } catch (error) {
        if (signal.aborted || error instanceof ApiError) throw error;
        throw new ApiError(0, {});
    }

    if (!response.ok || !response.body) throw await errorOf(response);

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    // a read in progress ends at once on Stop, whatever the transport does with the abort
    signal.addEventListener("abort", () => void reader.cancel().catch(() => {}), { once: true });
    let buffer = "";
    let reply: ProtonReply | null = null;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            const parsed = parseSse(buffer + value);
            buffer = parsed.rest;
            for (const event of parsed.events) {
                const data = JSON.parse(event.data) as Record<string, unknown>;
                if (event.name === "status") listener.onStatus(String(data.text));
                else if (event.name === "delta") listener.onDelta(Number(data.trip), String(data.text));
                else if (event.name === "done") reply = data as unknown as ProtonReply;
                else if (event.name === "error") throw new ApiError(STATUS[String(data.type)] ?? 500, data as Partial<ApiErrorBody>);
            }
        }
    } catch (error) {
        if (signal.aborted || error instanceof ApiError) throw error;
        throw new ApiError(0, {});
    }

    // stopped, or the connection closed before the answer was finished
    if (signal.aborted) throw signal.reason;
    if (!reply) throw new ApiError(0, {});
    return reply;
}
