import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** How far a press must move before it is a drag rather than a click: a finger needs a little more room. */
const MOUSE_THRESHOLD = 6;
const TOUCH_THRESHOLD = 8;

type Press = { id: number; startX: number; startY: number; fromX: number; fromY: number; threshold: number; dragging: boolean };

/**
 * Dragging the blob with a mouse, a finger or a pen (pointer capture, so it follows even off the button). A press
 * that doesn't move is a click; one that does is a drag, and the click that follows it is swallowed.
 */
export function useBlobDrag(at: { x: number; y: number }, size: number, onDrop: (x: number, y: number) => void, onTap: () => void) {
    const press = useRef<Press | null>(null);
    const dragged = useRef(false);
    const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);

    const clamp = (x: number, y: number) => ({
        x: Math.min(Math.max(0, x), window.innerWidth - size),
        y: Math.min(Math.max(0, y), window.innerHeight - size),
    });

    return {
        dragAt,
        handlers: {
            onPointerDown: (e: PointerEvent<HTMLElement>) => {
                if (e.button !== 0) return;
                dragged.current = false;
                press.current = {
                    id: e.pointerId, startX: e.clientX, startY: e.clientY, fromX: at.x, fromY: at.y,
                    threshold: e.pointerType === "mouse" ? MOUSE_THRESHOLD : TOUCH_THRESHOLD, dragging: false,
                };
                e.currentTarget.setPointerCapture?.(e.pointerId);
            },
            onPointerMove: (e: PointerEvent<HTMLElement>) => {
                const p = press.current;
                if (!p || p.id !== e.pointerId) return;
                const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
                if (!p.dragging && Math.hypot(dx, dy) < p.threshold) return;
                p.dragging = true;
                setDragAt(clamp(p.fromX + dx, p.fromY + dy));
            },
            onPointerUp: (e: PointerEvent<HTMLElement>) => {
                const p = press.current;
                press.current = null;
                if (!p || p.id !== e.pointerId || !p.dragging) return;
                dragged.current = true;
                const end = clamp(p.fromX + e.clientX - p.startX, p.fromY + e.clientY - p.startY);
                setDragAt(null);
                onDrop(end.x, end.y);
            },
            onPointerCancel: () => {
                press.current = null;
                setDragAt(null);
            },
            onClick: (e: MouseEvent<HTMLElement>) => {
                if (dragged.current) {
                    dragged.current = false;
                    e.preventDefault();
                    return;
                }
                onTap();
            },
        },
    };
}
