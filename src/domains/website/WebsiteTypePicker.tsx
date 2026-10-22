import { useId, useState } from "react";
import Icon from "@/shared/icons/Icon";
import { cleanType, slugOf } from "./websiteRules";

/**
 * A project's type: picked from the list or typed in, both in one box. Opened, the whole list shows; typing narrows
 * it, and a type not in it is kept as a new one. One spelt like a listed type becomes it on leaving the box, as the
 * API saves it.
 */
export default function TypePicker({ id, value, choices, disabled, onChange, onBlur }: {
    id: string; value: string; choices: string[]; disabled?: boolean; onChange: (type: string) => void; onBlur?: () => void;
}) {
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    // typing narrows the list; opening it shows it whole
    const [narrowed, setNarrowed] = useState(false);
    const typed = slugOf(value);
    const listed = choices.find((c) => slugOf(c) === typed);
    const shown = narrowed && typed ? choices.filter((c) => slugOf(c).includes(typed)) : choices;

    function show() {
        setOpen(true);
        setNarrowed(false);
    }

    function pick(type: string) {
        onChange(type);
        setOpen(false);
        setActive(-1);
    }

    return (
        <div style={{ position: "relative" }}>
            <div className="row" style={{ gap: 4 }}>
                <input id={id} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
                    placeholder="Pick one or type your own" value={value} disabled={disabled} maxLength={60}
                    onChange={(e) => { onChange(e.target.value); setOpen(true); setNarrowed(true); setActive(-1); }}
                    onFocus={show}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
                        if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                        if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
                        // closes the list, not the form
                        if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
                    }}
                    onBlur={() => { setOpen(false); onChange(listed ?? cleanType(value)); onBlur?.(); }} />
                {!disabled && (
                    <button type="button" className="icon-btn" aria-label="Show the types" title="Show the types" tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => { if (open) setOpen(false); else show(); document.getElementById(id)?.focus(); }}>
                        <Icon name="chevronDown" />
                    </button>
                )}
            </div>
            {open && !disabled && (
                <div id={listId} role="listbox" aria-label="Types" className="panel"
                    style={{ position: "absolute", zIndex: 30, left: 0, right: 0, marginTop: 4, maxHeight: 240, overflowY: "auto", padding: 4 }}>
                    {shown.map((type, index) => (
                        <button key={type} type="button" role="option" aria-selected={type === listed} className="btn btn-sm btn-quiet"
                            style={{ display: "flex", width: "100%", justifyContent: "flex-start", background: index === active ? "var(--accent-soft)" : undefined }}
                            onMouseDown={(e) => e.preventDefault()} onClick={() => pick(type)}>
                            {type}
                        </button>
                    ))}
                    {typed && !listed && <div className="muted" style={{ padding: 6 }}>“{cleanType(value)}” will be added as a new type.</div>}
                </div>
            )}
        </div>
    );
}
