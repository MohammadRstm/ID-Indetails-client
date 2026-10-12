import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { stop, useFloating } from "./useFloating";

export type SelectOption<V extends string = string> = {
    value: V;
    label: string;
    disabled?: boolean;
    /** Shown on the button instead of the label, for a narrow one ("+961" for "Lebanon +961"). */
    short?: string;
};

type SelectProps<V extends string> = {
    value: V;
    options: SelectOption<V>[];
    onChange: (value: V) => void;
    id?: string;
    /** "select sm" and the like; "select" is always there. */
    className?: string;
    style?: CSSProperties;
    disabled?: boolean;
    "aria-label"?: string;
    /** A filter box at the top of the list however short it is; by default only long lists get one. */
    searchable?: boolean;
    /** The filter box's placeholder. */
    searchPlaceholder?: string;
};

// Longer lists get a filter box at the top.
const SEARCH_FROM = 9;

/**
 * The prototype's dropdown (UI.Select): the browser's own list can't be styled, so it is drawn here, in a panel
 * over the page, with a filter box for long lists, type-ahead and the keyboard.
 */
export default function Select<V extends string>({ value, options, onChange, id, className, style, disabled, searchable: alwaysSearch, searchPlaceholder, ...rest }: SelectProps<V>) {
    const currentIndex = options.findIndex((o) => o.value === value);
    // a value that isn't one of the options shows as a choice still to make, not as the first option: the form
    // would send the value, not what was shown
    const shown = currentIndex >= 0 ? options[currentIndex] : null;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const typed = useRef({ text: "", at: 0 });
    const searchable = alwaysSearch ?? options.length >= SEARCH_FROM;
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

    function close(refocus: boolean) {
        setOpen(false);
        setQuery("");
        if (refocus) buttonRef.current?.focus();
    }
    function openMenu(seed = "") {
        if (disabled) return;
        setQuery(seed);
        setActive(seed ? 0 : Math.max(0, currentIndex));
        setOpen(true);
    }
    useFloating(open, buttonRef, menuRef, close, { matchWidth: true, list: () => listRef.current });
    useLayoutEffect(() => {
        if (!open || !listRef.current) return;
        (listRef.current.children[active] as HTMLElement | undefined)?.scrollIntoView?.({ block: "nearest" });
    }, [open, active, q]);

    function pick(option: SelectOption<V> | undefined) {
        if (!option || option.disabled) return;
        close(true);
        if (option.value !== value) onChange(option.value);
    }
    function step(delta: number) {
        if (!list.length) return;
        let n = active;
        for (let k = 0; k < list.length; k++) {
            n = Math.min(list.length - 1, Math.max(0, n + delta));
            if (!list[n].disabled) break;
        }
        setActive(n);
    }
    // Letters jump to the next option starting with what was typed (short lists without a filter box).
    function jump(ch: string) {
        const now = Date.now(), t = typed.current;
        t.text = now - t.at < 700 ? t.text + ch : ch;
        t.at = now;
        const s = t.text.toLowerCase();
        const k = list.findIndex((o) => o.label.toLowerCase().startsWith(s) && !o.disabled);
        if (k >= 0) setActive(k);
    }
    function onKey(e: KeyboardEvent) {
        const k = e.key;
        if (!open) {
            if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
                e.preventDefault();
                openMenu();
            } else if (k.length === 1 && searchable && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                openMenu(k);
            }
            return;
        }
        if (k === "ArrowDown") { e.preventDefault(); step(1); }
        else if (k === "ArrowUp") { e.preventDefault(); step(-1); }
        else if (k === "Home") { e.preventDefault(); setActive(0); }
        else if (k === "End") { e.preventDefault(); setActive(list.length - 1); }
        else if (k === "Enter" || (k === " " && !searchable)) { e.preventDefault(); pick(list[active]); }
        else if (k === "Tab") close(false);
        else if (!searchable && k.length === 1 && !e.ctrlKey && !e.metaKey) jump(k);
    }

    const classes = (className ?? "select").split(" ").filter(Boolean);
    if (!classes.includes("select")) classes.unshift("select");

    return (
        <>
            <button
                type="button"
                ref={buttonRef}
                id={id}
                className={cx(classes.join(" "), "sel-btn", open && "on")}
                style={style}
                disabled={disabled}
                title={shown?.label ?? ""}
                aria-label={rest["aria-label"]}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => (open ? close(false) : openMenu())}
                onKeyDown={onKey}
            >
                <span className={cx("sel-val", !shown && "muted")}>{shown ? shown.short ?? shown.label : "Choose…"}</span>
                <Icon name="chevronDown" className="sel-chev" />
            </button>
            {open && createPortal(
                <div className="sel-menu" ref={menuRef} onMouseDown={stop} onClick={stop}>
                    {searchable && (
                        <div className="sel-search">
                            <Icon name="search" />
                            <input autoFocus value={query} placeholder={searchPlaceholder ?? "Type to filter…"} aria-label="Filter options"
                                onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
                        </div>
                    )}
                    <div className="sel-list" role="listbox" ref={listRef}>
                        {list.map((o, i) => {
                            const on = o.value === shown?.value;
                            return (
                                <div
                                    key={`${o.value}|${i}`}
                                    role="option"
                                    aria-selected={on}
                                    className={cx("sel-opt", i === active && "act", on && "on", o.disabled && "dis")}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseMove={() => active !== i && setActive(i)}
                                    onClick={() => pick(o)}
                                >
                                    <span className="trunc">{o.label}</span>
                                    {on && <Icon name="check" className="sel-chk" />}
                                </div>
                            );
                        })}
                        {list.length === 0 && <div className="sel-empty">Nothing matches “{query}”</div>}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
