import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A "?" beside a field that says what it is for: after a short hover, on keyboard focus, or on a click (a tap
 * on a phone). Escape or moving away closes it. The bubble is the charts' tooltip (.tip).
 */
export default function HelpTip({ label, children }: { label: string; children: ReactNode }) {
    const id = useId();
    const ref = useRef<HTMLButtonElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [at, setAt] = useState<{ x: number; y: number } | null>(null);

    function show() {
        const r = ref.current?.getBoundingClientRect();
        // kept inside the window: the bubble is at most 280px wide
        if (r) setAt({ x: Math.max(8, Math.min(r.left - 8, window.innerWidth - 296)), y: r.bottom + 6 });
    }
    function hide() {
        clearTimeout(timer.current);
        setAt(null);
    }

    return (
        <>
            <button ref={ref} type="button" className="help-tip" aria-label={`What is ${label}?`} aria-describedby={at ? id : undefined}
                onMouseEnter={() => { timer.current = setTimeout(show, 350); }}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onClick={() => (at ? hide() : show())}
                onKeyDown={(e) => {
                    // the bubble takes the Escape, not a dialog around the field
                    if (e.key === "Escape" && at) { e.stopPropagation(); hide(); }
                }}>
                ?
            </button>
            {at && createPortal(<div id={id} role="tooltip" className="tip" style={{ left: at.x, top: at.y }}>{children}</div>, document.body)}
        </>
    );
}
