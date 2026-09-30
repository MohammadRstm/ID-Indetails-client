import { fmtDur, fmtH } from "@/shared/format/time";
import { hoursText, type Span } from "./day";
import type { OvertimePreview } from "./workApi";

/* Words for the API's overtime preview, as the prototype puts them. */

/** The day's working hours in a preview; null on a day off. */
export const previewHours = (p: OvertimePreview): Span | null =>
    p.dayOff || p.dayStartMinute == null || p.dayEndMinute == null ? null : { s: p.dayStartMinute, e: p.dayEndMinute };

/** "2h overtime (outside 9 AM – 5 PM)". */
export function overtimeTag(p: OvertimePreview): string {
    const ot = p.overtimeMinutes;
    if (p.dayOff) return `Day off - all ${fmtDur(ot)} is overtime`;
    const wh = previewHours(p), req = fmtH(p.requiredMinutes ?? 0);
    const over = p.pastRequiredMinutes, outside = p.beforeHoursMinutes + p.afterHoursMinutes;
    const why = over && !outside ? `past your ${req} today` : over ? `outside ${hoursText(wh)} and past your ${req}` : `outside ${hoursText(wh)}`;
    return `${fmtDur(ot)} overtime (${why})`;
}
