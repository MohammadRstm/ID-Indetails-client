import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

// Escape closes only the topmost layer: a modal opened from another (a file from an entry, an entry from a
// drawer) must not take the one underneath with it.
function topScrim(): Element | null {
    const all = document.querySelectorAll(".scrim");
    return all[all.length - 1] ?? null;
}

type ModalProps = {
    title?: ReactNode;
    sub?: ReactNode;
    onClose?: () => void;
    /** md, lg, xl, or a page-specific class such as "xl inv-editor". */
    size?: string;
    /** The body without padding (documents, split layouts). */
    flush?: boolean;
    foot?: ReactNode;
    headTools?: ReactNode;
    scrimClass?: string;
    children: ReactNode;
};

/** A dialog over the page (the prototype's UI.Modal). A click on the backdrop or Escape closes it. */
export default function Modal({ title, sub, onClose, size, flush, foot, headTools, scrimClass, children }: ModalProps) {
    const ref = useRef<HTMLDivElement>(null);
    const close = useEffectEvent(() => onClose?.());

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && topScrim() === ref.current) close();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div
            ref={ref}
            className={cx("scrim", scrimClass)}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose?.();
            }}
        >
            <div className={cx("modal", size)} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
                {(title || onClose) && (
                    <div className="modal-head">
                        <div className="grow">
                            <div className="modal-title">{title}</div>
                            {sub && <div className="modal-sub">{sub}</div>}
                        </div>
                        {headTools}
                        {onClose && (
                            <button className="icon-btn" onClick={onClose} aria-label="Close">
                                <Icon name="x" />
                            </button>
                        )}
                    </div>
                )}
                <div className={cx("modal-body", flush && "flush")}>{children}</div>
                {foot && <div className="modal-foot">{foot}</div>}
            </div>
        </div>
    );
}

type DrawerProps = {
    title?: string;
    head?: ReactNode;
    foot?: ReactNode;
    onClose: () => void;
    children: ReactNode;
};

/** A panel sliding in from the right (the prototype's UI.Drawer). */
export function Drawer({ title, head, foot, onClose, children }: DrawerProps) {
    const close = useEffectEvent(() => onClose());

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !topScrim()) close();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div>
            <div className="drawer-scrim" onClick={onClose} />
            <aside className="drawer" role="dialog" aria-label={title}>
                <div className="drawer-head">
                    <div className="grow">{head ?? <div className="modal-title">{title}</div>}</div>
                    <button className="icon-btn" onClick={onClose} aria-label="Close">
                        <Icon name="x" />
                    </button>
                </div>
                <div className="drawer-body">{children}</div>
                {foot && <div className="modal-foot">{foot}</div>}
            </aside>
        </div>
    );
}
