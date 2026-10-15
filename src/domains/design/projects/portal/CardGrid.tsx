import { useEffect, useState } from "react";
import Icon from "@/shared/icons/Icon";
import { useReorder, type PortalContentItem, type PortalSection } from "./contentApi";
import ContentCard from "./ContentCard";
import { REORDER_HELP_ID, useCardSort } from "./useCardSort";

/** How long "Order saved" stays. */
const SAVED_MS = 2500;

type Props = {
    projectId: number;
    section: PortalSection;
    /** The section's files in their order, removed ones included. */
    items: PortalContentItem[];
    canEdit: boolean;
    canReplace: boolean;
    onPreviewFailed: (fileId: number) => void;
    onReplace: (item: PortalContentItem) => void;
};

/**
 * A section's cards. The ones that are not removed can be rearranged (never into another section): by their handle,
 * with a pointer or the keys, or from their menu. Removed ones wait at the end, faded, until the next publish.
 */
export default function CardGrid({ projectId, section, items, canEdit, canReplace, onPreviewFailed, onReplace }: Props) {
    const reorder = useReorder(projectId);
    const [status, setStatus] = useState<"saving" | "saved" | null>(null);
    const kept = items.filter((item) => item.state !== "removed");
    const removed = items.filter((item) => item.state === "removed");
    const byId = new Map(kept.map((item) => [item.id, item]));
    const sortable = canEdit && kept.length >= 2;

    // taken apart, so the grid's ref stays apart from what is drawn
    const { grid, order, held, said, handle, move } = useCardSort({
        ids: kept.map((item) => item.id),
        enabled: sortable,
        titleOf: (id) => byId.get(id)?.title ?? "",
        onCommit: async (next) => {
            setStatus("saving");
            setStatus((await reorder(section, next)) ? "saved" : null);
        },
    });

    useEffect(() => {
        if (status !== "saved") return;
        const timer = setTimeout(() => setStatus(null), SAVED_MS);
        return () => clearTimeout(timer);
    }, [status]);

    const card = (item: PortalContentItem, index?: number) => (
        <ContentCard key={item.id} projectId={projectId} item={item} canEdit={canEdit} canReplace={canReplace} onPreviewFailed={onPreviewFailed} onReplace={onReplace}
            sort={sortable && index != null ? {
                index, count: kept.length, held: held?.id === item.id ? held.by : null, grip: handle(item.id), move: (to) => move(item.id, to),
            } : undefined} />
    );

    return (
        <>
            {sortable && (
                <div className="pc-order">
                    <span className="muted">Drag a card by its handle to change the order clients see.</span>
                    <span className="pc-order-status" role="status">
                        {status === "saving" ? "Saving order…" : status === "saved" ? <><Icon name="check" />Order saved</> : null}
                    </span>
                    <span id={REORDER_HELP_ID} className="sr">
                        Press Space or Enter to pick a card up, the arrow keys to move it, Space or Enter to drop it, and Escape to cancel.
                    </span>
                </div>
            )}
            <div className="pc-grid" ref={grid}>
                {order.map((id, index) => {
                    const item = byId.get(id);
                    return item ? card(item, index) : null;
                })}
                {removed.map((item) => card(item))}
            </div>
            <div className="sr" aria-live="polite" aria-atomic="true">{said}</div>
        </>
    );
}
