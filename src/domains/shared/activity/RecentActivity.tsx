import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { useRecentActivity, type FeedFilters } from "./activityApi";
import FeedItem from "./FeedItem";

type RecentActivityProps = {
    filters: FeedFilters;
    title?: string;
    sub: string;
    /** Said when nothing happened yet. */
    empty: string;
    count?: number;
    hideProject?: boolean;
};

/** A page's "Recent activity" panel: its newest events, in the feed's words. */
export default function RecentActivity({ filters, title = "Recent activity", sub, empty, count = 10, hideProject }: RecentActivityProps) {
    const query = useRecentActivity(filters, count);
    return (
        <div className="panel mt">
            <div className="panel-head"><div><div className="panel-title">{title}</div><div className="panel-sub">{sub}</div></div></div>
            <div className="panel-body" style={{ paddingTop: 2 }}>
                {query.isError ? <LoadError error={query.error} retry={() => query.refetch()} what="the activity" />
                    : !query.data ? <SkeletonLines lines={4} />
                        : query.data.map((item) => <FeedItem key={item.id} item={item} hideProject={hideProject} />)}
                {query.data?.length === 0 && <p className="muted">{empty}</p>}
            </div>
        </div>
    );
}
