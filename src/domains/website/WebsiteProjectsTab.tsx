import { useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Panel from "@/shared/components/Data/Panel";
import { Badge, StatusBadge } from "@/shared/components/Data/Pills";
import DataTable, { type Column } from "@/shared/components/Data-Tables/DataTable";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Icon from "@/shared/icons/Icon";
import { Thumb } from "./WebsitePictures";
import WebsiteProjectModal from "./WebsiteProjectModal";
import { moved, STATUS_LABEL, TYPE_LABEL, useSetConveyor, useWebsiteProjects, type WebsiteProject, type WebsiteProjects } from "./websiteApi";

type Show = "all" | "published" | "drafts";

/**
 * The website's projects: the moving strip, then every project, published or not. A link opens a project's window
 * (?project={id}) or the new project's (?new=1, for those who manage the website), as Proton does.
 */
export default function WebsiteProjectsTab() {
    const query = useWebsiteProjects();
    const [params, setParams] = useSearchParams();
    const [picked, setPicked] = useState<WebsiteProject | "new" | null>(null);
    const [show, setShow] = useState<Show>("all");
    const [search, setSearch] = useState("");
    const data = query.data;
    const linked = params.get("new") === "1" ? (data?.canManage ? "new" as const : null)
        : data?.projects.find((p) => String(p.id) === params.get("project")) ?? null;
    const open = picked ?? linked;
    const setOpen = (next: WebsiteProject | "new" | null) => {
        setPicked(next);
        if (next == null && (params.has("new") || params.has("project"))) {
            params.delete("new");
            params.delete("project");
            setParams(params, { replace: true });
        }
    };

    if (!data) {
        return (
            <div className="panel"><div className="panel-body">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the website's projects" /> : <SkeletonLines lines={6} />}
            </div></div>
        );
    }

    const term = search.trim().toLowerCase();
    const rows = data.projects.filter((p) =>
        (show === "all" || (show === "published") === p.published)
        && (!term || [p.title, p.slug, p.city, p.country, p.client, p.linkedProject?.title].some((v) => v?.toLowerCase().includes(term))));

    const columns: Column<WebsiteProject>[] = [
        { key: "picture", header: "", width: 48, cell: (p) => <Thumb fileId={p.thumbnailFileId} alt="" /> },
        {
            key: "title", header: "Project", cell: (p) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{p.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                        /projects/{p.slug}{p.linkedProject && <> · follows {p.linkedProject.title}</>}
                    </div>
                </div>
            ),
        },
        { key: "type", header: "Type", cell: (p) => TYPE_LABEL[p.type] },
        { key: "status", header: "Status", cell: (p) => p.shownStatus ? <StatusBadge status={p.shownStatus === "completed" ? "completed" : "active"} label={STATUS_LABEL[p.shownStatus]} /> : <span className="muted">-</span> },
        { key: "year", header: "Year", cell: (p) => p.shownYear ?? <span className="muted">-</span>, nowrap: true },
        {
            key: "website", header: "On the website", cell: (p) => p.published
                ? <Badge icon="eye" className="badge-completed">Published{p.conveyorOrder != null && <> · strip #{p.conveyorOrder}</>}</Badge>
                : <Badge className={p.missingToPublish.length ? "badge-hold" : undefined}>Draft{p.missingToPublish.length > 0 && <> · {p.missingToPublish.length} to add</>}</Badge>,
        },
    ];

    return (
        <>
            <ConveyorPanel data={data} />
            <Panel className="mt" flush title="Projects" sub="Published projects show on the website's globe, its projects page and their own pages."
                tools={
                    <div className="row" style={{ gap: 8 }}>
                        <SearchInput value={search} onChange={setSearch} placeholder="Search projects" width={180} aria-label="Search projects" />
                        <Segmented value={show} onChange={setShow} aria-label="Show"
                            options={[{ value: "all", label: "All" }, { value: "published", label: "Published" }, { value: "drafts", label: "Drafts" }]} />
                        {data.canManage && <button className="btn btn-sm btn-primary" onClick={() => setOpen("new")}><Icon name="plus" />New project</button>}
                    </div>
                }>
                <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} what="the website's projects" onRowClick={setOpen}
                    empty={<Empty art="search" title={data.projects.length ? "No project matches" : "No projects on the website yet"}
                        text={data.projects.length ? "Try another search or filter." : data.canManage ? "Add the company's work, from scratch or from a system project." : undefined} />} />
            </Panel>
            {open != null && <WebsiteProjectModal project={open === "new" ? null : open} canManage={data.canManage} onClose={() => setOpen(null)} />}
        </>
    );
}

/** The website's moving strip: up to 20 published projects, in order; every change is saved straight away. */
function ConveyorPanel({ data }: { data: WebsiteProjects }) {
    const save = useSetConveyor();
    const strip = data.projects.filter((p) => p.conveyorOrder != null).sort((a, b) => a.conveyorOrder! - b.conveyorOrder!);
    const ids = strip.map((p) => p.id);
    const addable = data.projects.filter((p) => p.published && p.conveyorOrder == null);
    const full = strip.length >= data.conveyorLimit;
    const set = (next: number[]) => save.mutate(next);

    return (
        <Panel title="Moving strip" sub={`The projects that slide across the website's home page, in this order. At most ${data.conveyorLimit}; only published projects.`}
            tools={<span className="badge" aria-label="Projects in the strip">{strip.length} / {data.conveyorLimit}</span>}>
            {strip.length === 0 ? <div className="muted">No project is in the strip yet.</div> : (
                <ol aria-label="Moving strip" style={{ display: "grid", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                    {strip.map((p, index) => (
                        <li key={p.id} className="row" style={{ gap: 10 }}>
                            <span className="muted num" style={{ width: 20, textAlign: "right" }}>{index + 1}</span>
                            <Thumb fileId={p.thumbnailFileId} width={28} />
                            <span className="grow">{p.title}</span>
                            {data.canManage && (
                                <span className="row" style={{ gap: 4 }}>
                                    <button className="icon-btn" aria-label={`Move ${p.title} up`} disabled={index === 0 || save.isPending}
                                        onClick={() => set(moved(ids, p.id, -1))}><Icon name="arrowUp" /></button>
                                    <button className="icon-btn" aria-label={`Move ${p.title} down`} disabled={index === strip.length - 1 || save.isPending}
                                        onClick={() => set(moved(ids, p.id, 1))}><Icon name="arrowDown" /></button>
                                    <button className="btn btn-sm btn-quiet" disabled={save.isPending} onClick={() => set(ids.filter((id) => id !== p.id))}>Take out</button>
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            )}
            {data.canManage && (
                <div className="row mt-s" style={{ gap: 8 }}>
                    {full ? <span className="muted">The strip is full. Take one out to add another.</span>
                        : addable.length === 0 ? <span className="muted">Publish a project to add it to the strip.</span>
                            : <Select value="" aria-label="Add to the strip" searchable onChange={(v) => set([...ids, +v])}
                                options={[{ value: "", label: "Add a published project…", disabled: true }, ...addable.map((p) => ({ value: String(p.id), label: p.title }))]} />}
                    {save.error != null && <span className="err" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(save.error)}</span>}
                </div>
            )}
        </Panel>
    );
}
