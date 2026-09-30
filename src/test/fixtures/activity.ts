import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import feedJson from "./activity/feed.json";
import todayJson from "./activity/today.json";
import { people } from "./people";
import { projectWork } from "./project";

/*
 * Design's activity, captured from the seeded development API as Nadia on 30 September 2026: twelve of
 * the newest events (work edits, payments, invoices) and four logged entries, with the rest of the feed
 * (662 events) left to "Load more".
 */

export const activity = {
    feed: feedJson as unknown as Paged<Schemas["ActivityItemResponse"]>,
    today: todayJson as unknown as Schemas["ActivityTodayResponse"],
};

export const activityHandlers = [
    http.get("/api/activity", () => HttpResponse.json(activity.feed)),
    http.get("/api/activity/today", () => HttpResponse.json(activity.today)),
    http.get("/api/work/people", () => HttpResponse.json(people.list)),
    http.get("/api/work-entries/:id", () => HttpResponse.json(projectWork.entry)),
    http.get("/api/work-entries/:id/comments", () => HttpResponse.json(projectWork.entry.comments)),
];
