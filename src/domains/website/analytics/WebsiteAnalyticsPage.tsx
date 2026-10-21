import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { Banner } from "@/shared/components/Data/Bits";
import Panel, { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import DateInput from "@/shared/components/Forms/DateInput";
import { Segmented, Toggle } from "@/shared/components/Forms/Filters";
import { companyToday, formatSettings, relTime } from "@/shared/format/time";
import AnalyticsLive from "./AnalyticsLive";
import { AnalyticsKpis, TrafficPanel } from "./AnalyticsOverview";
import { AcquisitionPanels, ActionsPanel, AudiencePanels, TopPagesPanel } from "./AnalyticsSections";
import { analyticsNotConnected, useWebsiteAnalytics } from "./analyticsApi";
import { customRange, FIRST_DAY, presetRange, PRESETS, rangeDays, rangeLabel, type AnalyticsRange, type RangeKey } from "./analyticsRange";

/**
 * The Website area's Analytics page (website_analytics:view): the company website's visitors, read by the API from
 * Google Analytics. Nothing here is the website's content, so nothing is public, and nothing can be changed.
 */
export default function WebsiteAnalyticsPage() {
    const today = companyToday();
    const [rangeKey, setRangeKey] = useState<RangeKey>("28d");
    const [custom, setCustom] = useState<AnalyticsRange>(() => presetRange(28, today));
    const [compare, setCompare] = useState(true);
    const preset = PRESETS.find((p) => p.value === rangeKey);
    const range = preset ? presetRange(preset.days, today) : custom;

    const query = useWebsiteAnalytics(range, compare);
    const data = query.data;
    const compareLabel = `vs the ${rangeDays(range)} days before`;

    const chooseRange = (key: RangeKey) => {
        // a custom period starts from the one being looked at
        if (key === "custom") setCustom(range);
        setRangeKey(key);
    };

    const actions = (
        <>
            <Segmented value={rangeKey} onChange={chooseRange} aria-label="Period"
                options={[...PRESETS.map(({ value, label }) => ({ value, label })), { value: "custom" as const, label: "Custom" }]} />
            {rangeKey === "custom" && (
                <div className="row" style={{ gap: 6 }}>
                    <div style={{ width: 142 }}>
                        <DateInput value={custom.from} min={FIRST_DAY} max={today} aria-label="From"
                            onChange={(day) => day && setCustom(customRange(custom, "from", day, today))} />
                    </div>
                    <span className="muted">to</span>
                    <div style={{ width: 142 }}>
                        <DateInput value={custom.to} min={FIRST_DAY} max={today} aria-label="To"
                            onChange={(day) => day && setCustom(customRange(custom, "to", day, today))} />
                    </div>
                </div>
            )}
            <div className="row" style={{ gap: 8 }}>
                <Toggle checked={compare} onChange={setCompare} label="Compare with the period before" />
                <span className="muted">Compare</span>
            </div>
        </>
    );

    if (query.isError && analyticsNotConnected(query.error)) {
        return (
            <div className="page">
                <PageHead title="Analytics" sub="Visitors to the company website, from Google Analytics." />
                <Panel className="mt">
                    <Empty art="time" title="Google Analytics isn't connected yet"
                        text="Once the website's Google Analytics property and its service account are set up on the server, the website's visitors show here. The steps are in the API's docs/website.md, under “Analytics”." />
                </Panel>
            </div>
        );
    }

    const otherTimeZone = data?.timeZone && data.timeZone !== formatSettings().timeZone ? data.timeZone : null;

    return (
        <div className="page">
            <PageHead title="Analytics" actions={actions}
                sub="Visitors to the company website, from Google Analytics. Google takes up to two days to count a day fully, so the latest days can still go up." />

            <div className="muted analytics-status" aria-live="polite">
                {rangeLabel(range)}
                {data && ` · updated ${relTime(data.retrievedAt)}`}
                {query.isFetching && data && " · refreshing"}
            </div>

            {query.isError && (
                <Banner tone="attn" icon="alert" action={<button type="button" className="btn btn-sm" onClick={() => query.refetch()}>Try again</button>}>
                    {errorMessage(query.error)}
                </Banner>
            )}
            {data?.thresholded && (
                <Banner tone="hold">Google left out a few rows with very few visitors, to protect their privacy, so some lists may not add up to the totals.</Banner>
            )}
            {otherTimeZone && (
                <Banner tone="hold">
                    Google Analytics counts days in {otherTimeZone}, not the company's {formatSettings().timeZone}, so a day here may not match a day in the app. Set the property's time zone in Google Analytics (Admin, Property details).
                </Banner>
            )}

            <div className="analytics mt" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
                <AnalyticsKpis data={data} loading={!data && !query.isError} compareLabel={compareLabel} />
                <div className="analytics-traffic mt">
                    {data && !data.hasData ? (
                        <Panel>
                            <Empty art="time" title="No visits recorded yet"
                                text="Visits show here within a day of the website's first visitors, once they accept its cookie question. Live shows them within minutes." />
                        </Panel>
                    ) : (
                        <TrafficPanel data={data} compared={compare} />
                    )}
                    <AnalyticsLive enabled />
                </div>
                {data?.hasData && (
                    <>
                        <AcquisitionPanels data={data} />
                        <TopPagesPanel data={data} />
                        <AudiencePanels data={data} />
                        <ActionsPanel data={data} compareLabel={compareLabel} />
                    </>
                )}
            </div>
        </div>
    );
}
