import Skeleton from "@/shared/components/Feedback/Skeleton";

/** A presentation on its way: a hero, a title and a row of tiles, so the page doesn't jump when it arrives. */
export default function PresentationSkeleton() {
    return (
        <div className="pp-view" aria-busy="true" aria-label="Loading">
            <Skeleton className="pp-skel-hero" height="auto" />
            <Skeleton width="40%" height={26} style={{ marginTop: 18 }} />
            <Skeleton width="22%" height={14} style={{ marginTop: 12 }} />
            <div className="pp-grid pp-skel-grid">
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="pp-skel-tile" height="auto" />)}
            </div>
        </div>
    );
}
