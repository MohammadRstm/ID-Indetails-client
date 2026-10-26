import { useState, type FormEvent } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import { SearchInput } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import useDebounce from "@/shared/hooks/useDebounce";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { dayKey, fmtDayDateY, fmtTime, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { SITE_LOG_MAX, useEditSiteLog, useSiteLogs, useWriteSiteLog, type SiteLog } from "./siteLogsApi";

const PAGE_SIZE = 25;

type Option = { value: string; label: string; disabled?: boolean };

/** "What happened on site today": the site it is about and the words, saved as a log of its own. */
export function WriteSiteLog({ sites, fixedSiteId }: { sites: Option[]; fixedSiteId?: number }) {
    const write = useWriteSiteLog();
    const first = sites.find((s) => !s.disabled)?.value ?? "";
    const [siteId, setSiteId] = useState(fixedSiteId ? String(fixedSiteId) : first);
    const [body, setBody] = useState("");
    const errors = useFormErrors();
    const chosen = fixedSiteId ? String(fixedSiteId) : sites.some((s) => s.value === siteId && !s.disabled) ? siteId : first;
    const closed = sites.filter((s) => s.disabled).length;
    const siteError = !chosen && "Choose the site this is about.";
    const bodyError = !body.trim() ? "Say what happened." : body.trim().length > SITE_LOG_MAX && `At most ${SITE_LOG_MAX} characters.`;

    function submit(e?: FormEvent) {
        e?.preventDefault();
        if (write.isPending) return;
        if (siteError || bodyError) return errors.tried();
        write.mutate({ projectId: +chosen, body: body.trim() }, {
            onSuccess: (log) => {
                toast({ text: "Log saved", sub: `${log.project.title} · ${fmtTime(log.createdAt)}`, icon: "checkCircle" });
                setBody("");
            },
        });
    }

    return (
        <form className="panel" onSubmit={submit} aria-label="Write a log">
            <div className="panel-body">
                {!fixedSiteId && (
                    <div className="field">
                        <label className="label required" htmlFor="sl-site">Site</label>
                        <Select id="sl-site" value={chosen} onChange={setSiteId} options={sites} />
                        {closed > 0 && <div className="hint">Completed and archived sites take no new logs.</div>}
                        <FieldError message={errors.show("site", siteError)} />
                    </div>
                )}
                <div className={fixedSiteId ? "field" : "field mt"}>
                    <label className="label required" htmlFor="sl-body">What happened?</label>
                    <AutoGrowTextarea id="sl-body" className="input" minRows={3} maxRows={12} maxLength={SITE_LOG_MAX} value={body}
                        placeholder="e.g. The concrete shipment arrived with 3 bags missing." onChange={(e) => setBody(e.target.value)} onBlur={errors.touch("body")} />
                    <FieldError message={errors.show("body", bodyError)} />
                    <div className="hint">Each log is kept on its own, with the time it was written. You can change it until the end of the day.</div>
                </div>
                <div className="row mt" style={{ gap: 10 }}>
                    <span className="grow">{write.error != null && <span className="err"><Icon name="alert" />{errorMessage(write.error)}</span>}</span>
                    <button type="submit" className="btn btn-primary" disabled={write.isPending}><Icon name="plus" />{write.isPending ? "Saving…" : "Save log"}</button>
                </div>
            </div>
        </form>
    );
}

type SiteLogBrowserProps = {
    /** The caller's own logs, or everyone's (site_log:view_all). */
    mine: boolean;
    /** Sites to filter by; none shows no site filter. */
    sites?: Option[];
    /** People to filter by (everyone's logs only). */
    people?: Option[];
    /** Fixed filters: a site's page, a person's profile. */
    projectId?: number;
    userId?: number;
    title?: string;
};

/** Daily logs, newest first, grouped by day, with filters for the site, the person, the days and words in them. */
export function SiteLogBrowser({ mine, sites, people, projectId, userId, title = "Logs" }: SiteLogBrowserProps) {
    const [site, setSite] = useState("");
    const [person, setPerson] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const words = useDebounce({ value: search.trim(), debounceTimeMs: 300 });
    const logs = useSiteLogs(mine, {
        projectId: projectId ?? (site ? +site : null), userId: userId ?? (person ? +person : null),
        from, to, search: words, page, pageSize: PAGE_SIZE,
    });
    const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
    const data = logs.data;
    const filtered = !!(site || person || from || to || words);

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div className="grow"><div className="panel-title">{title}</div>{data && <div className="panel-sub">{data.totalCount} {data.totalCount === 1 ? "log" : "logs"}</div>}</div>
            </div>
            <div className="panel-body">
                <div className="row wrap" style={{ gap: 8 }}>
                    <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search the logs" width={200} aria-label="Search the logs" />
                    {sites && !projectId && (
                        <Select value={site} onChange={reset(setSite)} aria-label="Filter by site" options={[{ value: "", label: "All sites" }, ...sites]} />
                    )}
                    {people && !userId && (
                        <Select value={person} onChange={reset(setPerson)} aria-label="Filter by person" options={[{ value: "", label: "Everyone" }, ...people]} />
                    )}
                    <DateInput className="input" style={{ width: 140 }} value={from} max={to || undefined} onChange={reset(setFrom)} placeholder="From" aria-label="From day" />
                    <DateInput className="input" style={{ width: 140 }} value={to} min={from || undefined} onChange={reset(setTo)} placeholder="To" aria-label="To day" />
                    {filtered && (
                        <button className="btn btn-sm btn-quiet" onClick={() => { setSite(""); setPerson(""); setFrom(""); setTo(""); setSearch(""); setPage(1); }}>Clear</button>
                    )}
                </div>
                {loadFailed(logs) ? <div className="mt"><LoadError error={logs.error} retry={() => logs.refetch()} what="the logs" /></div>
                    : !data ? <div className="mt"><SkeletonLines lines={5} /></div>
                        : data.items.length === 0 ? (
                            <Empty art="time" title={filtered ? "No log matches" : "No logs yet"}
                                text={filtered ? "Try other days, another site or other words." : mine ? "What happens on site goes here, one log at a time." : undefined} />
                        ) : (
                            <>
                                {byDay(data.items).map((g) => (
                                    <div key={g.key} className="day-group mt">
                                        <div className="day-head">
                                            <h4>{relDay(g.at)}</h4>
                                            <span className="muted" style={{ fontSize: "11.5px" }}>{fmtDayDateY(g.at)}</span>
                                        </div>
                                        <ol className="site-logs" aria-label={`Logs of ${fmtDayDateY(g.at)}`}>
                                            {g.items.map((log) => <LogRow key={log.id} log={log} showPerson={!mine && !userId} showSite={!projectId} />)}
                                        </ol>
                                    </div>
                                ))}
                                <Pager page={page} pageSize={PAGE_SIZE} total={data.totalCount} onPage={setPage} />
                            </>
                        )}
            </div>
        </div>
    );
}

