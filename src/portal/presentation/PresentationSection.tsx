import Empty from "@/shared/components/Feedback/Empty";
import { cx } from "@/shared/utils/cx";
import PresentationCard from "./PresentationCard";
import { SECTION_LABEL, sectionAnchor, type GetLink, type MediaItem, type PortalSection, type PresentationItem } from "./presentationTypes";

type Props = {
    section: PortalSection;
    items: PresentationItem[];
    getLink: GetLink;
    /** Only the screen readers get the heading: the section picker above already names it (phones). */
    quietHeading?: boolean;
    onView: (section: PortalSection, item: MediaItem) => void;
    onBroken: (url: string) => void;
};

/** One of the three sections: its items in their given order, or a note that there are none yet. */
export default function PresentationSection({ section, items, getLink, quietHeading, onView, onBroken }: Props) {
    const heading = `${sectionAnchor(section)}-heading`;
    return (
        <section id={sectionAnchor(section)} className="pp-section" aria-labelledby={heading} data-section={section}>
            <div className="pp-section-head">
                <h2 id={heading} className={cx("pp-h2", quietHeading && "sr")}>{SECTION_LABEL[section]}</h2>
                {items.length > 0 && !quietHeading && <span className="muted">{items.length === 1 ? "1 item" : `${items.length} items`}</span>}
            </div>
            {items.length === 0 ? (
                <div className="pp-empty"><Empty art="projects" title="Nothing here yet" /></div>
            ) : (
                <ul className="pp-grid">
                    {items.map((item) => (
                        <li key={item.id}>
                            <PresentationCard item={item} getLink={getLink} onView={(media) => onView(section, media)} onBroken={onBroken} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
