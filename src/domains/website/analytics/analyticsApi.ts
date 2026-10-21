import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toApiError } from "@/api/errors";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import type { AnalyticsRange } from "./analyticsRange";

export type WebsiteAnalytics = Schemas["WebsiteAnalyticsResponse"];
export type AnalyticsTotals = Schemas["WebsiteAnalyticsTotals"];
export type AnalyticsDay = Schemas["WebsiteAnalyticsDay"];
export type AnalyticsSource = Schemas["WebsiteAnalyticsSource"];
export type AnalyticsPage = Schemas["WebsiteAnalyticsPage"];
export type AnalyticsEvent = Schemas["WebsiteAnalyticsEvent"];
export type WebsiteRealtime = Schemas["WebsiteAnalyticsRealtimeResponse"];

// Kept apart from ["website", …], which every change on the Website pages refreshes: nothing here changes with them.
const KEY = "website-analytics";

/** Google Analytics isn't switched on for the API yet. */
export const analyticsNotConnected = (error: unknown) => toApiError(error).code === "website_analytics_not_configured";

/**
 * A period's visitors, from Google Analytics (website_analytics:view). The API keeps answers for minutes and leaves
 * Google alone after it fails, so nothing is retried here: the page offers "Try again".
 */
export function useWebsiteAnalytics(range: AnalyticsRange, compare: boolean) {
    return useQuery({
        queryKey: [KEY, range.from, range.to, compare],
        queryFn: async () => (await http.get<WebsiteAnalytics>("/website/analytics", { params: { from: range.from, to: range.to, compare } })).data,
        placeholderData: keepPreviousData,
        staleTime: 5 * 60_000,
        retry: false,
    });
}

/** The last 30 minutes, asked again every minute while the page is open in front. */
export function useWebsiteRealtime(enabled: boolean) {
    return useQuery({
        queryKey: [KEY, "realtime"],
        queryFn: async () => (await http.get<WebsiteRealtime>("/website/analytics/realtime")).data,
        enabled,
        refetchInterval: 60_000,
        staleTime: 30_000,
        retry: false,
    });
}
