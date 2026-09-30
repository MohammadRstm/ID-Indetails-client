import type { CSSProperties } from "react";
import { cx } from "@/shared/utils/cx";

type SkeletonProps = {
    width?: CSSProperties["width"];
    height?: CSSProperties["height"];
    className?: string;
    style?: CSSProperties;
};

/** A grey block standing in for content that is loading. */
export default function Skeleton({ width = "100%", height = 12, className, style }: SkeletonProps) {
    return <span className={cx("skel", className)} style={{ width, height, ...style }} aria-hidden="true" />;
}

/** A few lines of text on their way. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
    return (
        <div className="skel-lines" aria-busy="true" aria-label="Loading">
            {Array.from({ length: lines }, (_, i) => (
                <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} />
            ))}
        </div>
    );
}

/** A KPI strip on its way: the tiles keep their size so the page doesn't jump. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
    return (
        <div className="kpis" aria-busy="true" aria-label="Loading">
            {Array.from({ length: count }, (_, i) => (
                <div className="kpi" key={i}>
                    <Skeleton width="55%" height={10} />
                    <Skeleton width="40%" height={19} style={{ marginTop: 8 }} />
                </div>
            ))}
        </div>
    );
}
