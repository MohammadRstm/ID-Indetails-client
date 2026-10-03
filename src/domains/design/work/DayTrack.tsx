import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, Ref } from "react";
import { tip } from "@/shared/components/Overlays/tip";
import { fmtDur, fmtHourLabel, fmtMinutes } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { clamp, type Span } from "./day";

/** A logged entry on the track, in minutes of the day drawn. */
export type TrackEntry = Span & {
    id: number;
    description: string;
    projectTitle: string;
    range: string;
    overtime: number;
    locked: boolean;
    moved?: boolean;
    isNew?: boolean;
};

export type TrackMeeting = Span & { id: number; topic: string | null; projectTitle: string; setBy: string | null; range: string; editable: boolean };

type DayTrackProps = {
    lo: number;
    hi: number;
    /** The person's working hours on the day; null on a day off. */
    workHours: Span | null;
    entries: TrackEntry[];
    meetings?: TrackMeeting[];
    nowMin?: number | null;
    sel?: Span | null;
    selBad?: boolean;
    /** The logged entry picked to be deleted (double-clicked, or Enter on it). */
    selected?: number | null;
    editable?: boolean;
    /** A working-day edge an edge is held at, while dragging. */
    held?: number | null;
    big?: boolean;
    title?: string;
    ref?: Ref<HTMLDivElement>;
    onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (e: PointerEvent<HTMLDivElement>) => void;
    onClick?: () => void;
    onDoubleClick?: (e: MouseEvent<HTMLDivElement>) => void;
    onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
    onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
    onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
};

/**
 * One day, drawn across (the prototype's DayTrack): the working-day band, overtime shading, logged
 * entries, meetings, an optional selection and the now line.
 */
