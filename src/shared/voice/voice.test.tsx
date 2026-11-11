import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { stubVoice } from "@/test/voice";
import { useVoiceRecorder } from "./useVoiceRecorder";
import VoicePlayer from "./VoicePlayer";
import { fmtClock, MAX_VOICE_SECONDS, MIC_BLOCKED_MESSAGE, pickVoiceType, voiceExtension } from "./voiceFormat";

let voice: ReturnType<typeof stubVoice>;
beforeEach(() => { voice = stubVoice(); });
afterEach(() => voice.restore());

describe("voice formats", () => {
    it("pick the first recording type the browser supports", () => {
        expect(pickVoiceType()).toBe("audio/webm;codecs=opus");
        vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/mp4" });
        expect(pickVoiceType()).toBe("audio/mp4");
        vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
        expect(pickVoiceType()).toBeUndefined();
    });

    it("name the file with the extension the API stores", () => {
        expect(voiceExtension("audio/webm;codecs=opus")).toBe("webm");
        expect(voiceExtension("audio/ogg;codecs=opus")).toBe("ogg");
        expect(voiceExtension("audio/mp4")).toBe("m4a");
    });

    it("show times as minutes and seconds", () => {
        expect([fmtClock(0), fmtClock(7.9), fmtClock(65), fmtClock(Infinity), fmtClock(300)]).toEqual(["0:00", "0:07", "1:05", "0:00", "5:00"]);
    });
});

describe("the voice recorder", () => {
    it("stops by itself at five minutes, keeps the recording and lets the microphone go", async () => {
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useVoiceRecorder());
            await act(async () => { await result.current.start(); });
            expect(result.current.state).toBe("recording");
            act(() => { vi.advanceTimersByTime((MAX_VOICE_SECONDS - 1) * 1000); });
            expect(result.current.state).toBe("recording");
            act(() => { vi.advanceTimersByTime(1000); });
            expect(result.current.state).toBe("recorded");
            expect(result.current.seconds).toBe(MAX_VOICE_SECONDS);
            expect(result.current.blob?.type).toBe("audio/webm;codecs=opus");
            expect(voice.stopTrack).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("lets the microphone go when the caller goes away mid-recording", async () => {
        const { result, unmount } = renderHook(() => useVoiceRecorder());
        await act(async () => { await result.current.start(); });
        unmount();
        expect(voice.stopTrack).toHaveBeenCalled();
    });

    it("says how to allow the microphone when there is none to use", async () => {
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
        const { result } = renderHook(() => useVoiceRecorder());
        await act(async () => { await result.current.start(); });
        expect(result.current.error).toBe(MIC_BLOCKED_MESSAGE);
        expect(result.current.state).toBe("idle");
    });
});

describe("the voice player", () => {
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
    );

    it("plays and pauses, and shows where it is and how long it is", async () => {
        const { container } = render(<VoicePlayer src="blob:note" />, { wrapper: wrap });
        const audio = container.querySelector("audio") as HTMLAudioElement;
        Object.defineProperty(audio, "duration", { configurable: true, value: 65 });
        fireEvent.durationChange(audio);
        expect(screen.getByText("0:00 / 1:05")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Play voice note" }));
        expect(voice.play).toHaveBeenCalled();
        fireEvent.play(audio);
        Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 7 });
        fireEvent.timeUpdate(audio);
        expect(screen.getByText("0:07 / 1:05")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pause voice note" })).toBeInTheDocument();
    });

    it("works out the length of a recording that reports an infinite one, then goes back to the start", () => {
        const { container } = render(<VoicePlayer src="blob:note" />, { wrapper: wrap });
        const audio = container.querySelector("audio") as HTMLAudioElement;
        let duration = Infinity;
        Object.defineProperty(audio, "duration", { configurable: true, get: () => duration });
        Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 0 });
        fireEvent.loadedMetadata(audio);
        // it jumped far past the end to make the browser learn the real length
        expect(audio.currentTime).toBeGreaterThan(1e9);
        duration = 12;
        fireEvent.durationChange(audio);
        expect(audio.currentTime).toBe(0);
        expect(screen.getByText("0:00 / 0:12")).toBeInTheDocument();
    });

    it("says so when a saved voice note can't be loaded", async () => {
        server.use(http.get("/api/files/9001", () => HttpResponse.json({ code: "not_found", message: "File not found." }, { status: 404 })));
        render(<VoicePlayer fileId={9001} />, { wrapper: wrap });
        expect(await screen.findByText("The voice note couldn't be loaded.")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("button", { name: "Play voice note" })).not.toBeInTheDocument());
    });
});
