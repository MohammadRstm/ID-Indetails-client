import { useState, type FormEvent } from "react";
import { errorMessage } from "@/api/errors";
import { useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { dayKey, fmtDayDate, fmtDur, fmtH, fmtRange, minutesOfDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useAttachment } from "./attachments";
import { AttachmentField } from "./AttachmentField";
import { checkLog, companyNow, DAY, defaultSlot, isoAt, movesFor, restoreOf, spanOn, workHoursOf, type Moves } from "./day";
import DayChips from "./DayChips";
import DragDay from "./DragDay";
import { closeLogWork, type LogWorkOptions } from "./logWorkStore";
import OvertimeWarning from "./OvertimeWarning";
import TimeRange from "./TimeRange";
import { startTimer } from "./timer";
import {
    entryBody, loggableProjects, useDomainSettings, useMyDay, useMyProjects, useMySchedule, useOvertimeFor, useSaveEntry, useUndoLog,
    type DomainSettings, type MyProject, type WorkEntry,
} from "./workApi";

/** Shows Log work wherever it was opened from. */
/** Waits for what the form needs to open on a sensible time, then shows it. */
export default function LogWorkModal({ options }: { options: LogWorkOptions }) {
    const { today } = companyNow();
    const edit = options.edit;
    const firstDay = edit ? dayKey(edit.startedAt) : options.date ?? today;
    const projects = useMyProjects();
    const settings = useDomainSettings("design");
    const day = useMyDay(firstDay);
    const schedule = useMySchedule(firstDay);
    // only a load with nothing to show blocks the form; a failed refresh keeps what it had
    const failed = [projects, settings, day, schedule].find((q) => q.isError && !q.data)?.error;
    const ready = projects.data && settings.data && day.data && !day.isPlaceholderData && schedule.data;

    if (!ready || failed) {
        return (
            <Modal size="md" title={edit ? "Edit work entry" : options.overtime ? "Log overtime" : "Log work"} onClose={closeLogWork}
                foot={<><div className="grow" /><button className="btn" onClick={closeLogWork}>Cancel</button></>}>
                {failed ? <LoadError error={failed} retry={() => { projects.refetch(); settings.refetch(); day.refetch(); schedule.refetch(); }} what="your day" /> : <SkeletonLines lines={6} />}
            </Modal>
        );
    }
    return <LogWorkForm options={options} firstDay={firstDay} projects={projects.data} settings={settings.data} dayEntries={day.data.entries}
        dayEnd={workHoursOf(schedule.data.day)?.e ?? null} />;
}

type FormProps = {
    options: LogWorkOptions;
    firstDay: string;
    projects: MyProject[];
    settings: DomainSettings;
    dayEntries: WorkEntry[];
    /** Where the working day ends: "Log overtime" starts there. */
    /** When the working day ends; null on a day off. */
    dayEnd: number | null;
};

/** The window itself (the prototype's P.LogWork): what was done, when, and on which project. */
function LogWorkForm({ options, firstDay, projects, settings, dayEntries, dayEnd }: FormProps) {
    const me = useCurrentUser();
    const { today, minute: nowMin } = companyNow();
    const ed = options.edit ?? null;
    const choices = loggableProjects(projects, ed?.project.id);
    const [initial] = useState(() => firstSlot(options, firstDay, dayEntries, dayEnd, today, nowMin));
    const [projectId, setProjectId] = useState<number | null>(ed ? ed.project.id : options.projectId ?? choices[0]?.id ?? null);
    const [date, setDate] = useState(firstDay);
    const [startMin, setStartMin] = useState(initial.s);
    const [duration, setDuration] = useState(initial.d);
    const [desc, setDesc] = useState(ed?.description ?? "");
    const [touched, setTouched] = useState(false);
    const [swaps, setSwaps] = useState<Moves>({});
    // a plain new log moves to another day's first free time once that day has loaded
    const [slotFor, setSlotFor] = useState<string | null>(null);
    const attachment = useAttachment(ed?.attachment ?? null);
    const save = useSaveEntry();
    const undo = useUndoLog();
    const day = useMyDay(date);
    const schedule = useMySchedule(date);
    const plain = !ed && !options.overtime && options.startMin == null && options.endMin == null;

    if (slotFor && slotFor === date && day.data && !day.isPlaceholderData && day.data.date.slice(0, 10) === date) {
        const sl = defaultSlot(day.data.entries.map((e) => spanOn(e, date)), workHoursOf(schedule.data?.day)?.s ?? 9 * 60, date === today, nowMin);
        setSlotFor(null);
        setStartMin(sl.s);
        setDuration(sl.d);
    }

    const list = (day.data?.entries ?? []).filter((e) => e.id !== ed?.id);
    const startAt = isoAt(date, startMin), endAt = isoAt(date, startMin + duration);
    const nextDay = startMin + duration >= DAY;
    const tooLong = duration > 12 * 60;
    const project = projects.find((p) => p.id === projectId);
    const { preview } = useOvertimeFor({ startedAt: startAt, endedAt: endAt, entryId: ed?.id ?? null, moves: movesFor(date, swaps) });
    const ot = preview?.overtimeMinutes ?? 0;
    const error = checkLog({
        projectId, day: date, startMin, duration, others: list, moves: swaps, ignoreId: ed?.id,
        allowFuture: settings.allowFutureEntries, allowOverlap: settings.allowOverlap,
    }) ?? (settings.requireDescription && !desc.trim() && touched ? "Say what you worked on." : null);
    // a project that stopped taking work (the timer ran on it) has to be picked again from the list
    const unlisted = !ed && !choices.some((c) => c.id === projectId);
    const blocked = !!error || unlisted || (settings.requireDescription && !desc.trim()) || attachment.uploading || save.isPending;

    function pickDay(d: string) {
        setDate(d);
        setSwaps({});
        if (plain) setSlotFor(d);
    }

    /** Puts the logged tasks a swap moved back where they were (for Undo). */
    function movesBack(): Moves {
        const back: Moves = {};
        for (const id of Object.keys(swaps)) {
            const e = list.find((x) => x.id === +id);
            if (e) back[+id] = spanOn(e, date);
        }
        return back;
    }

    function submit(e?: FormEvent) {
        e?.preventDefault();
        setTouched(true);
        if (blocked || projectId == null) return;
        const back = movesBack();
        // worked out now, while the day is loaded: the form has closed by the time Undo is pressed
        const restore = restoreOf(list, date, swaps);
        const body = { projectId, description: desc, startedAt: startAt, endedAt: endAt, attachmentFileId: attachment.file?.id ?? null, moves: movesFor(date, swaps) };
        const title = project?.title ?? "the project";
        save.mutate({ id: ed?.id, body }, {
            onSuccess: (saved) => {
                closeLogWork();
                if (ed) {
                    toast({
                        text: "Entry updated", sub: `${title} · ${fmtDayDate(startAt)} · ${fmtRange(startAt, endAt)}`, icon: "checkCircle",
                        actionLabel: "Undo", action: () => save.mutate({ id: ed.id, body: { ...entryBody(ed), moves: movesFor(date, back) } }),
                    });
                    return;
                }
                toast({
                    text: `${fmtDur(saved.minutes)} logged on ${title}`, sub: `${fmtDayDate(startAt)} · ${fmtRange(startAt, endAt)}`, icon: "checkCircle",
                    actionLabel: "Undo", action: () => undo.mutate({ id: saved.id, restore }),
                });
            },
        });
    }

    const failure = save.error ? errorMessage(save.error) : null;
    const required = preview?.requiredMinutes ?? schedule.data?.day.requiredMinutes ?? 7 * 60;

    return (
        <Modal size="md" title={ed ? "Edit work entry" : options.overtime ? "Log overtime" : "Log work"} onClose={closeLogWork}
            sub={options.overtime ? `Work outside your working hours, on a day off, or past the ${fmtH(required)} your day asks for counts as overtime.` : "What you did, and exactly when you did it."}
            foot={
                <>
                    <div className="grow">
                        {error || failure ? <span className="err"><Icon name="alert" />{error ?? failure}</span>
                            : <span className="muted">{fmtDayDate(startAt)} · <span className="mono">{fmtRange(startAt, endAt)}</span>{nextDay ? " (ends next day)" : ""}</span>}
                    </div>
                    <button className="btn" onClick={closeLogWork}>Cancel</button>
                    <button className="btn btn-primary" disabled={blocked} onClick={() => submit()}>
                        {ed ? "Save changes" : `Log ${fmtDur(duration)}`}{ot ? ` · ${fmtDur(ot)} overtime` : ""}
                    </button>
                </>
            }>
            <form onSubmit={submit}>
                <div className="grid g-2">
                    <div className="field">
                        <label className="label" htmlFor="lw-project">Project</label>
                        <Select id="lw-project" value={projectId == null ? "" : String(projectId)} onChange={(v) => setProjectId(+v)}
                            options={choices.map((p) => ({ value: String(p.id), label: p.title }))} />
                        <div className="hint">Only active projects accept new work.</div>
                    </div>
                    <div className="field">
                        <label className="label">Day</label>
                        <DayChips value={date} onChange={pickDay} count={5} />
                    </div>
                </div>

                <div className="field mt">
                    <label className="label" htmlFor="lw-desc">What did you work on?</label>
                    <textarea id="lw-desc" className="textarea" autoFocus placeholder="e.g. Detailed the kitchen joinery drawings for the client review"
                        value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => setTouched(true)}
                        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }} />
                </div>

                <AttachmentField state={attachment} />

                <div className="panel mt" style={{ background: "var(--surface-2)" }}>
                    <div className="panel-body">
                        <TimeRange date={date} startMin={startMin} duration={duration} preview={preview}
                            onChange={(s, d) => { setStartMin(s); setDuration(d); }} />
                        <div className="mt">
                            <DragDay date={date} startMin={startMin} duration={duration} projectId={projectId} ignoreId={ed?.id} swaps={swaps}
                                onChange={(s, d, sw) => { setStartMin(s); setDuration(d); if (sw) setSwaps(sw); }} />
                        </div>
                        {tooLong && <div className="hint mt-s">That is a long stretch - if it spanned a break, two entries will read better in reports.</div>}
                    </div>
                </div>

                <OvertimeWarning date={date} duration={duration} preview={preview} scheduleDay={schedule.data?.day} />
                <div className="row mt-s" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span className="hint">Tip: type “4pm”, “16:00” or “4:30p” - and ⌘/Ctrl + Enter to save.</span>
                    {settings.timerEnabled && !ed ? (
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => { closeLogWork(); startTimer(me.id, projectId); }}>
                            <Icon name="play" />Use a timer instead
                        </button>
                    ) : <span />}
                </div>
            </form>
        </Modal>
    );
}

