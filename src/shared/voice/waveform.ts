/** How many bars a voice note's waveform has. */
export const BARS = 40;
/** The lowest a bar goes, so silence still shows as a dotted line. */
const FLOOR = 0.14;

export type Waveform = { peaks: number[]; duration: number };

// decoded once per voice note: in memory, and saved notes in the browser too, so a reload doesn't decode again
const memory = new Map<string, Waveform>();
const STORE = "voice-waveform:";
// one decoder for every note: browsers allow only a few audio contexts at a time
let decoder: BaseAudioContext | null = null;

/** The loudness of each of `bars` stretches of the recording, 0 to 1, scaled so the loudest is 1. */
export function peaksOf(samples: Float32Array, bars = BARS): number[] {
    const size = Math.max(1, Math.floor(samples.length / bars));
    const levels: number[] = [];
    for (let b = 0; b < bars; b++) {
        let sum = 0;
        const end = Math.min(samples.length, (b + 1) * size);
        for (let i = b * size; i < end; i++) sum += samples[i] * samples[i];
        levels.push(Math.sqrt(sum / Math.max(1, end - b * size)));
    }
    const loudest = Math.max(...levels, 1e-6);
    // the square root lifts quiet speech, as a voice app's waveform does
    return levels.map((l) => Math.round(Math.max(FLOOR, Math.sqrt(l / loudest)) * 100) / 100);
}

/** A gentle made-up shape for a note not decoded yet (or one the browser can't decode), the same each time for the same note. */
export function placeholderPeaks(seed: string, bars = BARS): number[] {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return Array.from({ length: bars }, (_, i) => {
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        const wave = 0.45 + 0.3 * Math.sin(i / 3.1) * Math.sin(i / 7.3);
        return Math.round(Math.max(FLOOR, Math.min(1, wave + ((h >>> 0) % 100) / 400)) * 100) / 100;
    });
}

function stored(key: string): Waveform | null {
    try {
        const raw = localStorage.getItem(STORE + key);
        const w = raw ? (JSON.parse(raw) as Waveform) : null;
        return w && Array.isArray(w.peaks) && w.peaks.length === BARS ? w : null;
    } catch {
        return null;
    }
}

/** What is already known about a note's waveform, without decoding anything. */
export function knownWaveform(key: string): Waveform | null {
    const known = memory.get(key) ?? stored(key);
    if (known) memory.set(key, known);
    return known;
}

/**
 * Decodes the recording once and works out its waveform (and its true length: Chrome's recordings don't say it).
 * Null where the browser can't decode it; the player then keeps the made-up shape.
 */
export async function loadWaveform(key: string, url: string, keep: boolean): Promise<Waveform | null> {
    const known = knownWaveform(key);
    if (known) return known;
    if (typeof OfflineAudioContext === "undefined") return null;
    try {
        decoder ??= new OfflineAudioContext(1, 1, 44100);
        const audio = await decoder.decodeAudioData(await (await fetch(url)).arrayBuffer());
        const w: Waveform = { peaks: peaksOf(audio.getChannelData(0)), duration: audio.duration };
        memory.set(key, w);
        if (keep) {
            try { localStorage.setItem(STORE + key, JSON.stringify(w)); } catch { /* full or blocked: memory is enough */ }
        }
        return w;
    } catch {
        return null;
    }
}