function LogRow({ log, showPerson, showSite }: { log: SiteLog; showPerson: boolean; showSite: boolean }) {
    const edit = useEditSiteLog();
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(log.body);
    const error = !body.trim() ? "Say what happened." : body.trim().length > SITE_LOG_MAX && `At most ${SITE_LOG_MAX} characters.`;

    return (
        <li className="site-log">
            <div className="row spread" style={{ gap: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                    <span className="mono">{fmtTime(log.createdAt)}</span>
                    {showSite && <> · {log.project.title}</>}
                    {showPerson && <> · {log.person.name}</>}
                    {log.updatedAt && <> · edited</>}
                </span>
                {log.canEdit && !editing && (
                    <button className="btn btn-sm btn-quiet" onClick={() => { setBody(log.body); setEditing(true); }}><Icon name="edit" />Edit</button>
                )}
            </div>
            {editing ? (
                <div className="mt-s">
                    <AutoGrowTextarea className="input" minRows={2} maxRows={12} maxLength={SITE_LOG_MAX} value={body} aria-label="Change the log"
                        onChange={(e) => setBody(e.target.value)} />
                    <FieldError message={error || (edit.error != null ? errorMessage(edit.error) : undefined)} />
                    <div className="row mt-s" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                        <button className="btn btn-sm btn-primary" disabled={!!error || edit.isPending}
                            onClick={() => edit.mutate({ id: log.id, body: body.trim() }, { onSuccess: () => setEditing(false) })}>Save</button>
                    </div>
                </div>
            ) : <div style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{log.body}</div>}
        </li>
    );
}

function byDay(logs: SiteLog[]) {
    const groups: { key: string; at: string; items: SiteLog[] }[] = [];
    for (const log of logs) {
        const key = dayKey(log.createdAt);
        const last = groups.at(-1);
        if (last?.key === key) last.items.push(log);
        else groups.push({ key, at: log.createdAt, items: [log] });
    }
    return groups;
}
