import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "@/shared/icons/Icon";
import { downloadItem } from "./presentationLinks";
import type { GetLink, MediaItem } from "./presentationTypes";
import { useLayer } from "./useLayer";

type Props = {
    /** The images and videos of the section that was clicked, in order. */
    items: MediaItem[];
    index: number;
    getLink: GetLink;
    onIndex: (index: number) => void;
    onClose: () => void;
    /** A file that didn't load; its link may have expired. */
    onBroken: (url: string) => void;
};

// a swipe is mostly sideways and at least this far (pixels)
const SWIPE_PX = 50;

/**
 * A bigger look at the images and videos of one section. The arrows, the Left and Right keys and a swipe move through
 * them; Escape closes it.
 */
export default function PresentationLightbox({ items, index, getLink, onIndex, onClose, onBroken }: Props) {
    const swipe = useRef<{ x: number; y: number } | null>(null);
    const ref = useLayer<HTMLDivElement>();

    const item = items[index];
    const go = (by: number) => onIndex(Math.min(items.length - 1, Math.max(0, index + by)));

    // the keys work wherever the keyboard is, and Escape closes this layer only, not the one under it
    const onKey = useEffectEvent((e: KeyboardEvent) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
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
        <div ref={ref} className="pp-lightbox" role="dialog" aria-modal="true" aria-label={item.title} tabIndex={-1}>
            <div className="pp-lb-bar">
                <span className="pp-lb-count">{index + 1} of {items.length}</span>
                <div className="pp-lb-title trunc" aria-live="polite" title={item.title}>{item.title}</div>
                <button type="button" className="btn btn-sm" onClick={() => void downloadItem(getLink, item)}><Icon name="download" />Download</button>
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
                {item.preview === "video"
                    ? <video key={item.id} src={url} controls playsInline preload="metadata" onError={() => onBroken(url)} />
                    : <img key={item.id} src={url} alt={item.title} decoding="async" onError={() => onBroken(url)} />}
                <button type="button" className="pp-lb-nav pp-lb-next" aria-label="Next" disabled={index === items.length - 1} onClick={() => go(1)}><Icon name="chevronRight" /></button>
            </div>
        </div>,
        document.body,
    );
}
