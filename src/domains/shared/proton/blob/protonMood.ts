/** How Proton looks right now: the blob's shape and eyes, and its accessible name, follow it. */
export type ProtonMood = "asleep" | "error" | "working" | "thinking" | "talking" | "happy" | "proposing" | "listening" | "idle";

export type MoodInputs = {
    /** Proton can answer now (switched on, budget and allowance left). */
    available: boolean;
    /** When the question being answered was sent, if one is. */
    askedAt: number | null;
    /** Text of the answer is arriving (and a moment after). */
    talkingUntil: number;
    errorUntil: number;
    happyUntil: number;
    /** A proposed change is waiting for the person's Confirm. */
    cardOpen: boolean;
    /** The person is typing to Proton. */
    composing: boolean;
};

/** After this long, a question still being answered looks like work rather than thought. */
export const WORKING_AFTER_MS = 3_000;

/** After this long, the chat says it's still looking. */
export const STILL_LOOKING_AFTER_MS = 8_000;

/**
 * The one mood that wins, most important first: unable to answer, something went wrong, saying the answer as it
 * arrives, busy on it between, pleased with a change that went through, waiting on a card, listening to the person
 * type, or at rest.
 */
export function moodOf(inputs: MoodInputs, now: number): ProtonMood {
    if (!inputs.available) return "asleep";
    if (inputs.errorUntil > now) return "error";
    if (inputs.talkingUntil > now) return "talking";
    if (inputs.askedAt != null) return now - inputs.askedAt >= WORKING_AFTER_MS ? "working" : "thinking";
    if (inputs.happyUntil > now) return "happy";
    if (inputs.cardOpen) return "proposing";
    if (inputs.composing) return "listening";
    return "idle";
}

const NAMES: Record<ProtonMood, string> = {
    asleep: "resting",
    error: "something went wrong",
    working: "working on it",
    thinking: "thinking",
    talking: "answering",
    happy: "done",
    proposing: "waiting for your confirmation",
    listening: "listening",
    idle: "ready",
};

/** The blob's accessible name: who it is and what it's doing ("Proton, thinking"). */
export const moodName = (mood: ProtonMood) => `Proton, ${NAMES[mood]}`;

/** The moods that move: only these run the animation loop. */
export const isLively = (mood: ProtonMood) => mood === "thinking" || mood === "working" || mood === "talking";
