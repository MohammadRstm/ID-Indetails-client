/*
 * How long Proton "talks" for a reply, and how loudly at each moment: the blob inflates with the level, dipping on
 * spaces and punctuation the way a voice pauses between words.
 */

const MS_PER_CHAR = 28;
const MIN_MS = 900;
const MAX_MS = 4_200;

export function talkDuration(text: string): number {
    return Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHAR));
}

/** 0 (quiet) to 1 (loud) at `elapsed` ms into saying `text`; 0 once it's said. */
export function talkLevel(text: string, elapsed: number): number {
    const duration = talkDuration(text);
    if (elapsed < 0 || elapsed >= duration || text.length === 0) return 0;
    const at = Math.floor((elapsed / duration) * text.length);
    const char = text[at];
    if (/[.!?…]/.test(char)) return 0.05;
    if (/[\s,;:—–-]/.test(char)) return 0.25;
    // a little variation between letters, the same every time for the same text
    return 0.65 + 0.35 * Math.abs(Math.sin(at * 1.7));
}
