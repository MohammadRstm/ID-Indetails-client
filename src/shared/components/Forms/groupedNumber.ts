import type { ChangeEvent, KeyboardEvent } from "react";
import { fitNumber, type NumberShape } from "@/shared/format/limits";

/** Commas between the thousands of a number as typed, the decimals left as they are: "1234567.5" → "1,234,567.5". */
export function grouped(plain: string): string {
    const point = plain.indexOf(".");
    const whole = point < 0 ? plain : plain.slice(0, point);
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (point < 0 ? "" : plain.slice(point));
}

// how many digits and points come before a place in the text: what the caret is beside, commas or not
const kept = (text: string) => text.replace(/[^0-9.]/g, "").length;

/** The place in grouped text that has `count` digits and points before it. */
function placeOf(text: string, count: number): number {
    if (count <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < text.length; i++) {
        if (/[0-9.]/.test(text[i]) && ++seen === count) return i + 1;
    }
    return text.length;
}

/**
 * What an input needs to show a number with commas while it is typed in: 400000 reads 400,000, and the caret
 * stays beside the digit it was beside as commas come and go. `plain` is the number without commas. In the
 * input's onChange, `next(e)` gives the next one, or null when the key was refused because the number would no
 * longer fit its shape. Without a shape any digits and points are taken, for fields that say what is wrong under
 * themselves. Pasting "400,000" or "400000" gives the same number.
 */
export function groupedNumber(plain: string, shape: NumberShape | null) {
    const text = grouped(plain);
    return {
        value: text,
        next(e: ChangeEvent<HTMLInputElement>): string | null {
            const el = e.target, raw = el.value, at = el.selectionStart ?? raw.length;
            let next = shape ? fitNumber(raw, shape, plain) : raw.replace(/[^0-9.]/g, "");
            let before = kept(raw.slice(0, at));
            // zeros in front of the number go, so a field showing 0 reads 5 once 5 is typed, not 05
            const zeros = next?.match(/^0+(?=\d)/)?.[0].length ?? 0;
            if (next != null && zeros) {
                next = next.slice(zeros);
                before = Math.max(0, before - zeros);
            }
            // The text and caret are put in place here, so the value React sets next is already there and the
            // caret isn't sent to the end. A refused key leaves the caret where it was.
            const shown = next == null ? text : grouped(next);
            const caret = next == null ? Math.max(0, Math.min(shown.length, at - (raw.length - text.length))) : placeOf(shown, before);
            el.value = shown;
            el.setSelectionRange(caret, caret);
            return next;
        },
        onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
            // Backspace just after a comma, or Delete just before one, takes the digit beyond it
            if (e.key !== "Backspace" && e.key !== "Delete") return;
            const el = e.currentTarget, a = el.selectionStart;
            if (a == null || a !== el.selectionEnd) return;
            if (e.key === "Backspace" && el.value[a - 1] === ",") el.setSelectionRange(a - 1, a - 1);
            else if (e.key === "Delete" && el.value[a] === ",") el.setSelectionRange(a + 1, a + 1);
        },
    };
}
