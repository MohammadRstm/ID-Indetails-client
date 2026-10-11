import { useSyncExternalStore } from "react";
import { errorMessage } from "@/api/errors";
import { tokenStore } from "@/api/tokenStore";
import { onSessionReset } from "@/app/session/sessionReset";
import { endVoiceSession, startVoiceSession, type ProtonReply } from "./protonApi";
import { spoke } from "./protonStore";

/*
 * Talking to Proton. The voice model (GPT-Live, over WebRTC straight from the browser) only listens and speaks: when
 * the person asks for anything about the company or the app, it hands the request off, and this asks Proton the
 * same way as a typed question, in the same chat. Proton's answer goes back to the voice model to say, and stays in
 * the chat with its links, buttons and cards. Speech never confirms a change: the card's Confirm does.
 */

export type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ending" | "error";

export type VoiceState = {
    status: VoiceStatus;
    muted: boolean;
    /** What the person is saying now, as the voice model hears it. */
    heard: string;
    /** What the voice model said last. */
    said: string;
    /** Why voice stopped or isn't working, in words for the person. */
    message: string | null;
};

/** What became of a spoken question asked of Proton. */
export type VoiceAnswer =
    | { kind: "answer"; reply: ProtonReply }
    | { kind: "failed"; message: string; code?: string }
    | { kind: "replaced" };

export type VoiceAsk = (text: string, voice: { sessionId: string; delegationId: string }) => Promise<VoiceAnswer>;

export type VoiceStart = {
    conversationId: string | null;
    ask: VoiceAsk;
    /** The conversation the session speaks into, once the API has said which. */
    onConversation: (conversationId: string) => void;
};

/** The provider takes at most 500 tokens an append: well under that, cut between sentences. */
const CHUNK_CHARS = 1_200;
const ICE_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 5_000;
/** Transcript pieces can arrive just after the hand-off: wait this long before reading what was said. */
const HEARD_SETTLE_MS = 400;
/** A pause in the voice model's speech longer than this starts a new caption. */
const NEW_CAPTION_MS = 1_500;
const SPEAKING_LEVEL = 0.02;
const QUIET_MS = 400;
const RECONNECT_MS = 1_000;

const initial: VoiceState = { status: "idle", muted: false, heard: "", said: "", message: null };

let state = initial;
const listeners = new Set<() => void>();

function set(next: Partial<VoiceState>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
}

export function useVoice(): VoiceState {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => state,
    );
}

export const voiceActive = (status: VoiceStatus) => status !== "idle" && status !== "error";

