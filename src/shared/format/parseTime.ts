import { formatSettings } from "./time";

/**
 * "930", "9:30pm", "14:05" → minutes after midnight. Without am/pm, 1 to 7 on a 12-hour clock means the
 * afternoon (nobody starts work at 3 in the morning). Null for anything unreadable.
 */
export function parseTime(input: string): number | null {
    if (!input) return null;
    const s = String(input).trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(s);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mi = m[2] ? parseInt(m[2], 10) : 0;
    if (mi > 59 || h > 24) return null;
    const twelve = !formatSettings().use24HourTime;
    if (m[3]) {
        const pm = m[3][0] === "p";
        if (h === 12) h = pm ? 12 : 0;
        else if (pm) h += 12;
    } else if (twelve && !m[2] && h >= 1 && h <= 7) {
        h += 12;
    }
    if (h >= 24) h = 23;
    return h * 60 + mi;
}
