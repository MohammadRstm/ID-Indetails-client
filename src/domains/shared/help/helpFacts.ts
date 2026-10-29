import type { Domain } from "@/app/permissions/permissions";
import { useWorkingTime } from "@/domains/shared/settings/settingsApi";
import { useDomainSettings } from "@/domains/design/work/workApi";
import { daysText } from "@/domains/shared/settings/workingTime";
import { fmtDurShort, fmtMinutes, formatSettings } from "@/shared/format/time";

/**
 * The company's own settings that Help quotes, so it says "your working day is 9:00 AM to 5:00 PM", not an
 * example that may not be true. Anything not known (not loaded yet, or not readable) is null, and the text
 * falls back to words that are true whatever the settings are.
 */
export type HelpFacts = {
    /** "9:00 AM to 5:00 PM" */
    day: string | null;
    /** "Mon–Fri", or the days listed */
    days: string | null;
    /** The paid break, "1h" */
    breakTime: string | null;
    /** Whether a working day has a paid break left out of its required hours; false when the whole day is logged */
    hasBreak: boolean | null;
    /** What a working day requires, "7h" */
    required: string | null;
    /** What a working day pays, break included, "8h" */
    paid: string | null;
    /** The overtime multiplier, "1.5×" */
    multiplier: string | null;
    /** How long after logging an entry it can still be changed, "1 day" */
    editWindow: string | null;
    timerOn: boolean | null;
};

const EDIT_WINDOW: Record<string, string> = {
    none: "only until it is saved",
    one_day: "for 1 day after logging it",
    seven_days: "for 7 days after logging it",
    unlimited: "with no time limit",
};

export const NO_FACTS: HelpFacts = { day: null, days: null, breakTime: null, hasBreak: null, required: null, paid: null, multiplier: null, editWindow: null, timerOn: null };

export function useHelpFacts(domain: Domain | null): HelpFacts {
    const wt = useWorkingTime();
    // the edit window and the timer are Design's logging rules
    const rules = useDomainSettings(domain === "design" ? domain : null);
    const policy = wt.data?.current;
    return {
        day: policy ? `${fmtMinutes(policy.startMinute)} to ${fmtMinutes(policy.endMinute)}` : null,
        days: policy ? daysText(policy.workDays, formatSettings().weekStart) : null,
        breakTime: policy ? fmtDurShort(policy.breakMinutes) : null,
        hasBreak: policy ? policy.requiredMinutesPerDay < policy.endMinute - policy.startMinute : null,
        required: policy ? fmtDurShort(policy.requiredMinutesPerDay) : null,
        paid: policy ? fmtDurShort(policy.endMinute - policy.startMinute) : null,
        multiplier: policy ? `${policy.overtimeMultiplier}×` : null,
        editWindow: rules.data ? EDIT_WINDOW[rules.data.editWindow] ?? null : null,
        timerOn: rules.data ? rules.data.timerEnabled : null,
    };
}

/** A fact, or the words to use when it isn't known. */
export const or = (fact: string | null, otherwise: string) => fact ?? otherwise;