/**
 * Where the window opens (the prototype's rules): an edited entry where it is; overtime from the end of
 * the working day up to now; given times as given; otherwise the day's first free time.
 */
function firstSlot(o: LogWorkOptions, day: string, entries: WorkEntry[], dayEnd: number | null, today: string, nowMin: number): { s: number; d: number } {
    if (o.edit) return { s: minutesOfDay(o.edit.startedAt), d: o.edit.minutes };
    const isToday = day === today;
    // a day off is all overtime, and today's overtime can't start before the working day ends: the usual slot
    const noOvertimeStart = dayEnd == null || (isToday && nowMin <= dayEnd);
    if ((!o.overtime || noOvertimeStart) && o.startMin == null && o.endMin == null) {
        return defaultSlot(entries.map((e) => spanOn(e, day)), 9 * 60, isToday, nowMin);
    }
    const workEnd = dayEnd ?? 17 * 60;
    const end = o.endMin ?? (o.overtime && isToday && nowMin > workEnd ? Math.floor(nowMin / 5) * 5
        : isToday ? Math.max(10 * 60, Math.floor(nowMin / 15) * 15) : 12 * 60);
    const start = o.startMin ?? (o.overtime ? workEnd : Math.max(0, end - (isToday ? 120 : 180)));
    return { s: start, d: (end - start + DAY) % DAY || (o.overtime ? 60 : 120) };
}
