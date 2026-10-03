import { useState, type FormEvent } from "react";
import { errorMessage } from "@/api/errors";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Select from "@/shared/components/Forms/Select";
import { fmtDayDate, fmtDur, fmtH, fmtRange, minutesOfDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useAttachment } from "./attachments";
import { AttachmentChip } from "./AttachmentField";
import { breakText, checkLog, companyNow, defaultSlot, DEFAULT_START, hoursText, isoAt, movesFor, rangeFor, restoreOf, spanOn, trackEntry, workHoursOf, type Moves } from "./day";
import DayChips from "./DayChips";
import DayTrack from "./DayTrack";
import DragDay from "./DragDay";
import OvertimeWarning from "./OvertimeWarning";
import TimeRange from "./TimeRange";
import {
    loggableProjects, useDomainSettings, useMyDay, useMyProjects, useMySchedule, useOvertimeFor, useSaveEntry, useUndoLog,
} from "./workApi";
import { loadFailed } from "@/api/queryState";

/** Today at a glance on the employee home: a strip of the day that opens into the day composer. */
export default function TodayPanel() {
    const [open, setOpen] = useState(false);
    return open ? <DayComposer onCollapse={() => setOpen(false)} /> : <TodayStrip onOpen={() => setOpen(true)} />;
}