export default function DayTrack({
    lo, hi, workHours, entries, meetings, nowMin, sel, selBad, selected, editable, held, big, title, ref,
    onPointerDown, onPointerMove, onPointerUp, onClick, onDoubleClick, onContextMenu, onKeyDown, onBlur,
}: DayTrackProps) {
    const range = hi - lo;
    const pct = (m: number) => clamp(((m - lo) / range) * 100, 0, 100);
    const zone = (a: number, b: number, cls: string, key: string) => {
        a = Math.max(a, lo);
        b = Math.min(b, hi);
        return b > a ? <i key={key} className={cls} style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} /> : null;
    };
    const step = range > 10 * 60 ? 120 : 60;
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    const edges = workHours ? [workHours.s, workHours.e] : [];
    // a working-day edge at either end of the track is the track's own edge: drawn by the hour labels there
    const inner = edges.filter((m) => m > lo && m < hi);

    return (
        <div className={cx("dt", big && "big")}>
            <div className="dt-track" ref={ref} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={onPointerUp} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
                onKeyDown={onKeyDown} onBlur={onBlur} title={title}>
                {workHours ? [zone(lo, workHours.s, "dt-ot", "a"), zone(workHours.e, hi, "dt-ot", "b")] : zone(lo, hi, "dt-ot", "w")}
                {nowMin != null && zone(nowMin, hi, "dt-future", "f")}
                {inner.map((m) => (
                    <i key={`wd${m}`} className={cx("dt-wd", m === workHours?.e ? "end" : "start", held === m && "held")} style={{ left: `${pct(m)}%` }} />
                ))}
                {entries.map((e) => {
                    const canEdit = editable && !e.locked;
                    return (
                        <i key={e.id} data-eid={canEdit ? e.id : undefined}
                            className={cx("dt-e", e.isNew && "new", e.moved && "moved", canEdit && "grab", editable && e.locked && "locked", canEdit && selected === e.id && "selected")}
                            style={{ left: `${pct(e.s)}%`, width: `${Math.max(0.6, pct(e.e) - pct(e.s))}%` }}
                            tabIndex={canEdit ? 0 : undefined} role={canEdit ? "button" : undefined}
                            aria-pressed={canEdit ? selected === e.id : undefined}
                            aria-label={canEdit ? `${e.description}, ${e.range}. Left and right arrows move it; Shift with an arrow changes its end, Alt its start; Enter selects it and Delete then removes it.` : undefined}
                            onMouseMove={(ev) => tip.show(ev, [{ big: e.description }, { k: "Project", v: e.projectTitle }, { k: "Time", v: e.range },
                                e.overtime ? { k: "Overtime", v: fmtDur(e.overtime) } : null])}
                            onMouseLeave={tip.hide}>
                            {big && pct(e.e) - pct(e.s) > 9 && <span className="trunc">{e.description}</span>}
                            {canEdit && (
                                <>
                                    <b className="dt-h in l" data-h="l" title="Drag to change when it started" />
                                    <b className="dt-h in r" data-h="r" title="Drag to change when it ended" />
                                </>
                            )}
                        </i>
                    );
                })}
                {(meetings ?? []).map((m) => {
                    const canEdit = editable && m.editable;
                    return (
                        <i key={`m${m.id}`} data-mid={m.id} className={cx("dt-mtg", canEdit && "edit")}
                            style={{ left: `${pct(m.s)}%`, width: `${Math.max(0.6, pct(m.e) - pct(m.s))}%` }}
                            tabIndex={canEdit ? 0 : undefined} role={canEdit ? "button" : undefined}
                            aria-label={canEdit ? `Meeting: ${m.topic ?? "Meeting"}, ${m.range}. Shift with an arrow changes its end, Alt its start.` : undefined}
                            onMouseMove={(ev) => tip.show(ev, [{ big: m.topic ?? "Meeting" }, { k: "Meeting", v: m.range }, { k: "Project", v: m.projectTitle },
                                m.setBy ? { k: "Set by", v: m.setBy } : null])}
                            onMouseLeave={tip.hide}>
                            {big && pct(m.e) - pct(m.s) > 8 && <span className="trunc">{m.topic || "Meeting"}</span>}
                            {canEdit && (
                                <>
                                    <b className="dt-mh l" data-mh="l" title="Drag to change when the meeting starts" />
                                    <b className="dt-mh r" data-mh="r" title="Drag to change when the meeting ends" />
                                </>
                            )}
                        </i>
                    );
                })}
                {sel && sel.e > sel.s && (
                    <i className={cx("dt-sel", selBad && "bad", editable && "grab")}
                        style={{ left: `${pct(sel.s)}%`, width: `${Math.max(0.6, pct(sel.e) - pct(sel.s))}%` }}
                        tabIndex={editable ? 0 : undefined} role={editable ? "button" : undefined}
                        aria-label={editable ? "This log. Left and right arrows move it; Shift with an arrow changes its end, Alt its start." : undefined}>
                        {editable && (
                            <>
                                <b className="dt-h l" data-h="l" title="Drag to change the start" />
                                <b className="dt-h r" data-h="r" title="Drag to change the end" />
                            </>
                        )}
                    </i>
                )}
                {nowMin != null && nowMin >= lo && nowMin <= hi && <i className="dt-now" style={{ left: `${pct(nowMin)}%` }} />}
            </div>
            <div className="dt-scale">
                {/* the working day's own labels take the place of hour labels right next to them */}
                {ticks.filter((t) => !big || inner.every((m) => Math.abs(t - m) > 70)).map((t) => (
                    <span key={t} style={{ left: `${pct(t)}%` }}>{fmtHourLabel(t)}</span>
                ))}
                {big && inner.map((m) => (
                    <span key={`wd${m}`} className={cx("dt-wd-tag", held === m && "held")} style={{ left: `${pct(m)}%` }}
                        title={m === workHours?.e ? "Your working day ends" : "Your working day starts"}>{m % 60 ? fmtMinutes(m) : fmtHourLabel(m)}</span>
                ))}
            </div>
        </div>
    );
}
