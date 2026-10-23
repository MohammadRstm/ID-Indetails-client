import { useState, type DragEvent, type PointerEvent } from "react";

/** The list with `id` moved to where `target` is; the items between shift by one. */
export function placed<K>(ids: K[], id: K, target: K): K[] {
    const rest = ids.filter((x) => x !== id);
    rest.splice(ids.indexOf(target), 0, id);
    return rest;
}

/**
 * Reordering a list by drag and drop: spread `item(id)` on each item, and dropping one on another puts it in that
 * place. A drag starts anywhere on the item but its fields and buttons, which keep working as usual. Give the items the
 * `drag-item` class: while dragging, the one dragged has `data-dragging` and the one it would land on `data-drop`
 * ("before" or "after"), which it styles.
 */
export function useDragOrder<K extends string | number>(ids: K[], onOrder: (next: K[]) => void, disabled = false) {
    // a drag can start: the pointer went down on the item itself, not on one of its controls
    const [armed, setArmed] = useState(false);
    const [dragging, setDragging] = useState<K | null>(null);
    const [over, setOver] = useState<K | null>(null);

    function end() {
        setArmed(false);
        setDragging(null);
        setOver(null);
    }

    function item(id: K) {
        const landing = dragging != null && over === id && dragging !== id;
        return {
            draggable: !disabled && armed,
            onPointerDown: (e: PointerEvent) => setArmed(!(e.target as HTMLElement).closest("input, textarea, select, button, a")),
            onDragStart: (e: DragEvent) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(id));
                setDragging(id);
            },
            onDragOver: (e: DragEvent) => {
                if (dragging == null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(id);
            },
            onDrop: (e: DragEvent) => {
                e.preventDefault();
                if (dragging != null && dragging !== id) onOrder(placed(ids, dragging, id));
                end();
            },
            onDragEnd: end,
            "data-dragging": dragging === id || undefined,
            "data-drop": landing ? (ids.indexOf(dragging) < ids.indexOf(id) ? "after" : "before") : undefined,
        };
    }

    return { item };
}

/** What `item(id)` gives an item, to pass it down to a row component. */
export type DragItemProps = ReturnType<ReturnType<typeof useDragOrder>["item"]>;