function TodayStrip({ onOpen }: { onOpen: () => void }) {
    const { today, minute: nowMin } = companyNow();
    const day = useMyDay(today);
    const schedule = useMySchedule(today);
    const sd = schedule.data?.day;
    const wh = workHoursOf(sd);
    const list = day.data?.entries ?? [];
    const r = rangeFor(list.map((e) => spanOn(e, today)), wh ? [wh.s, wh.e] : [9 * 60, 17 * 60]);
    if (nowMin > r[1] && nowMin <= 22 * 60) r[1] = Math.ceil(nowMin / 60) * 60;
    const b = breakText(sd);

    return (
        <div className="panel mt today">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Today · {fmtDayDate(today)}</div>
                    <div className="panel-sub">
                        {!sd ? <Skeleton width={260} height={10} style={{ marginTop: 4 }} />
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
                <button className="btn btn-sm" onClick={onOpen}><Icon name="plus" />Add logs</button>
            </div>
            <div className="panel-body">
                {loadFailed(day) ? <LoadError error={day.error} retry={() => day.refetch()} what="today's work" /> : (
                    <>
                        <DayTrack lo={r[0]} hi={r[1]} workHours={wh} entries={list.map((e) => trackEntry(e, today))} nowMin={nowMin}
                            onClick={onOpen} title="Open today's timeline to add logs" />
                        {day.data && list.length === 0 && <div className="hint mt-s">Nothing logged yet today - click the timeline to add your first log.</div>}
                    </>
                )}
            </div>
        </div>
    );
}

/** The day composer (the prototype's DayComposer): log one piece after another straight onto the timeline. */
function DayComposer({ onCollapse }: { onCollapse: () => void }) {
    const { today, minute: nowMin } = companyNow();
    const projects = useMyProjects();
    const settings = useDomainSettings("design").data;
    const choices = loggableProjects(projects.data ?? []);
    const [date, setDate] = useState(today);
    const day = useMyDay(date);
    const schedule = useMySchedule(date);
    const [slot, setSlot] = useState<{ s: number; d: number } | null>(null);
    const [slotFor, setSlotFor] = useState<string | null>(today);
    const [projectId, setProjectId] = useState<number | null>(null);
    const [desc, setDesc] = useState("");
    const [touched, setTouched] = useState(false);
    const [swaps, setSwaps] = useState<Moves>({});
    // logs deleted on the timeline, sent with the save
    const [deletes, setDeletes] = useState<number[]>([]);
    const attachment = useAttachment();
    const save = useSaveEntry();
    const undo = useUndoLog();
    const isToday = date === today;

    // the first free time of the day, once the day has loaded
    if (slotFor === date && day.data && !day.isPlaceholderData && day.data.date.slice(0, 10) === date) {
        setSlotFor(null);
        setSlot(defaultSlot(day.data.entries.map((e) => spanOn(e, date)), workHoursOf(schedule.data?.day)?.s ?? DEFAULT_START, isToday, nowMin));
    }
    const pid = projectId ?? choices[0]?.id ?? null;
    const startMin = slot?.s ?? DEFAULT_START, duration = slot?.d ?? 60;
    const startAt = isoAt(date, startMin), endAt = isoAt(date, startMin + duration);
    const list = (day.data?.entries ?? []).filter((e) => !deletes.includes(e.id));
    const { preview } = useOvertimeFor(slot ? { startedAt: startAt, endedAt: endAt, entryId: null, moves: movesFor(date, swaps), deletes } : null);
    const requireDesc = !!settings?.requireDescription;
    const error = checkLog({
        projectId: pid, day: date, startMin, duration, others: list, moves: swaps,
        allowFuture: !!settings?.allowFutureEntries, allowOverlap: !!settings?.allowOverlap,
    }) ?? (requireDesc && !desc.trim() && touched ? "Say what you worked on." : null);
    const blocked = !slot || !!error || (requireDesc && !desc.trim()) || attachment.uploading || save.isPending;

    function pickDay(d: string) {
        setDate(d);
        setSwaps({});
        setDeletes([]);
        setSlotFor(d);
    }

    function add(ev?: FormEvent) {
        ev?.preventDefault();
        setTouched(true);
        if (blocked || pid == null) return;
        const title = choices.find((p) => p.id === pid)?.title ?? "the project";
        // what Undo puts back, worked out before the day reloads with the entries moved
        const restore = restoreOf(list, date, swaps);
        const deleted = deletes;
        save.mutate({ body: { projectId: pid, description: desc, startedAt: startAt, endedAt: endAt, attachmentFileId: attachment.file?.id ?? null, moves: movesFor(date, swaps), deletes } }, {
            onSuccess: (entry) => {
                toast({
                    text: `${fmtDur(entry.minutes)} logged on ${title}`,
                    sub: `${fmtRange(entry.startedAt, entry.endedAt)}${entry.overtimeMinutes ? ` · ${fmtDur(entry.overtimeMinutes)} overtime` : ""}`,
                    icon: "checkCircle", actionLabel: "Undo", action: () => undo.mutate({ id: entry.id, restore, deleted }),
                });
                // stay here, ready for the next one: it starts where this one ended
                const end = minutesOfDay(entry.endedAt);
                const room = isToday ? nowMin - end : 60;
                setSlot({ s: end, d: room >= 5 ? Math.min(60, Math.floor(room / 5) * 5) : 60 });
                setSwaps({});
                setDeletes([]);
                setDesc("");
                attachment.clear();
                setTouched(false);
            },
        });
    }

    return (
        <div className="panel mt today open">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Add logs · {fmtDayDate(date)}</div>
                    <div className="panel-sub">Drag across free time on the timeline, or type the times below. Shaded time is outside your working day and counts as overtime.</div>
                </div>
                <button className="btn btn-sm btn-quiet" onClick={onCollapse}><Icon name="chevronUp" />Collapse</button>
            </div>
            <div className="panel-body">
                <DayChips value={date} onChange={pickDay} count={5} />
                <div className="mt">
                    <DragDay date={date} startMin={startMin} duration={duration} projectId={pid} swaps={swaps} deleted={deletes} onDeleted={setDeletes}
                        onChange={(s, d, sw) => { setSlot({ s, d }); if (sw) setSwaps(sw); }} />
                </div>

                <form className="composer-form mt" onSubmit={add}>
                    <div className="grid g-2">
                        <div className="field">
                            <label className="label required" htmlFor="dc-project">Project</label>
                            <Select id="dc-project" value={pid == null ? "" : String(pid)} onChange={(v) => setProjectId(+v)}
                                options={choices.map((p) => ({ value: String(p.id), label: p.title }))} />
                        </div>
                        <div className="field">
                            <label className={requireDesc ? "label required" : "label"} htmlFor="dc-desc">What did you work on?</label>
                            <input id="dc-desc" className="input" placeholder={`${requireDesc ? "" : "Optional - "}e.g. Revised the ground-floor plan`} value={desc}
                                onChange={(e) => setDesc(e.target.value)} onBlur={() => setTouched(true)} />
                        </div>
                    </div>
                    <div className="mt">
                        <TimeRange date={date} startMin={startMin} duration={duration} preview={preview} onChange={(s, d) => setSlot({ s, d })} />
                    </div>
                    <OvertimeWarning date={date} duration={duration} preview={preview} scheduleDay={schedule.data?.day} />
                    <div className="row wrap mt" style={{ gap: 10 }}>
                        <AttachmentChip state={attachment} />
                        <span className="grow">
                            {error || save.error ? <span className="err"><Icon name="alert" />{error ?? errorMessage(save.error)}</span> : null}
                        </span>
                        <button type="submit" className="btn btn-primary" disabled={!slot || attachment.uploading || save.isPending}><Icon name="plus" />Add log</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
