import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Segmented } from "@/shared/components/Forms/Filters";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import { cx } from "@/shared/utils/cx";
import PresentationHero from "./PresentationHero";
import PresentationLightbox from "./PresentationLightbox";
import PresentationSection from "./PresentationSection";
import { forgetLink } from "./presentationLinks";
import {
    isMedia, SECTION_LABEL, SECTIONS, sectionAnchor,
    type GetLink, type MediaItem, type PortalPresentation, type PortalSection, type PresentationComments, type PresentationItem,
} from "./presentationTypes";
import { usePhone } from "./usePhone";

type Props = {
    presentation: PortalPresentation;
    getLink: GetLink;
    /** Shown above everything else. */
    banner?: ReactNode;
    /** An image or a video didn't load, most likely because its link ran out: load the presentation again. Called once. */
    onLinkExpired?: () => void;
    /** The client's page gives the discussion's part here. Without it (the staff's preview) there is no comment UI at all. */
    comments?: PresentationComments;
};

/**
 * A project's presentation: the hero, the introduction and the three sections. Both the client's page and the staff's
 * preview of the draft show it, so the preview is what the client gets. Wide screens show the sections one under the
 * other with a menu that follows the scroll; phones show one at a time.
 */
export default function PresentationView({ presentation, getLink, banner, onLinkExpired, comments }: Props) {
    const phone = usePhone();
    const reducedMotion = useReducedMotion();
    const root = useRef<HTMLDivElement>(null);
    const reported = useRef(false);
    // the phone's choice, until then the first section that has something
    const [picked, setPicked] = useState<PortalSection | null>(null);
    // the section the menu shows as the one being read
    const [reading, setReading] = useState<PortalSection>("presentation");
    // the lightbox follows the item, not its place: a new answer may reorder the section
    const [viewing, setViewing] = useState<{ section: PortalSection; itemId: number } | null>(null);

    const itemsOf = (section: PortalSection) => presentation.sections.find((s) => s.section === section)?.items ?? [];
    const current = picked ?? SECTIONS.find((s) => itemsOf(s).length > 0) ?? SECTIONS[0];

    // The page's ?item= names a file whose comments are open. A picture or a video then opens in the lightbox with its
    // comments beside it (also when the link changes while the page is open, as a notification's does).
    const linked = comments?.openItemId ?? null;
    const [linkedSeen, setLinkedSeen] = useState<number | null>(null);
    if (linked !== linkedSeen) {
        setLinkedSeen(linked);
        const section = linked == null ? undefined : SECTIONS.find((s) => itemsOf(s).some((i) => i.id === linked && isMedia(i)));
        if (section && linked != null && viewing?.itemId !== linked) setViewing({ section, itemId: linked });
    }

    // the menu marks the section on screen (where the browser can tell)
    useEffect(() => {
        if (phone || typeof IntersectionObserver === "undefined" || !root.current) return;
        const onScreen = new Set<PortalSection>();
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const section = entry.target.getAttribute("data-section") as PortalSection;
                    if (entry.isIntersecting) onScreen.add(section);
                    else onScreen.delete(section);
                }
                const first = SECTIONS.find((s) => onScreen.has(s));
                if (first) setReading(first);
            },
            { rootMargin: "-96px 0px -55% 0px" },
        );
        root.current.querySelectorAll("[data-section]").forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, [phone]);

    function broken(url: string) {
        forgetLink(url);
        if (reported.current) return;
        reported.current = true;
        onLinkExpired?.();
    }

    function jump(e: MouseEvent, section: PortalSection) {
        e.preventDefault();
        setReading(section);
        // (jsdom, which the tests run in, has no scrollIntoView)
        document.getElementById(sectionAnchor(section))?.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }

    const media = viewing ? itemsOf(viewing.section).filter(isMedia) : [];
    const viewIndex = viewing ? media.findIndex((item) => item.id === viewing.itemId) : -1;
    const view = (section: PortalSection, item: MediaItem) => setViewing({ section, itemId: item.id });
    // a card's comments: a picture or a video opens in the lightbox with its panel, any other file in the page's drawer
    const viewComments = (section: PortalSection, item: PresentationItem) => {
        if (isMedia(item)) setViewing({ section, itemId: item.id });
        comments?.onOpen(item.id);
    };
    const closeLightbox = () => {
        setViewing(null);
        // its comments close with it
        if (comments?.openItemId != null) comments.onOpen(null);
    };
    const shown = viewIndex >= 0 ? media[viewIndex] : undefined;
    const threadOf = (itemId: number) => comments?.threads.find((t) => t.itemId === itemId);

    return (
        <div className="pp-view" ref={root}>
            {banner}
            <PresentationHero presentation={presentation} onBroken={broken} />

            {phone ? (
                <div className="pp-bar">
                    <Segmented stretch aria-label="Sections" value={current} onChange={setPicked}
                        options={SECTIONS.map((s) => ({ value: s, label: SECTION_LABEL[s] }))} />
                </div>
            ) : (
                <nav className="pp-bar pp-nav" aria-label="Sections">
                    {SECTIONS.map((s) => (
                        <a key={s} href={`#${sectionAnchor(s)}`} className={cx("pp-nav-link", reading === s && "on")}
                            aria-current={reading === s ? "location" : undefined} onClick={(e) => jump(e, s)}>
                            {SECTION_LABEL[s]}
                        </a>
                    ))}
                </nav>
            )}

            {(phone ? [current] : SECTIONS).map((section) => (
                <PresentationSection key={section} section={section} items={itemsOf(section)} getLink={getLink} quietHeading={phone}
                    onView={view} onBroken={broken} comments={comments && { threads: comments.threads, onOpen: viewComments }} />
            ))}

            {viewing && shown && (
                <PresentationLightbox
                    items={media}
                    index={viewIndex}
                    getLink={getLink}
                    onIndex={(i) => {
                        setViewing({ section: viewing.section, itemId: media[i].id });
                        // an open panel follows to the next file
                        if (comments?.openItemId != null) comments.onOpen(media[i].id);
                    }}
                    onClose={closeLightbox}
                    onBroken={broken}
                    comments={comments && {
                        open: comments.openItemId === shown.id,
                        count: threadOf(shown.id)?.count ?? 0,
                        unread: (threadOf(shown.id)?.unread ?? 0) > 0,
                        onToggle: () => comments.onOpen(comments.openItemId === shown.id ? null : shown.id),
                        render: () => comments.renderThread(shown),
                    }}
                />
            )}
        </div>
    );
}
