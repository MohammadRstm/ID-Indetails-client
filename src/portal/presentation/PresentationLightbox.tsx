import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { downloadItem } from "./presentationLinks";
import type { GetLink, MediaItem } from "./presentationTypes";
import { useLayer } from "./useLayer";

/** The comments beside the current file (the client's page only). */
export type LightboxComments = {
    /** Whether the panel is showing. */
    open: boolean;
    count: number;
    /** Some comments are new. */
    unread: boolean;
    onToggle: () => void;
    /** The file's comments. */
    render: () => ReactNode;
};

type Props = {
    /** The images and videos to move through (a section's grid, its videos, the hero images), in order. */
    items: MediaItem[];
    index: number;
    /** How a file is downloaded. Without it (the hero images, which aren't files of the project) there is no Download. */
    getLink?: GetLink;
    onIndex: (index: number) => void;
    onClose: () => void;
    /** A file that didn't load; its link may have expired. */
    onBroken: (url: string) => void;
    /** Given on the client's page only: a Comments button and a side panel (a bottom sheet on phones). Without it there is no comment UI. */
    comments?: LightboxComments;
};

// a swipe is mostly sideways and at least this far (pixels)
const SWIPE_PX = 50;

/**
 * A bigger look at a run of images and videos: a section's grid, the Presentation's videos, or the hero images. The
 * arrows, the Left and Right keys and a swipe move through them; Escape closes it. A video starts playing, with
 * Download above it. On the client's page a Comments button opens that file's comments beside it.
 */
export default function PresentationLightbox({ items, index, getLink, onIndex, onClose, onBroken, comments }: Props) {
    const swipe = useRef<{ x: number; y: number } | null>(null);
    const ref = useLayer<HTMLDivElement>();

    const item = items[index];
    const go = (by: number) => onIndex(Math.min(items.length - 1, Math.max(0, index + by)));

    // the keys work wherever the keyboard is, and Escape closes this layer only, not the one under it
    const onKey = useEffectEvent((e: KeyboardEvent) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        // typing in the comments box: the arrows move its caret, and its own Escape closes its list first (then this one's,
        // below); a comment's menu has the keys to itself, and its Escape closes only the menu
        if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
        const by = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        if (e.key !== "Escape" && by === 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (by === 0) onClose();
        else go(by);
    });
    useEffect(() => {
        const listener = (e: KeyboardEvent) => onKey(e);
        window.addEventListener("keydown", listener, true);
        return () => window.removeEventListener("keydown", listener, true);
    }, []);

    if (!item) return null;
    const url = item.previewUrl;

    return createPortal(
        <div ref={ref} className={cx("pp-lightbox", comments?.open && "with-panel")} role="dialog" aria-modal="true" aria-label={item.title} tabIndex={-1}
            // Escape typed in the comments box reaches here when the box had nothing of its own to close
            onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                e.stopPropagation();
                onClose();
            }}>
            <div className="pp-lb-bar">
                <span className="pp-lb-count">{index + 1} of {items.length}</span>
                <div className="pp-lb-title trunc" aria-live="polite" title={item.title}>{item.title}</div>
                {comments && (
                    <button type="button" className={cx("btn btn-sm pp-lb-comments", comments.unread && "new")} aria-pressed={comments.open}
                        aria-label={`Comments${comments.count > 0 ? `, ${comments.count}` : ""}${comments.unread ? ", some new" : ""}`} onClick={comments.onToggle}>
                        <Icon name="chat" />
                        <span>{comments.count > 0 ? `Comments (${comments.count})` : "Comments"}</span>
                        {comments.unread && <span className="pp-dot" aria-hidden="true" />}
                    </button>
                )}
                {getLink && <button type="button" className="btn btn-sm" onClick={() => void downloadItem(getLink, item)}><Icon name="download" />Download</button>}
                <button type="button" className="icon-btn pp-lb-close" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
            </div>
            <div
                className="pp-lb-stage"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                // a finger or a pen; a swipe that starts on a video would be the seek bar's
                onPointerDown={(e) => { swipe.current = e.pointerType === "mouse" || e.target instanceof HTMLVideoElement ? null : { x: e.clientX, y: e.clientY }; }}
                onPointerUp={(e) => {
                    const start = swipe.current;
                    swipe.current = null;
                    if (!start) return;
                    const dx = e.clientX - start.x;
                    const dy = e.clientY - start.y;
                    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
                }}
                onPointerCancel={() => { swipe.current = null; }}
            >
                <button type="button" className="pp-lb-nav pp-lb-prev" aria-label="Previous" disabled={index === 0} onClick={() => go(-1)}><Icon name="chevronLeft" /></button>
                {/* a video opened is a video to watch: it starts playing */}
                {item.preview === "video"
                    ? <video key={item.id} src={url} controls autoPlay playsInline preload="metadata" onError={() => onBroken(url)} />
                    : <img key={item.id} src={url} alt={item.title} decoding="async" onError={() => onBroken(url)} />}
                <button type="button" className="pp-lb-nav pp-lb-next" aria-label="Next" disabled={index === items.length - 1} onClick={() => go(1)}><Icon name="chevronRight" /></button>
            </div>
            {comments?.open && (
                <aside className="pp-lb-panel" aria-label="Comments">
                    <div className="pp-lb-panel-bar">
                        <h2 className="pp-lb-panel-title">Comments</h2>
                        <button type="button" className="icon-btn" aria-label="Hide comments" onClick={comments.onToggle}><Icon name="x" /></button>
                    </div>
                    <div className="pp-lb-panel-body">{comments.render()}</div>
                </aside>
            )}
        </div>,
        document.body,
    );
}
