import { vi } from "vitest";
import type { Schemas } from "@/api/types";

/**
 * jsdom has no microphone, no MediaRecorder and no audio playback. This stands in for them: asking for the
 * microphone answers with a stream whose tracks can be checked, and a recorder "records" one small WebM chunk.
 * Call `restore()` after the test.
 */
export function stubVoice({ micBlocked = false }: { micBlocked?: boolean } = {}) {
    const stopTrack = vi.fn();
    const getUserMedia = micBlocked
        ? vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"))
        : vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });

    const recorders: FakeRecorder[] = [];
    class FakeRecorder {
        static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
        state: "inactive" | "recording" = "inactive";
        mimeType = "audio/webm;codecs=opus";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        stream: unknown;
        options: unknown;
        constructor(stream: unknown, options: unknown) {
            this.stream = stream;
            this.options = options;
            recorders.push(this);
        }
        start() { this.state = "recording"; }
        stop() {
            this.state = "inactive";
            this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
            this.onstop?.();
        }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);

    const play = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => "blob:voice");
    URL.revokeObjectURL = vi.fn();

    return {
        getUserMedia, stopTrack, recorders, play,
        restore() {
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
            Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
        },
    };
}

/** The answer of POST /api/files/voice. */
export const savedVoice = (id: number): Schemas["FileResponse"] => ({ id, name: "voice-note.webm", mimeType: "audio/webm", kind: "audio", sizeBytes: 5, createdAt: "2026-09-30T08:59:00Z" });
