import { useState } from "react";
import { StatusBadge } from "@/shared/components/Data/Pills";
import { fmtDateY } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import type { PortalPresentation } from "./presentationTypes";

type Props = {
    presentation: PortalPresentation;
    /** The hero image didn't load; its link may have expired. */
    onBroken: (url: string) => void;
};

/** Plain text in paragraphs: a blank line starts a new one. Never HTML. */
const paragraphsOf = (text: string | null) => (text ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** The top of the page: the hero image (or a calm block without one), the project's title and state, and the introduction. */
export default function PresentationHero({ presentation, onBroken }: Props) {
    const { hero, title, status, publishedAt, summary } = presentation;
    // an image that fails to load gives way to the calm block
    const [failed, setFailed] = useState<string | null>(null);
    const showsHero = hero != null && hero.url !== failed;
    const paragraphs = paragraphsOf(summary);

    return (
        <header className={cx("pp-hero", !showsHero && "plain")}>
            {hero && showsHero && (
                <div className="pp-hero-media">
                    <img
                        src={hero.url}
                        alt=""
                        fetchPriority="high"
                        decoding="async"
                        onError={() => {
                            setFailed(hero.url);
                            onBroken(hero.url);
                        }}
                    />
                </div>
            )}
            <div className="pp-hero-text">
                <h1 className="pp-title">{title}</h1>
                <div className="pp-hero-meta">
                    <StatusBadge status={status} />
                    {publishedAt && <span className="muted">Updated {fmtDateY(publishedAt)}</span>}
                </div>
            </div>
            {paragraphs.length > 0 && (
                <div className="pp-summary">
                    {paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
                </div>
            )}
        </header>
    );
}
