import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/shared/utils/cx";

type PopoverProps = {
    /** Draws the button that opens it. */
    trigger: (open: boolean, toggle: () => void) => ReactNode;
    /** The panel, or a function given `close`. */
    children: ReactNode | ((close: () => void) => ReactNode);
    align?: "left" | "right";
    /** Minimum width of the panel, in pixels. */
    width?: number;
    hostClass?: string;
    className?: string;
};

/** A panel under a button, closed by a click outside or Escape (the prototype's UI.Popover). */
export default function Popover({ trigger, children, align = "right", width, hostClass, className }: PopoverProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    // A trigger near either edge (phones, wrapped header rows) must not push the panel off-screen.
    useLayoutEffect(() => {
        if (!open || !ref.current) return;
        const pop = ref.current.querySelector<HTMLElement>(".pop");
        if (!pop) return;
        pop.style.transform = "";
        const r = pop.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        if (!vw || !r.width) return;
        let dx = 0;
        if (r.right > vw - 8) dx = vw - 8 - r.right;
        if (r.left + dx < 8) dx = 8 - r.left;
        if (dx) pop.style.transform = `translateX(${Math.round(dx)}px)`;
    }, [open]);

    const close = () => setOpen(false);
    return (
        <div className={cx("pop-host", hostClass)} ref={ref}>
            {trigger(open, () => setOpen((o) => !o))}
            {open && (
                <div className={cx("pop", align, className)} style={width ? { minWidth: width } : undefined}>
                    {typeof children === "function" ? children(close) : children}
                </div>
            )}
        </div>
    );
}
