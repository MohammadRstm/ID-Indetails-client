import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseTime } from "@/shared/format/parseTime";
import { fmtDur, fmtMinutes } from "@/shared/format/time";
import { stop, useFloating } from "./useFloating";

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

/**
 * A typed time with a dropdown of quarter hours (the prototype's UI.TimeField). The list floats over the page, so
 * opening it never stretches the dialog the field is in.
 */
export default function TimeField({ value, onChange, min, id, label, placeholder = "9:00 AM" }: TimeFieldProps) {
    const [text, setText] = useState(value == null ? "" : fmtMinutes(value));
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const [shownValue, setShownValue] = useState(value);
    if (shownValue !== value) {
        setShownValue(value);
        setText(value == null ? "" : fmtMinutes(value));
    }
    // a click outside or Escape closes the list; the field keeps the focus it has
    useFloating(open, ref, listRef, () => setOpen(false));

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
                onBlur={(e) => {
                    commit(e.target.value);
                    setOpen(false);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        commit(e.currentTarget.value);
                        setOpen(false);
                        e.currentTarget.blur();
                    }
                }}
            />
            {open && createPortal(
                <div ref={listRef} className="pop floating" style={{ maxHeight: 232, overflowY: "auto", minWidth: 170 }} onClick={stop}
                    onMouseDown={(e) => {
                        // the field keeps the focus, so scrolling the list doesn't close it
                        e.preventDefault();
                        stop(e);
                    }}>
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
                </div>,
                document.body,
            )}
        </div>
    );
}
