import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "@/shared/icons/Icon";
import { useLayer } from "../presentation/useLayer";

type Props = {
    title: string;
    onClose: () => void;
    /** Given when this is one step in: goes back to the list it came from. */
    onBack?: { label: string; go: () => void };
    children: ReactNode;
};

/**
 * The client page's side drawer for the chat and the comments: about 420px wide on large screens, the whole screen on
 * phones. The page behind doesn't scroll and the keyboard stays inside; Escape, the X and a click outside close it.
 */
export default function DiscussionDrawer({ title, onClose, onBack, children }: Props) {
    const layer = useLayer<HTMLDivElement>();
    return createPortal(
        <div className="dp-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={layer} className="dp-drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
                onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    e.stopPropagation();
                    onClose();
                }}>
                <div className="dp-drawer-bar">
                    {onBack && <button type="button" className="btn btn-sm btn-quiet" onClick={onBack.go}><Icon name="chevronLeft" />{onBack.label}</button>}
                    <h2 className="dp-drawer-title">{title}</h2>
                    <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
                </div>
                <div className="dp-drawer-body">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
