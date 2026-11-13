import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/shared/utils/cx";
import type { ProtonMood } from "../blob/protonMood";
import { voiceBands } from "../protonVoice";
import OrbFigure from "./OrbFigure";
import type { OrbSignal } from "./orbLook";

const MOODS: ProtonMood[] = ["idle", "listening", "thinking", "working", "talking", "proposing", "happy", "error", "asleep"];
const QUIET: OrbSignal = { speak: 0, bands: null, hear: 0 };

type Voice = "none" | "simulated" | "mic-speaks" | "mic-hears";
const VOICES: { value: Voice; label: string; mood?: ProtonMood }[] = [
    { value: "none", label: "No voice" },
    { value: "simulated", label: "Proton speaks (simulated)", mood: "talking" },
    { value: "mic-speaks", label: "Proton speaks (your microphone)", mood: "talking" },
    { value: "mic-hears", label: "You speak (your microphone)", mood: "listening" },
];

/** Speech as the orb would hear it: syllables a few times a second, in phrases with short pauses between them. */
function simulatedVoice(t: number): OrbSignal {
    const inPhrase = Math.sin(t * 0.85) + Math.sin(t * 0.37 + 1) > -0.6;
    if (!inPhrase) return QUIET;
    const syllable = Math.max(0, Math.sin(t * 2 * Math.PI * 4.1 + 1.8 * Math.sin(t * 1.3)));
    const stress = 0.6 + 0.4 * Math.sin(t * 2.3);
    const speak = Math.min(1, 0.25 + 0.75 * syllable * stress);
    return {
        speak,
        bands: [speak * (0.55 + 0.45 * Math.sin(t * 3.1)), speak * (0.4 + 0.6 * syllable), speak * 0.6 * (0.5 + 0.5 * Math.sin(t * 11.7))],
        hear: 0,
    };
}

/**
 * The orb in the component kit (development only): every mood, a simulated voice, or your own microphone through
 * the same meter Proton's voice uses, on a dark and a light page, at its size in the dock and larger.
 */
export default function OrbPreview() {
    const [mood, setMood] = useState<ProtonMood>("idle");
    const [voice, setVoice] = useState<Voice>("none");
    const [still, setStill] = useState(false);
    const [refused, setRefused] = useState(false);
    const chosen = useRef<Voice>("none");
    const mic = useRef<{ level: number; bands: [number, number, number] } | null>(null);

    useEffect(() => {
        chosen.current = voice;
        if (voice !== "mic-speaks" && voice !== "mic-hears") return;
        let cancelled = false;
        let stream: MediaStream | null = null;
        let context: AudioContext | null = null;
        let frame = 0;
        void navigator.mediaDevices.getUserMedia({ audio: true }).then((granted) => {
            if (cancelled) {
                granted.getTracks().forEach((track) => track.stop());
                return;
            }

            stream = granted;
            context = new AudioContext();
            const analyser = context.createAnalyser();
            analyser.fftSize = 512;
            context.createMediaStreamSource(granted).connect(analyser);
            const samples = new Float32Array(analyser.fftSize);
            const spectrum = new Uint8Array(analyser.frequencyBinCount);
            const binHz = context.sampleRate / analyser.fftSize;
            const tick = () => {
                analyser.getFloatTimeDomainData(samples);
                const level = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
                analyser.getByteFrequencyData(spectrum);
                mic.current = { level: level > 0.02 ? Math.min(1, level * 8) : 0, bands: voiceBands(spectrum, binHz) };
                frame = requestAnimationFrame(tick);
            };
            tick();
        }).catch(() => {
            setRefused(true);
            setVoice("none");
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            stream?.getTracks().forEach((track) => track.stop());
            void context?.close();
            mic.current = null;
        };
    }, [voice]);

    const signalAt = useCallback((now: number): OrbSignal => {
        const heard = mic.current;
        switch (chosen.current) {
            case "simulated":
                return simulatedVoice(now / 1000);
            case "mic-speaks":
                return heard ? { speak: heard.level, bands: heard.level > 0 ? heard.bands : null, hear: 0 } : QUIET;
            case "mic-hears":
                return heard ? { speak: 0, bands: null, hear: heard.level } : QUIET;
            default:
                return QUIET;
        }
    }, []);
    const voiceAt = useCallback((now: number) => signalAt(now).speak, [signalAt]);

    const pick = (next: Voice) => {
        setRefused(false);
        setVoice(next);
        const voiceMood = VOICES.find((v) => v.value === next)?.mood;
        if (voiceMood) setMood(voiceMood);
    };

    return (
        <div className="orb-preview">
            <div className="orb-stages">
                <div className="orb-stage dark">
                    <div className="orb-holder" style={{ width: 150, height: 150 }}><OrbFigure mood={mood} signalAt={signalAt} voiceAt={voiceAt} still={still} /></div>
                    <div className="orb-holder" style={{ width: 64, height: 64 }}><OrbFigure mood={mood} signalAt={signalAt} voiceAt={voiceAt} still={still} /></div>
                </div>
                <div className="orb-stage light">
                    <div className="orb-holder" style={{ width: 64, height: 64 }}><OrbFigure mood={mood} signalAt={signalAt} voiceAt={voiceAt} still={still} /></div>
                </div>
            </div>
            <div className="row wrap mt" style={{ gap: 6 }} role="group" aria-label="Mood">
                {MOODS.map((m) => (
                    <button key={m} className={cx("btn btn-sm", mood === m && "btn-primary")} aria-pressed={mood === m} onClick={() => setMood(m)}>{m}</button>
                ))}
            </div>
            <div className="row wrap mt-s" style={{ gap: 6 }} role="group" aria-label="Voice">
                {VOICES.map((v) => (
                    <button key={v.value} className={cx("btn btn-sm", voice === v.value && "btn-primary")} aria-pressed={voice === v.value} onClick={() => pick(v.value)}>{v.label}</button>
                ))}
                <button className={cx("btn btn-sm", still && "btn-primary")} aria-pressed={still} onClick={() => setStill((s) => !s)}>Still (reduced motion)</button>
            </div>
            {refused && <div className="err mt-s" style={{ fontSize: 12 }}>The microphone wasn't allowed, so there is no voice to show.</div>}
        </div>
    );
}
