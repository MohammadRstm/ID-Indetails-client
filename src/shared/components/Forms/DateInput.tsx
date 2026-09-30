import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { keyOf, parseDateText } from "@/shared/format/parseDate";
import { companyToday, DAYS, fmtDateY, formatSettings, MONTHS, MONTHS_LONG } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { stop, useFloating } from "./useFloating";

/*
 * The prototype's date field (UI.DateInput): type a date the way people write it, or pick it from a calendar.
 * Values are "yyyy-MM-dd" day keys, like the API's.
 */

const KEY = /^\d{4}-\d{2}-\d{2}$/;
const display = (k: string) => (KEY.test(k) ? fmtDateY(k) : "");

type DateInputProps = {
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
    "aria-label"?: string;
};

export default function DateInput({ value: raw, onChange, min, max, required, disabled, id, className, style, placeholder, ...rest }: DateInputProps) {
    const value = KEY.test(raw) ? raw : "";
    const lo = min && KEY.test(min) ? min : null;
    const hi = max && KEY.test(max) ? max : null;
    const inRange = (k: string) => (!lo || k >= lo) && (!hi || k <= hi);
    const [text, setText] = useState(display(value));
    const [open, setOpen] = useState(false);
    const [bad, setBad] = useState(false);
    const [mode, setMode] = useState<"days" | "months">("days");
    const [view, setView] = useState<{ y: number; m: number } | null>(null);
    const [yearText, setYearText] = useState("");
    const wrapRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const today = companyToday();

    // A new value from outside replaces what was typed.
    const [shownValue, setShownValue] = useState(value);
    if (shownValue !== value) {
        setShownValue(value);
        setText(display(value));
        setBad(false);
    }

    function show(y: number, m: number) {
        const d = new Date(Date.UTC(y, m, 1));
        setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
        setYearText(String(d.getUTCFullYear()));
    }
    function openCalendar() {
        if (disabled) return;
        const k = parseDateText(text) || value || (hi && today > hi ? hi : lo && today < lo ? lo : today);
        const [y, m] = k.split("-").map(Number);
        show(y, m - 1);
        setMode("days");
        setOpen(true);
    }
    function close(refocus: boolean) {
        setOpen(false);
        if (refocus) inputRef.current?.focus();
    }
    useFloating(open, wrapRef, panelRef, close);

    function emit(k: string) {
        setText(display(k));
        setBad(false);
        if (k !== value) onChange(k);
    }
    function flash() {
        setBad(true);
        setTimeout(() => setBad(false), 900);
    }
    function commit() {
        const k = parseDateText(text);
        if (k === "") {
            if (required) setText(display(value));
            else emit("");
            return;
        }
        if (k && inRange(k)) {
            emit(k);
            return;
        }
        setText(display(value));
        flash();
    }
    function onType(next: string) {
        setText(next);
        const k = parseDateText(next); // the calendar follows what's being typed
        if (open && k) {
            const [y, m] = k.split("-").map(Number);
            show(y, m - 1);
        }
    }
    function pick(k: string) {
        emit(k);
        close(true);
    }
    function moveMonths(n: number) {
        if (view) show(view.y, view.m + n);
    }
    function commitYear(t: string) {
        const y = parseInt(t, 10);
        if (view && y >= 1900 && y <= 2200) show(y, view.m);
        else if (view) setYearText(String(view.y));
    }

    function renderDays() {
        const { y, m } = view!;
        const first = formatSettings().weekStart;
        const firstWeekday = new Date(Date.UTC(y, m, 1)).getUTCDay();
        const lead = (firstWeekday - first + 7) % 7;
        const cells = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, m, 1 - lead + i)));
        const heads = Array.from({ length: 7 }, (_, j) => DAYS[(first + j) % 7].slice(0, 2));
        return (
            <div className="cal-grid">
                {heads.map((d, j) => <div key={`h${j}`} className="cal-dow">{d}</div>)}
                {cells.map((d) => {
                    const k = keyOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
                    return (
                        <button key={k} type="button" disabled={!inRange(k)}
                            className={cx("cal-day", d.getUTCMonth() !== m && "out", k === today && "today", k === value && "sel")}
                            onClick={() => pick(k)}>
                            {d.getUTCDate()}
                        </button>
                    );
                })}
            </div>
        );
    }

    function renderMonths() {
        const { y } = view!;
        return (
            <div className="cal-months">
                {MONTHS.map((name, i) => {
                    const firstK = keyOf(y, i, 1), lastK = keyOf(y, i + 1, 0);
                    const ok = (!lo || lastK >= lo) && (!hi || firstK <= hi);
                    const sel = value && +value.slice(0, 4) === y && +value.slice(5, 7) === i + 1;
                    return (
                        <button key={name} type="button" disabled={!ok} className={cx("cal-mon", sel && "sel", view!.m === i && "cur")}
                            onClick={() => { show(y, i); setMode("days"); }}>
                            {name}
                        </button>
                    );
                })}
            </div>
        );
    }

    const classes = (className ?? "input").split(" ").filter((c) => c && c !== "select");
    return (
        <>
            <div ref={wrapRef} className={cx(classes.join(" "), "date-in", open && "on", bad && "bad", disabled && "dis")} style={style}>
                <input
                    ref={inputRef}
                    id={id}
                    className="date-txt"
                    value={text}
                    disabled={disabled}
                    placeholder={placeholder ?? "Sep 23, 2026"}
                    aria-label={rest["aria-label"]}
                    autoComplete="off"
                    title="Type a date (e.g. 23/9/2026 or Sep 23) or pick one"
                    onClick={() => !open && openCalendar()}
                    onChange={(e) => onType(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commit(); close(false); }
                        else if (e.key === "ArrowDown" && !open) { e.preventDefault(); openCalendar(); }
                        else if (e.key === "Tab") close(false);
                    }}
                />
                <button type="button" className="date-btn" tabIndex={-1} disabled={disabled} aria-label="Open calendar"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (open ? close(true) : (openCalendar(), inputRef.current?.focus()))}>
                    <Icon name="calendar" />
                </button>
            </div>
            {open && view && createPortal(
                <div className="cal" ref={panelRef} onClick={stop}
                    onMouseDown={(e) => { stop(e); if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault(); }}>
                    <div className="cal-head">
                        <button type="button" className="cal-nav" aria-label={mode === "days" ? "Previous month" : "Previous year"}
                            onClick={() => moveMonths(mode === "days" ? -1 : -12)}><Icon name="chevronLeft" /></button>
                        <button type="button" className={cx("cal-title", mode === "months" && "on")} title="Pick a month"
                            onClick={() => setMode(mode === "days" ? "months" : "days")}>
                            {MONTHS_LONG[view.m]}<Icon name="chevronDown" />
                        </button>
                        <input className="cal-year" inputMode="numeric" maxLength={4} aria-label="Year" title="Type a year" value={yearText}
                            onChange={(e) => { const t = e.target.value.replace(/\D/g, ""); setYearText(t); if (t.length === 4) commitYear(t); }}
                            onBlur={() => commitYear(yearText)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitYear(yearText); }
                                else if (e.key === "ArrowUp") { e.preventDefault(); moveMonths(12); }
                                else if (e.key === "ArrowDown") { e.preventDefault(); moveMonths(-12); }
                            }} />
                        <button type="button" className="cal-nav" aria-label={mode === "days" ? "Next month" : "Next year"}
                            onClick={() => moveMonths(mode === "days" ? 1 : 12)}><Icon name="chevronRight" /></button>
                    </div>
                    {mode === "days" ? renderDays() : renderMonths()}
                    <div className="cal-foot">
                        <button type="button" className="btn btn-sm btn-quiet" disabled={!inRange(today)} onClick={() => pick(today)}>Today</button>
                        {!required && value && (
                            <button type="button" className="btn btn-sm btn-quiet" onClick={() => { emit(""); close(true); }}>Clear</button>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
