import Columns from "@/shared/components/Charts/Columns";
import Panel from "@/shared/components/Data/Panel";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { fmtNumber, relTime } from "@/shared/format/time";
import { useWebsiteRealtime } from "./analyticsApi";
import { flag, label } from "./analyticsFormat";

/**
 * Who is on the website now: Google's last 30 minutes, a few minutes behind at most, asked again every minute. Kept
 * apart from the period's figures, which Google takes up to two days to count.
 */
export default function AnalyticsLive({ enabled }: { enabled: boolean }) {
    const query = useWebsiteRealtime(enabled);
    const now = query.data;

    return (
        <Panel
            className="analytics-live"
            title={<><span className="live-dot" aria-hidden="true" />Live</>}
            sub={now ? `Last 30 minutes · updated ${relTime(now.retrievedAt)}` : "Last 30 minutes · updates every minute"}
        >
            {!now ? (
                query.isError ? <LoadError error={query.error} what="who is on the website" retry={() => query.refetch()} /> : <SkeletonLines lines={5} />
            ) : (
                <>
                    <div className="hero-val">{fmtNumber(now.visitorsNow)}</div>
                    <div className="muted">{now.visitorsNow === 1 ? "visitor" : "visitors"} in the last 30 minutes</div>
                    <div className="mt-s">
                        <Columns height={90} axisLabels={false} labelEvery={10} labelLast={false} seriesLabel="Visitors" title="Visitors per minute, last 30 minutes"
                            data={now.visitorsPerMinute.map((value, i) => {
                                const ago = 29 - i;
                                return { value, label: ago === 0 ? "now" : `${ago}m`, tip: ago === 0 ? "This minute" : `${ago} minutes ago` };
                            })} />
                    </div>
                    {now.pages.length > 0 && (
                        <div className="mt-s">
                            <div className="label">Being read</div>
                            {now.pages.slice(0, 5).map((p) => (
                                <div key={p.title} className="spread analytics-live-row">
                                    <span className="trunc">{p.title || "Untitled page"}</span>
                                    <span className="mono muted">{fmtNumber(p.views)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {now.countries.length > 0 && (
                        <div className="mt-s muted analytics-live-countries">
                            {now.countries.slice(0, 4).map((c) => `${flag(c.code)} ${label(c.name)} ${fmtNumber(c.visitors)}`).join(" · ")}
                        </div>
                    )}
                </>
            )}
        </Panel>
    );
}
