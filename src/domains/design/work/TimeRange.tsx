import { useState } from "react";
import TimeField from "@/shared/components/Forms/TimeField";
import { fmtDur, fmtRange, fmtTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { DAY, isoAt } from "./day";
import { overtimeTag } from "./overtime";
import type { OvertimePreview } from "./workApi";

type TimeRangeProps = {
    date: string;
    startMin: number;
    duration: number;
    /** The API's overtime preview for this time, once it has answered. */
    preview?: OvertimePreview;
    onChange: (startMin: number, duration: number) => void;
};

const CHIPS = [30, 60, 120, 180, 240];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/**
 * Two ways to say when: start → end, or start + how long (the prototype's UI.TimeRange). The duration is
 * the source of truth, so switching mode never changes the entry, only how it is typed.
 */
export default function TimeRange({ date, startMin: s, duration: dur, preview, onChange }: TimeRangeProps) {
    const [mode, setMode] = useState<"end" | "dur">("end");
    const endMin = (s + dur) % DAY, nextDay = s + dur >= DAY;
    const startAt = isoAt(date, s), endAt = isoAt(date, s + dur);
    const hh = Math.floor(dur / 60), mm = dur % 60;
    const setDur = (h: number, m: number) => onChange(s, Math.max(0, Math.min(16 * 60, h * 60 + m)));

    return (
        <div className="trange">
            <div className="seg trange-mode">
                <button type="button" className={cx("seg-btn", mode === "end" && "on")} onClick={() => setMode("end")}>Start → end</button>
                <button type="button" className={cx("seg-btn", mode === "dur" && "on")} onClick={() => setMode("dur")}>Start + how long</button>
            </div>
            <div className="row wrap" style={{ gap: 12, alignItems: "flex-end", marginTop: 10 }}>
                <div className="field" style={{ width: 132 }}>
                    <label className="label">Start</label>
                    <TimeField label="Start time" value={s} onChange={(v) => onChange(v, dur)} />
                </div>
                {mode === "end" ? (
                    <>
                        <div className="muted" style={{ paddingBottom: 8, fontSize: 16 }}>→</div>
                        <div className="field" style={{ width: 132 }}>
                            <label className="label">End</label>
                            <TimeField label="End time" value={endMin} min={s} onChange={(v) => {
                                let d2 = (v % DAY) - s;
                                if (d2 <= 0) d2 += DAY;
                                onChange(s, d2);
                            }} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="muted" style={{ paddingBottom: 8, fontSize: 16 }}>+</div>
                        <div className="field">
                            <label className="label">Worked for</label>
                            <div className="row" style={{ gap: 6 }}>
                                <input type="number" className="input mono trange-num" min="0" max="16" aria-label="Hours" value={hh}
                                    onChange={(e) => setDur(Math.max(0, parseInt(e.target.value || "0", 10) || 0), mm)} /><span className="muted">h</span>
                                <select className="select mono trange-num" aria-label="Minutes" value={mm - (mm % 5)} onChange={(e) => setDur(hh, parseInt(e.target.value, 10))}>
                                    {MINUTES.map((x) => <option key={x} value={x}>{String(x).padStart(2, "0")}</option>)}
                                </select><span className="muted">m</span>
                            </div>
                        </div>
                        <div style={{ paddingBottom: 8 }} className="muted">ends <b className="mono sec">{fmtTime(endAt)}</b>{nextDay ? " (next day)" : ""}</div>
                    </>
                )}
                <div className="grow" />
                <div className="chips" style={{ paddingBottom: 4 }}>
                    {CHIPS.map((m) => (
                        <button key={m} type="button" className={cx("chip", dur === m && "on")} onClick={() => onChange(s, m)}>{m < 60 ? `${m}m` : `${m / 60}h`}</button>
                    ))}
                </div>
            </div>
            <div className="trange-sum">
                <span className="mono">{fmtRange(startAt, endAt)}</span><span className="muted">·</span><b className="mono">{fmtDur(dur)}</b>
                {preview && preview.overtimeMinutes > 0 && (
                    <>
                        <span className="muted">·</span>
                        <span className="ot-tag"><Icon name="clock" />{overtimeTag(preview)}</span>
                    </>
                )}
            </div>
        </div>
    );
}
