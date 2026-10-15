import Empty from "@/shared/components/Feedback/Empty";
import { cx } from "@/shared/utils/cx";
import MediaStrip from "./MediaStrip";
import PresentationCard from "./PresentationCard";
import { FileGroupCard, FileRow, type GroupKind } from "./PresentationFiles";
import {
    layoutOf, SECTION_LABEL, sectionAnchor,
    type CardComments, type GetLink, type MediaItem, type MediaRun, type PortalSection, type PresentationComments, type PresentationItem,
} from "./presentationTypes";

type Props = {
    section: PortalSection;
    items: PresentationItem[];
    getLink: GetLink;
    /** Only the screen readers get the heading: the section picker above already names it (phones). */
    quietHeading?: boolean;
    /** A picture or a video was chosen: the lightbox opens on it, to move through its run. */
    onView: (section: PortalSection, item: MediaItem, run: MediaRun) => void;
    onBroken: (url: string) => void;
    /** The client's page only: a card then shows its comments, and a click on them says which item was meant. */
    comments?: Pick<PresentationComments, "threads"> & { onOpen: (section: PortalSection, item: PresentationItem) => void };
};

/**
 * One of the three sections, its items in their given order, or a note that there are none yet. Presentation: the
 * pictures in their grid, and beside it a compact card for the PDFs and documents, one for the videos and one for any
 * other files. 3D and Drawings: the pictures and videos in one row (or a slider on a phone), then the other files as
 * small cards.
 */
export default function PresentationSection({ section, items, getLink, quietHeading, onView, onBroken, comments }: Props) {
    const heading = `${sectionAnchor(section)}-heading`;
    const layout = layoutOf(section, items);

    // `before` closes a list the comments were opened from
    const commentsOf = (item: PresentationItem, before?: () => void): CardComments | undefined => {
        if (!comments) return undefined;
        const thread = comments.threads.find((t) => t.itemId === item.id);
        return {
            count: thread?.count ?? 0,
            unread: (thread?.unread ?? 0) > 0,
            onOpen: () => {
                before?.();
                comments.onOpen(section, item);
            },
        };
    };
    const card = (item: PresentationItem) => (
        <PresentationCard item={item} getLink={getLink} onView={(media) => onView(section, media, "grid")} onBroken={onBroken} comments={commentsOf(item)} />
    );
    // Presentation's cards for the files that aren't pictures
    const groups: [GroupKind, PresentationItem[]][] = [["document", layout.documents], ["video", layout.videos], ["other", layout.others]];
    const cards = groups.filter(([, list]) => list.length > 0);

    return (
        <section id={sectionAnchor(section)} className="pp-section" aria-labelledby={heading} data-section={section}>
            <div className="pp-section-head">
                <h2 id={heading} className={cx("pp-h2", quietHeading && "sr")}>{SECTION_LABEL[section]}</h2>
                {items.length > 0 && !quietHeading && <span className="muted">{items.length === 1 ? "1 item" : `${items.length} items`}</span>}
            </div>
            {items.length === 0 ? (
                <div className="pp-empty"><Empty art="projects" title="Nothing here yet" /></div>
            ) : section === "presentation" ? (
                <div className={cx("pp-present", layout.grid.length === 0 && "no-grid", cards.length === 0 && "no-cards")}>
                    {layout.grid.length > 0 && (
                        <ul className="pp-grid">
                            {layout.grid.map((item) => <li key={item.id}>{card(item)}</li>)}
                        </ul>
                    )}
                    {cards.length > 0 && (
                        <ul className="pp-kinds" aria-label="Files">
                            {cards.map(([kind, list]) => (
                                <li key={kind}>
                                    <FileGroupCard kind={kind} items={list} getLink={getLink} commentsOf={commentsOf}
                                        onPlay={(video) => onView(section, video, "videos")} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : (
                <>
                    {layout.grid.length > 0 && <MediaStrip items={layout.grid} label={`${SECTION_LABEL[section]}: pictures and videos`} card={card} />}
                    {layout.others.length > 0 && (
                        <div className="pp-files-part">
                            {layout.grid.length > 0 && <h3 className="pp-h3">Files</h3>}
                            <ul className="pp-files" aria-label={`${SECTION_LABEL[section]}: files`}>
                                {layout.others.map((item) => (
                                    <li key={item.id}><FileRow item={item} getLink={getLink} comments={commentsOf(item)} /></li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
