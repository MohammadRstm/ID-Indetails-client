import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

type HelpTipProps = {
    /** What it explains, for the button's name: "What is {label}?". */
    label: string;
    children: ReactNode;
    /** A link under the explanation to read more (in Help). The bubble then stays open while it is pointed at or tabbed into. */
    more?: { to: string; label?: string };
};

/**
 * A "?" beside a field or a figure that says what it is: after a short hover, on keyboard focus, or on a click (a
 * tap on a phone). Escape or moving away closes it. The bubble is the charts' tooltip (.tip). With a "Read more"
 * link, Tab moves from the "?" into the link, and the pointer can move onto the bubble to click it.
 */
export default function HelpTip({ label, children, more }: HelpTipProps) {
    const id = useId();
    const ref = useRef<HTMLButtonElement>(null);
    const bubble = useRef<HTMLDivElement>(null);
    const link = useRef<HTMLAnchorElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [at, setAt] = useState<{ x: number; y: number } | null>(null);

    function later(then: () => void, ms: number) {
        clearTimeout(timer.current);
        timer.current = setTimeout(then, ms);
    }
    function show() {
        clearTimeout(timer.current);
        const r = ref.current?.getBoundingClientRect();
        // kept inside the window: the bubble is at most 280px wide
        if (r) setAt({ x: Math.max(8, Math.min(r.left - 8, window.innerWidth - 296)), y: r.bottom + 6 });
    }
    function hide() {
        clearTimeout(timer.current);
        setAt(null);
    }
    // a moment's grace, so the pointer can cross from the "?" to a bubble with a link
    const leave = () => (more ? later(hide, 150) : hide());

    return (
        <>
            <button ref={ref} type="button" className="help-tip" aria-label={`What is ${label}?`} aria-describedby={at ? id : undefined}
                onMouseEnter={() => later(show, 350)}
                onMouseLeave={leave}
                onFocus={show}
                onBlur={(e) => { if (!bubble.current?.contains(e.relatedTarget as Node | null)) hide(); }}
                onClick={() => (at ? hide() : show())}
                onKeyDown={(e) => {
                    // the bubble takes the Escape, not a dialog around the field
                    if (e.key === "Escape" && at) { e.stopPropagation(); hide(); }
                    if (e.key === "Tab" && !e.shiftKey && at && more) { e.preventDefault(); link.current?.focus(); }
                }}>
                <Icon name="help" />
            </button>
            {at && createPortal(
                <div id={id} ref={bubble} role="tooltip" className={cx("tip", "help-bubble", more && "with-link")} style={{ left: at.x, top: at.y }}
                    onMouseEnter={() => clearTimeout(timer.current)}
                    onMouseLeave={leave}>
                    {children}
                    {more && (
                        <Link ref={link} to={more.to} className="help-more"
                            onClick={hide}
                            onBlur={(e) => { if (e.relatedTarget !== ref.current) hide(); }}
                            onKeyDown={(e) => {
                                // back to the "?" first, as that opens the bubble, then closed
                                if (e.key === "Escape") { e.stopPropagation(); ref.current?.focus(); hide(); }
                                if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); ref.current?.focus(); }
                            }}>
                            {more.label ?? "Read more in Help"} →
                        </Link>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
}
