import { useId, useRef } from "react";
import type { ProtonMood } from "./protonMood";
import { restingPath, useBlobMotion } from "./useBlobMotion";

type BlobFigureProps = {
    mood: ProtonMood;
    saying: { text: string; until: number } | null;
    /** No moving shapes: reduced motion or "Calm animations". */
    still: boolean;
};

/** The eyes for each mood, in the 100 × 100 box: open, smiling arcs, or closed lines. */
function Eyes({ mood }: { mood: ProtonMood }) {
    if (mood === "asleep") {
        return <g className="proton-eyes closed"><path d="M34 50 q5 3 10 0" /><path d="M56 50 q5 3 10 0" /></g>;
    }

    if (mood === "happy") {
        return <g className="proton-eyes closed"><path d="M34 51 q5 -6 10 0" /><path d="M56 51 q5 -6 10 0" /></g>;
    }

    // looking up while it thinks, narrowed while it works or something went wrong
    const y = mood === "thinking" || mood === "working" ? 44 : 48;
    const ry = mood === "working" || mood === "error" ? 3.2 : 5.2;
    return (
        <g className="proton-eyes open">
            <ellipse cx="39" cy={y} rx="3.6" ry={ry} />
            <ellipse cx="61" cy={y} rx="3.6" ry={ry} />
        </g>
    );
}

/**
 * Proton as a soft, furry blob: a blurred glow behind it (only ever moved, never redrawn), a body and a fringe of
 * fur that wobble and inflate while it talks, a sheen, and eyes that show its mood. Decorative: the button around it
 * carries its name and mood for screen readers.
 */
export default function BlobFigure({ mood, saying, still }: BlobFigureProps) {
    // usable inside url(#…), which React's own ids aren't
    const id = `proton${useId().replace(/[^\w-]/g, "")}`;
    const paths = useRef<(SVGPathElement | null)[]>([]);
    useBlobMotion(paths, { mood, saying, still });
    const d = restingPath(mood);

    return (
        <svg className="proton-figure" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs>
                <radialGradient id={`${id}-body`} cx="38%" cy="32%" r="75%">
                    <stop offset="0%" style={{ stopColor: "var(--proton-body-1)" }} />
                    <stop offset="100%" style={{ stopColor: "var(--proton-body-2)" }} />
                </radialGradient>
                <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="7" />
                </filter>
            </defs>
            <circle className="proton-glow" cx="50" cy="52" r="34" filter={`url(#${id}-glow)`} />
            <path ref={(el) => { paths.current[0] = el; }} className="proton-fur" d={d} />
            <path ref={(el) => { paths.current[1] = el; }} className="proton-body" d={d} fill={`url(#${id}-body)`} />
            <ellipse className="proton-sheen" cx="38" cy="33" rx="11" ry="6.5" transform="rotate(-24 38 33)" />
            <Eyes mood={mood} />
        </svg>
    );
}
