/** A voice note stops by itself after this long. */
export const MAX_VOICE_SECONDS = 5 * 60;

/** What the recorder says when the microphone can't be used (blocked, missing, or a browser without recording). */
export const MIC_BLOCKED_MESSAGE = "Allow the microphone in your browser to record a voice note.";

/** The recording formats the API takes (WebM, Ogg, MP4), best first. The browser records in the first it supports. */
const VOICE_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

/** The first of the formats this browser can record, or undefined when it can't say (it then picks its own). */
export function pickVoiceType(): string | undefined {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
    return VOICE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

/** The file extension the API stores a recording under: ".webm", ".ogg" or ".m4a". */
export function voiceExtension(mimeType: string): string {
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
    return "webm";
}

/** "0:07", "1:05": a length or position in a voice note. */
export function fmtClock(seconds: number): string {
    const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
