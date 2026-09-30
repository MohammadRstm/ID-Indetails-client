import { fmtDur, fmtH, fmtHourLabel, monthKey } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { dayText, type ScheduleDay } from "./day";
import { previewHours } from "./overtime";
import { useMyHours, type OvertimePreview } from "./workApi";

type OvertimeWarningProps = {
    date: string;
    duration: number;
    preview?: OvertimePreview;
    scheduleDay?: ScheduleDay;
};

/**
 * Under every log form, the moment the chosen time runs outside the person's working hours or falls on
 * their day off: how much is overtime and which side of the day it falls on (the prototype's
 * UI.OvertimeWarning). Behind on the month, it says the overtime makes the hours up first.
 */
export default function OvertimeWarning({ date, duration, preview, scheduleDay }: OvertimeWarningProps) {
    const hours = useMyHours(!!preview?.overtimeMinutes);
    if (!preview || !preview.overtimeMinutes) return null;
    const ot = preview.overtimeMinutes;
    const wh = previewHours(preview);
    const parts: string[] = [];
    if (wh && preview.beforeHoursMinutes) parts.push(`${fmtDur(preview.beforeHoursMinutes)} before ${fmtHourLabel(wh.s)}`);
    if (wh && preview.afterHoursMinutes) parts.push(`${fmtDur(preview.afterHoursMinutes)} after ${fmtHourLabel(wh.e)}`);
    if (preview.pastRequiredMinutes) parts.push(`${fmtDur(preview.pastRequiredMinutes)} past the ${fmtH(preview.requiredMinutes ?? 0)} your day asks for`);
    const all = ot >= duration;
    const month = hours.data?.applies ? hours.data.months.find((m) => m.month.slice(0, 7) === monthKey(date)) : undefined;
    const owe = month && (month.status === "behind" || month.status === "short") ? month.shortMinutes : 0;

    return (
        <div className="banner ot-warn mt-s" role="status">
            <Icon name="clock" />
            <div className="grow">
                <b>{all ? "This is all overtime" : "This includes overtime"} - {fmtDur(ot)}</b>
                <div>
                    {preview.dayOff ? "It falls on your day off, so every minute counts as overtime."
                        : `Your working day is ${dayText(scheduleDay)}; ${parts.join(" and ")} ${parts.length > 1 ? "count" : "counts"} as overtime.`}
                    {" "}Your admin will see it in your overtime for the month.
                </div>
                {owe > 0 && (
                    <div className="hl-owe">
                        You're {fmtH(owe)} behind on your hours this month, so {ot > owe ? `the first ${fmtH(owe)} of this` : "all of this"} counts as normal hours to make them up.
                    </div>
                )}
            </div>
        </div>
    );
}
