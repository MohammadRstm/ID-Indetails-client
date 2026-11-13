import { useEffect, useRef, useState } from "react";
import BlobFigure from "../blob/BlobFigure";
import type { ProtonMood } from "../blob/protonMood";
import { easeFactor, easeLook, follow, frameGapMs, lookOf, syllableBands, type OrbSignal } from "./orbLook";
import { canDrawOrb, createOrbRenderer } from "./orbRenderer";

type OrbFigureProps = {
    mood: ProtonMood;
    /** Proton's voice and the person's at a moment, read each frame (never through React state). */
    signalAt: (now: number) => OrbSignal;
    /** For the classic blob, shown instead when this browser can't draw the orb. */
    voiceAt: (now: number) => number;
    /** No movement: reduced motion or "Calm animations". The orb stands still and only its colour follows the mood. */
    still: boolean;
};

const QUIET: OrbSignal = { speak: 0, bands: null, hear: 0 };
/** Time and the flowing light start over every hour, so the shader's numbers never grow too large to be exact. */
const WRAP = 3600;
/** A rise in loudness this sharp is a syllable starting: the light flares a little with it. */
const ONSET = 0.18;

/** Whether the orb sits on a light page (the theme's --proton-orb-light), which changes how its glow is drawn. */
const onLightPage = (element: Element) => getComputedStyle(element).getPropertyValue("--proton-orb-light").trim() === "1";

/**
 * Proton as a living orb: a ring of violet light round a clear centre, drawn by WebGL each frame. It breathes at
 * rest, leans in while listening (with the person's voice, in a voice conversation), swirls while it thinks, and
 * while it talks the ring itself moves with the voice: waves run round it with the low, middle and high parts of the
 * sound, it swells with the loudness, and each syllable flares. Decorative: the button around it carries Proton's
 * name and mood. Without WebGL it is the classic blob.
 */
export default function OrbFigure({ mood, signalAt, voiceAt, still }: OrbFigureProps) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [failed, setFailed] = useState(() => !canDrawOrb());
    // what the drawing loop reads each frame, so a mood change eases the orb over instead of rebuilding it
    const input = useRef({ mood, still, signalAt });
    const wake = useRef<(() => void) | null>(null);

    useEffect(() => {
        input.current = { mood, still, signalAt };
        wake.current?.();
    }, [mood, still, signalAt]);

    useEffect(() => {
        const element = canvas.current;
        if (!element) return;
        const renderer = createOrbRenderer(element);
        if (!renderer) {
            // the classic blob takes over on the next frame
            const next = requestAnimationFrame(() => setFailed(true));
            return () => cancelAnimationFrame(next);
        }

        const started = performance.now();
        let look = lookOf(input.current.mood);
        let frame = 0;
        let last = 0;
        let phase = 0;
        let speak = 0;
        let hear = 0;
        let pulse = 0;
        let hover = 0;
        let hovered = false;
        let lightPage = onLightPage(element);
        let light = Number(lightPage);
        let bands: [number, number, number] = [0, 0, 0];

        const render = (now: number, dt: number) => {
            const { mood: current, still: calm, signalAt: signal } = input.current;
            const target = lookOf(current);
            look = calm ? target : easeLook(look, target, easeFactor(dt, 3.2));
            const t = ((now - started) / 1000) % WRAP;
            phase = (phase + dt * look.flow) % WRAP;
            const heardNow = calm ? QUIET : signal(Date.now());
            const raw = heardNow.bands ?? syllableBands(heardNow.speak, t);
            const before = speak;
            speak = follow(speak, heardNow.speak, dt);
            bands = [follow(bands[0], raw[0], dt), follow(bands[1], raw[1], dt, 30, 9), follow(bands[2], raw[2], dt, 36, 12)];
            if (heardNow.speak - before > ONSET) pulse = 1;
            pulse *= Math.exp(-dt * 5);
            hear = follow(hear, heardNow.hear, dt, 16, 5);
            hover = calm ? Number(hovered) : follow(hover, Number(hovered), dt, 12, 9);
            light = calm ? Number(lightPage) : follow(light, Number(lightPage), dt, 6, 6);
            const breath = calm ? 0 : Math.sin((t * 2 * Math.PI) / 4.6) * look.breath;
            renderer.draw({ time: calm ? 0 : t, phase: calm ? 0 : phase, look, breath, speak, bands, pulse, hear, hover, light });
        };

        const tick = (now: number) => {
            frame = 0;
            const { mood: current, still: calm } = input.current;
            if (calm) {
                // one still frame for this mood; the next change wakes it again
                render(now, 0);
                return;
            }

            frame = requestAnimationFrame(tick);
            const gap = frameGapMs(current);
            if (gap && last && now - last < gap) return;
            const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
            last = now;
            render(now, dt);
        };

        const start = () => {
            if (document.hidden || frame) return;
            last = 0;
            frame = requestAnimationFrame(tick);
        };
        const stop = () => {
            cancelAnimationFrame(frame);
            frame = 0;
        };
        const onVisibility = () => (document.hidden ? stop() : start());
        const onResize = () => {
            renderer.resize();
            start();
        };
        // the browser took the drawing context back (a GPU reset): the classic blob takes over
        const onLost = (event: Event) => {
            event.preventDefault();
            stop();
            setFailed(true);
        };

        // the button around the orb: under the pointer or keyboard focus the orb lifts a little, eased in and out
        const host = element.parentElement;
        const lift = (on: boolean) => () => {
            hovered = on;
            start();
        };
        const lifted = lift(true);
        const lowered = lift(false);

        // the theme can change while the page is open (the person's choice, or the system's)
        const retheme = () => {
            lightPage = onLightPage(element);
            start();
        };
        const themeWatch = new MutationObserver(retheme);
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
        const darkScheme = window.matchMedia?.("(prefers-color-scheme: dark)");
        darkScheme?.addEventListener("change", retheme);

        wake.current = start;
        start();
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("resize", onResize);
        element.addEventListener("webglcontextlost", onLost);
        host?.addEventListener("pointerenter", lifted);
        host?.addEventListener("pointerleave", lowered);
        host?.addEventListener("focus", lifted);
        host?.addEventListener("blur", lowered);
        return () => {
            wake.current = null;
            stop();
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("resize", onResize);
            element.removeEventListener("webglcontextlost", onLost);
            host?.removeEventListener("pointerenter", lifted);
            host?.removeEventListener("pointerleave", lowered);
            host?.removeEventListener("focus", lifted);
            host?.removeEventListener("blur", lowered);
            themeWatch.disconnect();
            darkScheme?.removeEventListener("change", retheme);
            renderer.dispose();
        };
    }, []);

    if (failed) return <BlobFigure mood={mood} voiceAt={voiceAt} still={still} />;
    return <canvas ref={canvas} className="proton-orb" aria-hidden="true" />;
}
