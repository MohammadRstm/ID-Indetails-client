import { useEffect, useMemo, useRef, useState } from "react";
import { parseTime } from "@/shared/format/parseTime";
import { fmtDur, fmtMinutes } from "@/shared/format/time";

type TimeFieldProps = {
    /** Minutes after midnight. */
    value: number | null;
    onChange: (minutes: number) => void;
    /** Offer times after this one, with how long each would last. */
    min?: number | null;
    id?: string;
    label?: string;
    placeholder?: string;
};

/** A typed time with a dropdown of quarter hours (the prototype's UI.TimeField). */
export default function TimeField({ value, onChange, min, id, label, placeholder = "9:00 AM" }: TimeFieldProps) {
    const [text, setText] = useState(value == null ? "" : fmtMinutes(value));
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const [shownValue, setShownValue] = useState(value);
    if (shownValue !== value) {
        setShownValue(value);
        setText(value == null ? "" : fmtMinutes(value));
    }
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    const options = useMemo(() => {
        const out: { v: number; label: string; extra: string | null }[] = [];
        const start = min != null ? min + 15 : 6 * 60;
        const end = min != null ? min + 60 * 12 : 23 * 60 + 45;
        for (let m = start; m <= end && m <= 36 * 60; m += 15) {
            out.push({ v: m, label: fmtMinutes(m % 1440), extra: min != null ? fmtDur(m - min) : null });
        }
        return out.slice(0, 72);
    }, [min]);

    function commit(input: string) {
        const minutes = parseTime(input);
        if (minutes != null) {
            onChange(minutes);
            setText(fmtMinutes(minutes));
        } else {
            setText(value == null ? "" : fmtMinutes(value));
        }
    }

    return (
        <div className="pop-host" ref={ref}>
            <input
                id={id}
                className="input mono"
                value={text}
                placeholder={placeholder}
                aria-label={label}
                onFocus={() => setOpen(true)}
                onChange={(e) => setText(e.target.value)}
                onBlur={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        commit(e.currentTarget.value);
                        setOpen(false);
                        e.currentTarget.blur();
                    }
                    // an open list takes the Escape, so the dialog around the field stays open
                    if (e.key === "Escape" && open) {
                        e.stopPropagation();
                        setOpen(false);
                    }
                }}
            />
            {open && (
                <div className="pop left" style={{ maxHeight: 232, overflowY: "auto", minWidth: 170, top: "calc(100% + 4px)" }}>
                    {options.map((o) => (
                        <button key={o.v} type="button" className="pop-item"
                            onMouseDown={(ev) => {
                                ev.preventDefault();
                                onChange(o.v);
                                setText(fmtMinutes(o.v % 1440));
                                setOpen(false);
                            }}>
                            <span className="mono">{o.label}</span>
                            {o.extra && <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>{o.extra}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
