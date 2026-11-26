import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import { fmtDate, fmtDayDate, fmtDur, fmtH } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { breakText, companyNow, hoursText, rangeFor, spanOn, trackEntry, workHoursOf } from "./day";
import DayTrack from "./DayTrack";
import { openLogWork } from "./logWorkStore";
import { useMyDay, useMySchedule } from "./workApi";
import { timeOffOn, useMyTimeOff } from "@/domains/shared/timeOff/timeOffApi";
import { loadFailed } from "@/api/queryState";

/** Today at a glance on the employee home, as a preview: Add logs, or a click on the day, opens Log work. */
export default function TodayPanel() {
    const { today, minute: nowMin } = companyNow();
    const day = useMyDay(today);
    const schedule = useMySchedule(today);
    const sd = schedule.data?.day;
    const wh = workHoursOf(sd);
    const list = day.data?.entries ?? [];
    const r = rangeFor(list.map((e) => spanOn(e, today)), wh ? [wh.s, wh.e] : [9 * 60, 17 * 60]);
    if (nowMin > r[1] && nowMin <= 22 * 60) r[1] = Math.ceil(nowMin / 60) * 60;
    const b = breakText(sd);
    // a day of time off: nothing is asked of it
    const off = timeOffOn(useMyTimeOff().data, today);

    return (
        <div className="panel mt today">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Today · {fmtDayDate(today)}</div>
                    <div className="panel-sub">
                        {!sd ? <Skeleton width={260} height={10} style={{ marginTop: 4 }} />
                            : off ? `You're on time off until ${fmtDate(off.lastDay)}: no hours are expected today.`
                            : !wh ? "Your day off - anything logged today is overtime."
                                : (
                                    <span>
                                        <b className="mono sec">{fmtH(sd.loggedMinutes)}</b> logged
                                        {sd.leftMinutes > 0
                                            ? <> · <span className="mono">{fmtDur(sd.leftMinutes)}</span> left of your {fmtH(sd.requiredMinutes)} ({hoursText(wh)}{b ? `, ${b}` : ""})</>
                                            : ` · your ${fmtH(sd.requiredMinutes)} for today are in`}
                                        {sd.overtimeMinutes > 0 && <> · <span className="ot-text">{fmtDur(sd.overtimeMinutes)} overtime</span></>}
                                    </span>
                                )}
                    </div>
                </div>
                <button className="btn btn-sm" onClick={() => openLogWork()}><Icon name="plus" />Add logs</button>
            </div>
            <div className="panel-body">
                {loadFailed(day) ? <LoadError error={day.error} retry={() => day.refetch()} what="today's work" /> : (
                    <>
                        <DayTrack lo={r[0]} hi={r[1]} workHours={wh} entries={list.map((e) => trackEntry(e, today))} nowMin={nowMin}
                            onClick={() => openLogWork()} title="Log work for today" />
                        {day.data && list.length === 0 && !off && <div className="hint mt-s">Nothing logged yet today - click the timeline to add your first log.</div>}
                    </>
                )}
            </div>
        </div>
    );
}
