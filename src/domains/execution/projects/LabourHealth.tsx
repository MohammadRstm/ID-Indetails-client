import Figure from "@/shared/components/Charts/Figure";
import LineChart from "@/shared/components/Charts/LineChart";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtDate, fmtDateY, fmtDayDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { useSiteTimeline, type SiteTimeline } from "./siteApi";
import { siteMoneyOf, type SiteMoney } from "./siteMoney";

/**
 * Ground labour against the profit the client's payments have made (the prototype's EX.LabourHealth): how much
 * of the cushion is used, the recent weekly pace, and when profit would reach zero at today's crew and day rate.
 */
export default function LabourHealth({ project }: { project: Project }) {
    const timeline = useSiteTimeline(project.id, true);
    if (!project.money) return null;
    const x = siteMoneyOf(project.money);

    return (
        <div className="panel mt xm-health">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Ground labour and profit</div>
                    <div className="panel-sub">Labour is a pure cost - every week of it comes out of the profit the client's payments have made.</div>
                </div>
            </div>
            <div className="panel-body">
                {timeline.isError ? <LoadError error={timeline.error} retry={() => timeline.refetch()} what="the labour figures" />
                    : !timeline.data ? <SkeletonLines lines={5} />
                        : <Health x={x} timeline={timeline.data} />}
            </div>
        </div>
    );
}

function Health({ x, timeline: { weeks, projection: pr } }: { x: SiteMoney; timeline: SiteTimeline }) {
    const cushion = x.labour + Math.max(0, x.cashProfit);
    const used = cushion > 0 ? Math.min(100, (x.labour / cushion) * 100) : 100;
    const reported = weeks.filter((w) => w.groundLabourInWeek > 0);
    const avg = (list: typeof weeks) => (list.length ? list.reduce((t, w) => t + w.groundLabourInWeek, 0) / list.length : 0);
    const lately = avg(reported.slice(-4)), before = avg(reported.slice(-8, -4));
    const trend = before > 0 ? (lately - before) / before : null;
    const tone = x.cashProfit < 0 ? "down" : used > 80 ? "warn" : "ok";

    return (
        <>
            <div className="grid g-2 xm-grid">
                <div>
                    <div className="spread">
                        <span className="u">Profit cushion</span>
                        <b className={cx("mono", tone === "down" && "down")}>{x.cashProfit < 0 ? "Used up" : `${money.exact(x.cashProfit)} left`}</b>
                    </div>
                    <div className={cx("xm-meter", tone)}><i style={{ width: `${used}%` }} /></div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {x.cashProfit < 0 ? "Ground labour and materials have cost more than the client has paid."
                            : `Ground labour has used ${Math.round(used)}% of what the project could absorb before profit hits zero.`}
                    </div>
                    <div className="xm-owed mt">
                        <div><span>Ground labour so far</span><b className="mono">{money.exact(x.labour)}</b><em>{plural(reported.length, "week")} reported</em></div>
                        <div>
                            <span>Last 4 weeks</span><b className="mono">{money.exact(lately)}</b>
                            <em>a week on average{trend != null ? ` · ${trend >= 0 ? "▲ " : "▼ "}${Math.abs(Math.round(trend * 100))}% on the 4 before` : ""}</em>
                        </div>
                    </div>
                </div>
                <div>
                    <div className="u" style={{ marginBottom: 6 }}>When would it stop making money?</div>
                    {pr.state === "done" ? (
                        <div className="banner"><Icon name="info" /><div className="grow">The project is closed - nothing left to project.</div></div>
                    ) : pr.state === "losing" ? (
                        <div className="banner xm-loss">
                            <Icon name="alert" />
                            <div className="grow"><b>Losing money: {money.exact(-x.cashProfit)} below zero.</b> Costs have passed what the client has paid. The next client payment is what brings it back.</div>
                        </div>
                    ) : pr.state === "no_defaults" || !pr.zeroOn ? (
                        <div className="banner"><Icon name="info" /><div className="grow">Not enough data to project yet - set the crew size and daily pay in the labour defaults.</div></div>
                    ) : (
                        <div className="xm-proj">
                            <div className="xm-proj-date">{fmtDayDate(pr.zeroOn)}</div>
                            <div>
                                ≈ {plural(pr.workingDays ?? 0, "working day")} of ground labour at {plural(pr.workers, "worker")} × {money.exact(pr.dailyPay)} a day ({money.exact(pr.dailyCost)}/day)
                            </div>
                            {pr.zeroOnOncePaid && <div className="muted">Once the client pays everything agreed so far, the cushion lasts to about {fmtDayDate(pr.zeroOnOncePaid)}.</div>}
                            <div className="hint">A projection, not a promise: it assumes the crew size, their pay and the money received stay as they are today, and no new materials.</div>
                        </div>
                    )}
                </div>
            </div>
            {reported.length >= 2 && (
                <div className="mt">
                    <Figure title="Profit against ground labour, week by week" sub="Profit so far (received − spent) and ground labour added up since the start. Payments push profit up; labour pulls it down.">
                        <LineChart height={200} tickEvery={Math.max(1, Math.ceil(weeks.length / 7))} format={(v) => money.short(v)} series={[
                            {
                                label: "Profit so far", area: true,
                                points: weeks.map((w) => ({
                                    y: w.profit, label: fmtDate(w.weekStart),
                                    tip: `Week of ${fmtDateY(w.weekStart)}${w.receivedInWeek ? ` · payment ${money.short(w.receivedInWeek)}` : ""}`,
                                })),
                            },
                            { label: "Ground labour to date", color: "var(--warn-mark)", points: weeks.map((w) => ({ y: w.groundLabour, label: fmtDate(w.weekStart) })) },
                        ]} />
                    </Figure>
                </div>
            )}
        </>
    );
}
