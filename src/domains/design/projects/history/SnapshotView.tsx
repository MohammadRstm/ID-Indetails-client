import { Bar } from "@/shared/components/Data/Bits";
import { PersonAvatar } from "@/shared/components/Identity/People";
import { fmtDate, fmtDateY, fmtDayDate, fmtDur, fmtRange, fmtTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { middleOf, NEARBY_DAYS, type History, type ProgressAt, type Snapshot } from "./history";
import { HistoryStatus, Src } from "./HistoryParts";
import { eventText, firstName, STATUS_WORD } from "./words";
import { clickable } from "@/shared/utils/clickable";

function ProgressLine({ pr, todayPct }: { pr: ProgressAt; todayPct: number }) {
    if (pr.basis === "none") {
        return (
            <div>
                <div className="snap-big muted">Not recorded</div>
                <div className="hint">No progress history exists for this project. Only today's value ({todayPct}%) is known, so it is not shown against the past.</div>
            </div>
        );
    }
    if (pr.basis === "unknown") {
        return (
            <div>
                <div className="snap-big muted">-</div>
                <div className="hint">Before the first progress checkpoint ({pr.next!.value}% on {fmtDate(pr.next!.at)}).</div>
            </div>
        );
    }
    const v = Math.round(pr.value!);
    const estimated = pr.basis === "interpolated";
    return (
        <div>
            <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                <span className="snap-big">{estimated ? "~" : ""}{v}%</span>
                <Src kind={estimated ? "estimated" : "recorded"} />
            </div>
            <div className="hint">
                {pr.basis === "checkpoint" ? "A progress checkpoint was set at exactly this moment."
                    : estimated ? `Between ${pr.from!.value}% (${fmtDate(pr.from!.at)}) and ${pr.to!.value}% (${fmtDate(pr.to!.at)}), weighted by the work logged in between.`
                        : pr.to ? `No work was logged between ${pr.from!.value}% (${fmtDate(pr.from!.at)}) and the next checkpoint, so the value holds.`
                            : `Last checkpoint: ${pr.from!.value}% on ${fmtDate(pr.from!.at)}. No later value is recorded.`}
            </div>
            <div style={{ width: 160, marginTop: 6 }}><Bar value={v} hideValue /></div>
        </div>
    );
}

type SnapshotProps = {
    snap: Snapshot;
    history: History;
    todayPct: number;
    onPick: (t: number) => void;
    onEntry: (id: number) => void;
    onPerson: (id: number) => void;
};

/** The project as it was at the chosen moment (the prototype's Snapshot). */
export default function SnapshotView({ snap: s, history: h, todayPct, onPick, onEntry, onPerson }: SnapshotProps) {
    const st = s.projectStatus;
    const nameOf = (id: number) => h.people.get(id)?.name ?? "Someone";
    const msg: Record<Snapshot["state"], string> = {
        between: "No one was working on the project at this moment.",
        "idle-day": "No work was logged on this day.",
        "before-first-work": "The project existed, but no work had been logged on it yet.",
        "after-last-work": `No one was working at this moment. ${s.prev ? `The last logged work ended ${fmtDayDate(s.prev.end)} at ${fmtTime(s.prev.end)} - nothing later is recorded.` : ""}`,
        "not-created": `This project did not exist yet${st.until ? ` - it was created on ${fmtDateY(st.until)}.` : "."}`,
        future: "This moment is in the future.",
        empty: "No work has been logged on this project.",
        active: "",
    };
    const stillWorking = s.activeWork.filter((a) => !a.justEnded).sort((a, b) => a.entry.end - b.entry.end).slice(0, 3);

    return (
        <div>
            <div className="snap">
                <div className="snap-state">
                    <div>
                        <div className="u">Status</div>
                        <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            <HistoryStatus status={st.status} />
                            {st.status !== "not-created" && st.source && (
                                <Src kind={st.source === "event" ? "recorded" : "inferred"}
                                    title={st.source === "event" ? "From a recorded status change" : "No status events exist - reconstructed from the project's dates"} />
                            )}
                        </div>
                        {st.since != null && (
                            <div className="hint" style={{ marginTop: 4 }}>
                                {st.again ? "Active again" : st.status in STATUS_WORD ? STATUS_WORD[st.status as keyof typeof STATUS_WORD] : ""} since {fmtDateY(st.since)}{st.until ? ` · until ${fmtDateY(st.until)}` : ""}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="u">Progress</div>
                        <ProgressLine pr={s.progress} todayPct={todayPct} />
                    </div>
                    <div>
                        <div className="u">Effort completed</div>
                        <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                            <b className="mono" style={{ fontSize: 15 }}>{Math.round(s.effort * 100)}%</b><Src kind="calculated" />
                        </div>
                        <div className="hint">of all the hours logged on this project had been logged by this moment. Effort is not progress.</div>
                    </div>
                </div>

                <div>
                    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                        <div className="u">Working at this moment</div>
                        {s.activeWork.length >= 2 && <span className="vt-n">{s.activeWork.length} people overlapping</span>}
                    </div>
                    {s.activeWork.length ? s.activeWork.map((a) => (
                        <div key={a.entry.id} className="snap-work">
                            <div className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                                <PersonAvatar person={{ id: a.userId, name: nameOf(a.userId) }} size={28} />
                                <div className="grow" style={{ minWidth: 0 }}>
                                    <div className="row wrap" style={{ gap: 6 }}>
                                        <b className="link" onClick={() => onPerson(a.userId)}>{nameOf(a.userId)}</b>
                                        {a.role && <span className="muted">{a.role}</span>}
                                        {a.justStarted && <span className="badge badge-new">just began</span>}
                                        {a.justEnded && <span className="badge">just ended</span>}
                                    </div>
                                    <div className="sec link-quiet" style={{ marginTop: 2 }} {...clickable(() => onEntry(a.entry.id), "button")}>{a.description}</div>
                                </div>
                                <span className="mono muted nowrap" style={{ fontSize: 11 }}>{fmtRange(a.entry.start, a.entry.end)}</span>
                            </div>
                            <div className="meter-row" style={{ marginTop: 8 }}>
                                <div className="bar"><i style={{ width: `${Math.round(a.pct * 100)}%` }} /></div>
                                <span className="meter-val mono" style={{ width: "auto" }}>{fmtDur(a.elapsedMin)} of {fmtDur(a.totalMin)}</span>
                            </div>
                        </div>
                    )) : (
                        <div className="snap-msg">
                            <div>{msg[s.state]}</div>
                            {s.gap && (
                                <div className="hint" style={{ marginTop: 4 }}>
                                    {s.gap.days} days with no work logged ({fmtDate(s.gap.from)} – {s.gap.open ? "now" : fmtDate(s.gap.to)})
                                    {s.gap.kind === "hold" ? " - the project was on hold." : " - no reason is recorded."}
                                </div>
                            )}
                            {s.state !== "future" && s.state !== "empty" && (
                                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                                    {s.prev && <button className="btn btn-sm" onClick={() => onPick(middleOf(s.prev!))}><Icon name="chevronLeft" />Previous work · {fmtDate(s.prev.start)}</button>}
                                    {s.next && <button className="btn btn-sm" onClick={() => onPick(middleOf(s.next!))}>Next work · {fmtDate(s.next.start)}<Icon name="chevronRight" /></button>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="snap-ctx">
                <div>
                    <div className="u" style={{ marginBottom: 4 }}>Just before</div>
                    {s.earlierToday.slice(0, 4).map((x) => (
                        <div key={x.entry.id} className="snap-li">
                            <span className="mono muted nowrap">{fmtTime(x.entry.end)}</span>
                            <span className="trunc"><b>{firstName(nameOf(x.entry.userId))}</b>'s work ended · <span className="muted">{x.entry.description}</span></span>
                        </div>
                    ))}
                    {!s.earlierToday.length && (
                        <div className="snap-li muted">
                            {s.prev ? `Nothing earlier that day. Last work: ${firstName(nameOf(s.prev.userId))}, ${fmtDayDate(s.prev.end)} at ${fmtTime(s.prev.end)}.` : "No earlier work on this project."}
                        </div>
                    )}
                </div>
                <div>
                    <div className="u" style={{ marginBottom: 4 }}>What came next</div>
                    {stillWorking.map((a) => (
                        <div key={`e${a.entry.id}`} className="snap-li">
                            <span className="mono muted nowrap">{fmtTime(a.entry.end)}</span>
                            <span className="trunc"><b>{firstName(nameOf(a.userId))}</b>'s current work ends</span>
                        </div>
                    ))}
                    {s.laterToday.slice(0, 4).map((x) => (
                        <div key={x.entry.id} className="snap-li">
                            <span className="mono muted nowrap">{fmtTime(x.entry.start)}</span>
                            <span className="trunc"><b>{firstName(nameOf(x.entry.userId))}</b>'s work began · <span className="muted">{x.entry.description}</span></span>
                        </div>
                    ))}
                    {!s.laterToday.length && !s.activeWork.length && (
                        <div className="snap-li muted">
                            {s.next ? `Nothing later that day. Next work: ${firstName(nameOf(s.next.userId))}, ${fmtDayDate(s.next.start)} at ${fmtTime(s.next.start)}.` : "No later work on this project."}
                        </div>
                    )}
                </div>
                <div>
                    <div className="u" style={{ marginBottom: 4 }}>Project events within {NEARBY_DAYS} days</div>
                    {s.nearbyEvents.slice(0, 5).map((e) => (
                        <div key={`${e.kind}${e.at}`} className="snap-li">
                            <span className="mono muted nowrap">{fmtDate(e.at)}</span>
                            <span className="trunc">{eventText(e)}</span>
                        </div>
                    ))}
                    {!s.nearbyEvents.length && <div className="snap-li muted">No status change or other project event around this time.</div>}
                </div>
            </div>
        </div>
    );
}
