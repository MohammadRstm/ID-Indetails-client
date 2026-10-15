import { useState, type ReactNode } from "react";
import { StatusBadge } from "@/shared/components/Data/Pills";
import { fmtDateY } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import PresentationLightbox from "./PresentationLightbox";
import type { MediaItem, PortalPresentation, PresentationHero as Hero } from "./presentationTypes";
import { usePhone } from "./usePhone";

type Props = {
    presentation: PortalPresentation;
    /** A hero image didn't load; its link may have expired. */
    onBroken: (url: string) => void;
};

/** The big one and four beside it; a fifth and more are behind a "+N" on the last. */
const SHOWN = 5;

/** Plain text in paragraphs: a blank line starts a new one. Never HTML. */
const paragraphsOf = (text: string | null) => (text ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/**
 * The top of the page. With hero images: the first big on the left, the others in a grid on the right (a "+N" on the
 * last when there are more), the project's title on the first one over a dark fade, and the introduction under the
 * title in smaller type (under the pictures on a phone). Any of them opens the gallery, which moves through them all.
 * Without any (or when none will load): the title and the introduction in a calm block.
 */
export default function PresentationHero({ presentation, onBroken }: Props) {
    const { heroes, title, status, publishedAt, summary } = presentation;
    const phone = usePhone();
    // an image that fails to load gives way to the next; with none left, the calm block
    const [failed, setFailed] = useState<string[]>([]);
    const [viewing, setViewing] = useState<number | null>(null);
    const shown = heroes.filter((hero) => !failed.includes(hero.url));
    const paragraphs = paragraphsOf(summary);

    const meta = (
        <div className="pp-hero-meta">
            <StatusBadge status={status} />
            {publishedAt && <span className="pp-updated">Updated {fmtDateY(publishedAt)}</span>}
        </div>
    );
    const intro = paragraphs.length > 0 && (
        <div className="pp-summary">
            {paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </div>
    );

    if (shown.length === 0) {
        return (
            <header className="pp-hero plain">
                <div className="pp-hero-text">
                    <h1 className="pp-title">{title}</h1>
                    {meta}
                </div>
                {intro}
            </header>
        );
    }

    const fail = (hero: Hero) => {
        setFailed((list) => [...list, hero.url]);
        onBroken(hero.url);
    };
    const more = shown.length - SHOWN;
    // the gallery's pictures: the project's own, not files of it (so they can't be downloaded or commented on)
    const gallery = shown.map((hero, i): MediaItem => ({
        id: -(i + 1), title, name: hero.name, contentType: "image/jpeg", preview: "image", sizeBytes: 0,
        previewUrl: hero.url, previewUrlExpiresAt: hero.urlExpiresAt,
    }));
    const shot = (hero: Hero, i: number, label: string, extra?: ReactNode) => (
        <button type="button" className="pp-hero-shot" aria-label={label} onClick={() => setViewing(i)}>
            <img src={hero.url} alt="" fetchPriority={i === 0 ? "high" : undefined} decoding="async" onError={() => fail(hero)} />
            {extra}
        </button>
    );

    return (
        <header className={cx("pp-hero", `n${Math.min(shown.length, SHOWN)}`)}>
            <div className="pp-hero-grid">
                <div className="pp-hero-main">
                    {shot(shown[0], 0, shown.length === 1 ? "View the picture" : `View the pictures, 1 of ${shown.length}`)}
                    {/* over the picture, and no obstacle to a click on it */}
                    <div className="pp-hero-over">
                        <h1 className="pp-title">{title}</h1>
                        {meta}
                        {!phone && intro}
                    </div>
                </div>
                {shown.slice(1, SHOWN).map((hero, at) => {
                    const i = at + 1;
                    const last = i === SHOWN - 1 && more > 0;
                    return (
                        <div key={hero.url} className="pp-hero-side">
                            {shot(hero, i, last ? `View picture ${i + 1} of ${shown.length}, and ${more} more` : `View picture ${i + 1} of ${shown.length}`,
                                last && <span className="pp-hero-more" aria-hidden="true">+{more}</span>)}
                        </div>
                    );
                })}
            </div>
            {phone && intro}
            {viewing != null && gallery[viewing] && (
                <PresentationLightbox items={gallery} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)}
                    onBroken={(url) => {
                        const hero = shown.find((h) => h.url === url);
                        if (hero) fail(hero);
                    }} />
            )}
        </header>
    );
}
