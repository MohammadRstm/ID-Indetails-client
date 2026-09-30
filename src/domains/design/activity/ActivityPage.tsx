import { useState } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCompanySettings } from "@/app/shell/shellQueries";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { Kpi } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { ChipGroup } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Avatar from "@/shared/components/Identity/Avatar";
import type { Person } from "@/shared/components/Identity/People";
import { dayKey, fmtDateY, fmtDayDateY, fmtH, relDay } from "@/shared/format/time";
import { useActivityFeed, useActivityToday, type ActivityGroup, type FeedFilters } from "../../shared/activity/activityApi";
import FeedItem from "../../shared/activity/FeedItem";
import type { FeedEvent } from "../../shared/activity/feedWords";
import { useClients } from "../../shared/clients/clientsApi";
import { useProjects } from "../../shared/projects/projectsApi";
import { usePeopleWork } from "../people/peopleWorkApi";
import { clickable } from "@/shared/utils/clickable";

type Kind = "all" | ActivityGroup;

/** Everything that happened in Design, newest first (the prototype's P.AdminActivity). */
export default function ActivityPage() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const company = useCompanySettings().data;
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const [kind, setKind] = useState<Kind>("all");
    const [clientId, setClientId] = useState("all");
    const [projectId, setProjectId] = useState("all");
    const [personId, setPersonId] = useState("all");

    const filters: FeedFilters = {
        domain: "design",
        group: kind === "all" ? undefined : kind,
        clientId: clientId === "all" || clientId === "internal" ? undefined : +clientId,
        internal: clientId === "internal",
        projectId: projectId === "all" ? undefined : +projectId,
        userId: personId === "all" ? undefined : +personId,
    };
    const feed = useActivityFeed(filters);
    const today = useActivityToday(seesWork);
    const peopleWork = usePeopleWork(seesWork);
    const clients = useClients({ domain: "design", includeArchived: true, pageSize: 100 }, permissions.has(P.CLIENT_VIEW)).data?.items ?? [];
    const projects = useProjects({ domain: "design", pageSize: 100 }).data?.items ?? [];

    const rows = peopleWork.data ?? [];
    const people = new Map<number, Person>(rows.map((r) => [r.id, { id: r.id, name: r.name, photoFileId: r.photoFileId, online: r.online }]));
    const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
    const groups = groupByDay(items);
    const online = rows.filter((r) => r.online && r.status === "active");
    const byHour = new Map((today.data?.byLoggedHour ?? []).map((h) => [h.hour, h.minutes]));
    const hourly = Array.from({ length: 14 }, (_, i) => {
        const h = i + 7;
        const at = `${h % 12 === 0 ? 12 : h % 12}`;
        return { label: `${at}${h < 12 ? "a" : "p"}`, tip: `Logged around ${at} ${h < 12 ? "AM" : "PM"}`, value: (byHour.get(h) ?? 0) / 60 };
    });

    return (
        <div className="page">
            <PageHead title="Activity" sub={`Everything that happened across ${company?.name ?? "the company"}, newest first.`} />

            <div className="filters">
                <ChipGroup value={kind} onChange={setKind} aria-label="Kind of activity" options={[
                    { value: "all", label: "Everything" },
                    ...(seesWork ? [{ value: "work" as const, label: "Work logged" }] : []),
                    { value: "money", label: "Money" },
                    { value: "billing", label: "Billing" },
                    { value: "projects", label: "Projects" },
                    { value: "people", label: "People" },
                ]} />
                <div className="grow" />
                {permissions.has(P.CLIENT_VIEW) && (
                    <Select className="select sm" style={{ width: 180 }} aria-label="Client" value={clientId} onChange={setClientId} options={[
                        { value: "all", label: "All clients" }, { value: "internal", label: "Internal (no client)" },
                        ...clients.map((c) => ({ value: String(c.id), label: c.displayName })),
                    ]} />
                )}
                <Select className="select sm" style={{ width: 190 }} aria-label="Project" value={projectId} onChange={setProjectId}
                    options={[{ value: "all", label: "All projects" }, ...projects.map((p) => ({ value: String(p.id), label: p.title }))]} />
                {seesWork && (
                    <Select className="select sm" style={{ width: 175 }} aria-label="Employee" value={personId} onChange={setPersonId}
                        options={[{ value: "all", label: "All employees" }, ...rows.map((r) => ({ value: String(r.id), label: r.name }))]} />
                )}
            </div>

            <div className="grid g-8-4">
                <div className="panel">
                    <div className="panel-body" style={{ paddingTop: 2 }}>
                        {feed.isError ? <div style={{ paddingTop: 12 }}><LoadError error={feed.error} retry={() => feed.refetch()} what="the activity" /></div>
                            : !feed.data ? <div style={{ paddingTop: 12 }}><SkeletonLines lines={8} /></div>
                                : groups.map((g) => (
                                    <div key={g.key}>
                                        <div className="feed-day">{relDay(g.key)} · {fmtDateY(g.key)}</div>
                                        {g.items.map((it) => <FeedItem key={it.id} item={it} people={people} />)}
                                    </div>
                                ))}
                        {feed.data && items.length === 0 && <Empty art="search" title="Nothing matches these filters" />}
                    </div>
                    {feed.hasNextPage && (
                        <div className="panel-foot">
                            <button className="btn btn-sm btn-quiet" disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                                {feed.isFetchingNextPage ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </div>

                {seesWork && (
                    <div className="stack">
                        <Figure title="Today at a glance" sub={fmtDayDateY(new Date())}>
                            {today.isError ? <LoadError error={today.error} retry={() => today.refetch()} what="today's work" /> : (
                                <>
                                    <div className="kpis" style={{ border: 0, marginBottom: 10 }}>
                                        <Kpi label="Hours logged" value={today.data ? fmtH(today.data.minutes) : "-"} />
                                        <Kpi label="Entries" value={today.data?.entries ?? "-"} />
                                        <Kpi label="People" value={today.data?.people ?? "-"} />
                                    </div>
                                    <div className="u" style={{ marginBottom: 4 }}>When today's work was logged</div>
                                    <Columns data={hourly} height={132} labelEvery={3} format={(v) => `${Math.round(v)}h`} labelLast={false} />
                                </>
                            )}
                        </Figure>

                        <div className="panel">
                            <div className="panel-head"><div><div className="panel-title">Online now</div><div className="panel-sub">{peopleWork.data ? `${online.length} people` : " "}</div></div></div>
                            <div className="panel-body" style={{ paddingTop: 4 }}>
                                {!peopleWork.data ? <SkeletonLines lines={3} /> : online.map((r) => (
                                    <div key={r.id} className="mini-row" style={{ cursor: "pointer" }} {...clickable(() => navigate(`/design/people/${r.id}`), "button")}>
                                        <Avatar person={people.get(r.id)!} size={26} presence />
                                        <div className="grow" style={{ minWidth: 0 }}>
                                            <div className="trunc" style={{ fontWeight: 600, fontSize: "12.5px" }}>{r.name}</div>
                                            <div className="muted trunc" style={{ fontSize: 11 }}>{r.focus?.title ?? r.position}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

type DayGroup = { key: string; items: FeedEvent[] };

function groupByDay(items: FeedEvent[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const it of items) {
        const k = dayKey(it.occurredAt);
        let g = groups[groups.length - 1];
        if (!g || g.key !== k) groups.push((g = { key: k, items: [] }));
        g.items.push(it);
    }
    return groups;
}