/** Splits an answer into pieces the voice model takes, each making sense on its own. */
export function chunksOf(text: string, size = CHUNK_CHARS): string[] {
    const clean = text.trim();
    if (clean.length <= size) return clean ? [clean] : [];
    const sentences = clean.match(/[^.!?\n]+[.!?]*[\s]*|\n+/g) ?? [clean];
    const chunks: string[] = [];
    let current = "";
    for (const sentence of sentences) {
        if (current && current.length + sentence.length > size) {
            chunks.push(current.trim());
            current = "";
        }

        // a single sentence longer than a piece is cut where it must be
        let piece = sentence;
        while (piece.length > size) {
            chunks.push(piece.slice(0, size).trim());
            piece = piece.slice(size);
        }

        current += piece;
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks.filter(Boolean);
}

/** What the voice model is told once Proton has answered: the answer to say, and any card it put on the screen. */
export function voiceUpdatesOf(answer: VoiceAnswer): { say: string[]; know: string[] } {
    if (answer.kind === "replaced") return { say: [], know: [] };
    if (answer.kind === "failed") return { say: [`I couldn't get that: ${answer.message}`], know: [] };
    const { reply } = answer;
    const cards = reply.pendingActions.map((card) => `"${card.preview.title}"`);
    return {
        say: chunksOf(reply.reply),
        know: cards.length === 0 ? [] : [
            `A card is on the person's screen: ${cards.join(", ")}. Nothing has been changed. They press Confirm on it to go ahead; `
            + "saying yes does not confirm it.",
        ],
    };
}

class VoiceCall {
    private peer: RTCPeerConnection | null = null;
    private events: RTCDataChannel | null = null;
    private microphone: MediaStream | null = null;
    private readonly audio = new Audio();
    private audioContext: AudioContext | null = null;
    private meter = 0;
    private sessionId: string | null = null;
    private conversationId: string | null;
    private heard = "";
    private saidAt = 0;
    private quietSince = 0;
    private thinking = 0;
    private speaking = false;
    private started = false;
    private finished = false;
    private reconnects = 0;
    private nextEvent = 0;
    private closed: (() => void) | null = null;

    private readonly start: VoiceStart;

    constructor(start: VoiceStart) {
        this.start = start;
        this.conversationId = start.conversationId;
        this.audio.autoplay = true;
    }

    async connect(): Promise<void> {
        set({ status: "connecting", muted: false, heard: "", said: "", ...(this.reconnects === 0 && { message: null }) });
        try {
            this.microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            this.fail(error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")
                ? "Microphone access was refused. Allow it in your browser's site settings, or type your question."
                : "No microphone was found. Connect one, or type your question.");
            return;
        }

        try {
            const peer = new RTCPeerConnection();
            this.peer = peer;
            peer.addEventListener("track", (event) => this.play(new MediaStream([event.track])));
            peer.addEventListener("connectionstatechange", () => {
                if (peer.connectionState === "failed") this.lost();
            });
            for (const track of this.microphone.getAudioTracks()) {
                track.enabled = !state.muted;
                peer.addTrack(track, this.microphone);
            }

            // the event channel exists before the offer, as the provider requires
            const events = peer.createDataChannel("oai-events");
            this.events = events;
            events.addEventListener("message", ({ data }) => this.onEvent(String(data)));
            events.addEventListener("close", () => {
                if (!this.finished) this.lost();
            });

            await peer.setLocalDescription(await peer.createOffer());
            await iceGathered(peer);
            const offer = peer.localDescription?.sdp;
            if (!offer) throw new Error("No connection offer.");
            const session = await startVoiceSession({ conversationId: this.conversationId, sdp: offer });
            if (this.finished) {
                void endVoiceSession(session.sessionId, tokenStore.get());
                return;
            }

            this.sessionId = session.sessionId;
            this.conversationId = session.conversationId;
            this.start.onConversation(session.conversationId);
            await peer.setRemoteDescription({ type: "answer", sdp: session.sdp });
        } catch (error) {
            this.fail(this.sessionId ? "Voice couldn't connect. You can try again, or type your question." : errorMessage(error));
        }
    }

    /** Ends the conversation: the voice model is asked to close, and the server is told whatever happens. */
    async end(): Promise<void> {
        if (this.finished) return;
        set({ status: "ending" });
        if (this.events?.readyState === "open") {
            const closed = new Promise<void>((resolve) => { this.closed = resolve; });
            this.send({ type: "session.close" });
            await Promise.race([closed, wait(CLOSE_TIMEOUT_MS)]);
        }

        this.finish(null);
    }

    /** Leaving the page or signing out: no waiting, but the server still closes the session. */
    drop(): void {
        if (this.finished) return;
        this.finish(null);
    }

    mute(muted: boolean): void {
        this.microphone?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
        this.send({ type: muted ? "session.input_audio.mute" : "session.input_audio.unmute" });
        set({ muted });
    }

    /** Something the voice model should say that came from the app, not from a hand-off: a card's outcome. */
    tell(text: string): void {
        this.send({ type: "session.commentary.append", delegation_id: null, content: text });
    }

    private onEvent(raw: string): void {
        let event: Record<string, unknown>;
        try {
            event = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return;
        }

        switch (event.type) {
            case "session.started":
                this.started = true;
                this.reconnects = 0;
                this.update();
                break;
            case "session.input_transcript.delta":
                this.heard += String(event.delta ?? "");
                set({ heard: this.heard.trim().slice(-240) });
                break;
            case "session.output_transcript.delta": {
                const now = Date.now();
                const said = now - this.saidAt > NEW_CAPTION_MS ? "" : state.said;
                this.saidAt = now;
                set({ said: (said + String(event.delta ?? "")).slice(-240) });
                break;
            }
            case "session.delegation.created": {
                const delegation = event.delegation as { id?: string; target?: string } | undefined;
                if (delegation?.id && delegation.target !== "responses") void this.handOff(delegation.id);
                break;
            }
            case "session.closed":
                this.closed?.();
                this.finish(closedMessage(String(event.reason ?? "")));
                break;
            case "error":
                // a refused command (an append after the session closed, say) doesn't end the conversation
                if (!this.started) this.fail("Voice couldn't start. You can try again, or type your question.");
                break;
        }
    }

    /** The voice model asked for help: what the person said since the last time goes to Proton. */
    private async handOff(delegationId: string): Promise<void> {
        this.thinking++;
        this.update();
        try {
            await wait(HEARD_SETTLE_MS);
            const text = this.heard.trim();
            this.heard = "";
            set({ heard: "" });
            if (!text || !this.sessionId) {
                this.send({ type: "session.commentary.append", delegation_id: delegationId, content: "I didn't catch that. Could you say it again?" });
                return;
            }

            const answer = await this.start.ask(text, { sessionId: this.sessionId, delegationId });
            if (this.finished) return;
            const updates = voiceUpdatesOf(answer);
            for (const content of updates.know) this.send({ type: "session.thinking.append", delegation_id: delegationId, content });
            for (const content of updates.say) this.send({ type: "session.commentary.append", delegation_id: delegationId, content });
            if (answer.kind === "failed" && (answer.code === "proton_conversation_ended" || answer.code === "proton_voice_unavailable")) {
                await this.end();
                set({ message: "Our chat ended, so voice stopped. You can start it again." });
            }
        } finally {
            this.thinking--;
            this.update();
        }
    }

    private play(stream: MediaStream): void {
        this.audio.srcObject = stream;
        void Promise.resolve()
            .then(() => this.audio.play())
            .catch(() => set({ message: "Your browser blocked the sound. Click anywhere on the page to hear Proton." }));
        // how loudly the voice model speaks, for the "speaking" state and the blob's mouth
        if (typeof AudioContext === "undefined") return;
        try {
            const context = new AudioContext();
            this.audioContext = context;
            const analyser = context.createAnalyser();
            analyser.fftSize = 512;
            context.createMediaStreamSource(stream).connect(analyser);
            const samples = new Float32Array(analyser.fftSize);
            const tick = () => {
                analyser.getFloatTimeDomainData(samples);
                const level = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
                const now = Date.now();
                if (level > SPEAKING_LEVEL) {
                    this.quietSince = now;
                    spoke(Math.min(1, level * 8));
                }

                const speaking = now - this.quietSince < QUIET_MS;
                if (speaking !== this.speaking) {
                    this.speaking = speaking;
                    this.update();
                }

                this.meter = requestAnimationFrame(tick);
            };
            this.meter = requestAnimationFrame(tick);
        } catch {
            // no level meter: the conversation still works
        }
    }

    /** The connection dropped: try once more in a new session of the same chat, then give up. */
    private lost(): void {
        if (this.finished) return;
        const retry = this.started && this.reconnects === 0;
        const reconnects = this.reconnects + 1;
        this.finish(retry ? null : "Voice disconnected. You can start it again, or type your question.");
        if (!retry) return;
        set({ status: "connecting", message: "Reconnecting…" });
        setTimeout(() => {
            if (current !== null) return;
            const next = new VoiceCall({ ...this.start, conversationId: this.conversationId });
            next.reconnects = reconnects;
            current = next;
            void next.connect();
        }, RECONNECT_MS);
    }

    private fail(message: string): void {
        this.finish(message);
        set({ status: "error" });
    }

    private finish(message: string | null): void {
        if (this.finished) return;
        this.finished = true;
        cancelAnimationFrame(this.meter);
        this.microphone?.getTracks().forEach((track) => track.stop());
        this.events?.close();
        this.peer?.close();
        this.audio.srcObject = null;
        void this.audioContext?.close().catch(() => {});
        if (this.sessionId) void endVoiceSession(this.sessionId, tokenStore.get());
        if (current === this) current = null;
        set({ status: "idle", heard: "", said: "", message });
    }

    private update(): void {
        if (this.finished) return;
        set({ status: !this.started ? "connecting" : this.thinking > 0 ? "thinking" : this.speaking ? "speaking" : "listening" });
    }

    private send(event: Record<string, unknown>): void {
        if (this.events?.readyState !== "open") return;
        this.events.send(JSON.stringify({ event_id: `hourline_${++this.nextEvent}`, ...event }));
    }
}

let current: VoiceCall | null = null;

/** Starts talking to Proton. One conversation at a time. */
export async function startVoice(start: VoiceStart): Promise<void> {
    if (current) return;
    const call = new VoiceCall(start);
    current = call;
    await call.connect();
}

export const endVoice = () => current?.end() ?? Promise.resolve();

export const muteVoice = (muted: boolean) => current?.mute(muted);

/** Tells the voice model what happened on a card, so it never says a change was made before it was. */
export const tellVoice = (text: string) => current?.tell(text);

export const dismissVoiceMessage = () => set({ message: null, status: state.status === "error" ? "idle" : state.status });

function closedMessage(reason: string): string | null {
    switch (reason) {
        case "expired": return "Voice ended: it reached its time limit. You can start it again.";
        case "content": return "Voice was ended by a safety filter.";
        case "connection_lost": return "Voice disconnected. You can start it again, or type your question.";
        default: return null;
    }
}

function wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** The offer is sent whole, once the browser has found its network candidates. */
function iceGathered(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            peer.removeEventListener("icegatheringstatechange", onState);
            reject(new Error("Voice couldn't find a network route."));
        }, ICE_TIMEOUT_MS);
        function onState() {
            if (peer.iceGatheringState !== "complete") return;
            clearTimeout(timeout);
            peer.removeEventListener("icegatheringstatechange", onState);
            resolve();
        }

        peer.addEventListener("icegatheringstatechange", onState);
    });
}

// leaving the page or signing out ends the conversation, so it isn't left running (and paid for) on the provider
if (typeof window !== "undefined") window.addEventListener("pagehide", () => current?.drop());
onSessionReset(() => {
    current?.drop();
    state = initial;
    listeners.forEach((l) => l());
});
