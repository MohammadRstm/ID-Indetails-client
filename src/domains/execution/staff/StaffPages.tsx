import { useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { PageHead } from "@/shared/components/Data/Panel";
import { ProjectTile } from "@/shared/components/Data/Bits";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { PROJECT_STATUS } from "@/shared/components/Data/status";
import { fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { clickable } from "@/shared/utils/clickable";
import { cx } from "@/shared/utils/cx";
import { personName, useDomainPeople } from "../../shared/people/peopleApi";
import type { Project } from "../../shared/projects/projectsApi";
import { useProjects } from "../../shared/projects/projectsApi";
import { SiteLogBrowser, WriteSiteLog } from "./SiteLogs";
import { useMySites, useSetSiteStaff } from "./siteLogsApi";

/** Pick the Execution employees who oversee a site: each one a chip, on or off. */
export function StaffPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
    const people = useDomainPeople("execution", true, { role: "employee", status: "active" });
    if (!people.data) return <SkeletonLines lines={1} />;
    if (people.data.length === 0) return <div className="muted">No active Execution employee yet: invite one first.</div>;
    return (
        <div className="chips" role="group" aria-label="Site staff">
            {people.data.map((p) => {
                const on = value.includes(p.id);
                return (
                    <button key={p.id} type="button" className={cx("chip", on && "on")} aria-pressed={on}
                        onClick={() => onChange(on ? value.filter((id) => id !== p.id) : [...value, p.id])}>
                        {on && <Icon name="check" style={{ width: 12, height: 12 }} />}{personName(p)}
                    </button>
                );
            })}
        </div>
    );
}

/** A site staff member's home: what happened on site today, written as logs, and every log they wrote before. */
export function DailyLogPage() {
    const sites = useMySites();
    const open = (sites.data ?? []).filter((s) => s.status === "active" || s.status === "hold");
    const options = open.map((s) => ({ value: String(s.id), label: s.title }));

    return (
        <div className="page">
            <PageHead title="Daily log" sub="What happened on your sites: deliveries, shortages, delays. Write a log as it happens; each one is kept on its own." />
            {loadFailed(sites) ? <LoadError error={sites.error} retry={() => sites.refetch()} what="your sites" />
                : !sites.data ? <SkeletonLines lines={4} />
                    : options.length === 0 ? <Empty art="search" title="You oversee no open site" text="An admin puts you on a site when it starts." />
                        : <WriteSiteLog sites={options} />}
            <SiteLogBrowser mine title="Your logs" sites={(sites.data ?? []).map((s) => ({ value: String(s.id), label: s.title }))} />
        </div>
    );
}

/** The sites a staff member oversees, newest first: each opens its page, where its weekly labour is reported. */
export function MySitesPage() {
    const sites = useMySites();
    const navigate = useNavigate();

    return (
        <div className="page">
            <PageHead title="My sites" sub="The sites you oversee. Open one to report its weekly ground labour." />
            {loadFailed(sites) ? <LoadError error={sites.error} retry={() => sites.refetch()} what="your sites" />
                : !sites.data ? <SkeletonLines lines={4} />
                    : sites.data.length === 0 ? <Empty art="search" title="You oversee no site yet" text="An admin puts you on a site when it starts." />
                        : (
                            <div className="grid g-3" role="list" aria-label="My sites">
                                {sites.data.map((s) => (
                                    <div key={s.id} role="listitem">
                                        <div className="panel click" {...clickable(() => navigate(`/execution/projects/${s.id}`), "link")}>
                                            <div className="panel-body">
                                                <div className="row" style={{ gap: 10 }}>
                                                    <ProjectTile />
                                                    <div className="grow" style={{ minWidth: 0 }}>
                                                        <div className="trunc" style={{ fontWeight: 650 }}>{s.title}</div>
                                                        <div className="muted trunc" style={{ fontSize: 12 }}>{[s.clientName, s.location].filter(Boolean).join(" · ") || "-"}</div>
                                                    </div>
                                                </div>
                                                <div className="row spread mt" style={{ fontSize: 12 }}>
                                                    <span className="badge">{PROJECT_STATUS[s.status].label}</span>
                                                    <span className="muted">since {fmtDateY(s.assignedAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
        </div>
    );
}

/** Every site's daily logs, for Execution admins: by person, site, days and words. */
export function SiteLogsPage() {
    const people = useDomainPeople("execution", true, { role: "employee" });
    const projects = useProjects({ domain: "execution", pageSize: 100 });

    return (
        <div className="page">
            <PageHead title="Daily logs" sub="What site staff noted on their sites, newest first. Losses are worked out from these later." />
            <SiteLogBrowser mine={false} title="All logs"
                people={(people.data ?? []).map((p) => ({ value: String(p.id), label: personName(p) }))}
                sites={(projects.data?.items ?? []).map((p) => ({ value: String(p.id), label: p.title }))} />
        </div>
    );
}

/** A site's staff and its daily logs, on its Overview: admins change who oversees it, staff write its logs. */
export function SiteStaffPanels({ project }: { project: Project }) {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const [changing, setChanging] = useState(false);
    const staff = project.staff ?? [];
    const onTeam = staff.some((s) => s.id === me.id);
    const open = project.status === "active" || project.status === "hold";
    const readsAll = permissions.has(P.SITE_LOG_VIEW_ALL);

    return (
        <>
            <div className="panel mt" aria-label="Site staff">
                <div className="panel-head">
                    <div className="grow">
                        <div className="panel-title">Site staff</div>
                        <div className="panel-sub">Who oversees this site: they report its ground labour and write its daily logs.</div>
                    </div>
                    {permissions.has(P.PROJECT_EDIT) && <div className="panel-tools"><button className="btn btn-sm" onClick={() => setChanging(true)}><Icon name="edit" />Change</button></div>}
                </div>
                <div className="panel-body">
                    {staff.length === 0 ? <div className="muted">Nobody yet.</div> : (
                        <div className="chips">{staff.map((s) => <span key={s.id} className="chip">{s.name}</span>)}</div>
                    )}
                </div>
            </div>
            {onTeam && open && permissions.has(P.SITE_LOG_CREATE) && <div className="mt"><WriteSiteLog sites={[]} fixedSiteId={project.id} /></div>}
            {(readsAll || onTeam) && <SiteLogBrowser mine={!readsAll} projectId={project.id} title="Daily logs" />}
            {changing && <SiteStaffModal project={project} onClose={() => setChanging(false)} />}
        </>
    );
}

function SiteStaffModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const save = useSetSiteStaff(project.id);
    const [chosen, setChosen] = useState<number[]>((project.staff ?? []).map((s) => s.id));
    const [tried, setTried] = useState(false);
    const error = chosen.length === 0 && "Choose at least one staff member to oversee the site.";

    return (
        <Modal title="Site staff" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{save.error != null && <span className="err"><Icon name="alert" />{errorMessage(save.error)}</span>}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={() => {
                        setTried(true);
                        if (error) return;
                        save.mutate(chosen, { onSuccess: () => { toast({ text: "Site staff saved", sub: project.title, icon: "checkCircle" }); onClose(); } });
                    }}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="field">
                <label className="label required">Who oversees the site</label>
                <StaffPicker value={chosen} onChange={setChosen} />
                <FieldError message={tried && error ? error : undefined} />
                <div className="hint">Someone taken off keeps the logs and labour they recorded, but records nothing new here.</div>
            </div>
        </Modal>
    );
}
