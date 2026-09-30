import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import Columns from "@/shared/components/Charts/Columns";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import { Drawer } from "@/shared/components/Overlays/Modal";
import { fmtDate, fmtDateY, fmtH } from "@/shared/format/time";
import EntryRow from "../work/EntryRow";
import { useContributor, useEmployeeTeam } from "./projectWorkApi";

export type WorkRange = { label: string; from?: string; to?: string };

type DrawerProps = {
    projectId: number;
    projectTitle: string;
    personId: number;
    range: WorkRange;
    workQ: string;
    onOpenEntry: (id: number) => void;
    onClose: () => void;
};

/** One person's contribution to a project, in the chosen range (the prototype's ContributorDrawer). */
export default function ContributorDrawer({ projectId, projectTitle, personId, range, workQ, onOpenEntry, onClose }: DrawerProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const query = useContributor(projectId, personId, { from: range.from, to: range.to, search: workQ.trim() || undefined });
    const position = useEmployeeTeam(personId, permissions.has(P.EMPLOYEE_VIEW)).data?.position;
    const c = query.data;
    const person = c?.person ?? { id: personId, name: "" };

    return (
        <Drawer onClose={onClose}
            head={
                <div className="row" style={{ gap: 11 }}>
                    <PersonAvatar person={person} size={40} />
                    <div>
                        <div className="modal-title">{c ? <PersonName person={person} /> : "…"}</div>
                        <div className="modal-sub">{position ? `${position} · ` : ""}contribution to {projectTitle}</div>
                    </div>
                </div>
            }
            foot={
                <>
                    <div className="grow muted">{range.label}</div>
                    {permissions.has(P.EMPLOYEE_VIEW) && (
                        <button className="btn btn-sm" onClick={() => { onClose(); navigate(`/design/people/${personId}`); }}>Open full profile</button>
                    )}
                </>
            }>
            {query.isError ? <LoadError error={query.error} retry={() => query.refetch()} what="their work here" /> : (
                <>
                    <div style={{ borderRadius: "var(--r2)", overflow: "hidden" }}>
                        <KpiStrip loading={!c} items={[
                            {
                                key: "hours", label: "Hours on project", value: fmtH(c?.minutes ?? 0),
                                sub: <span>{fmtH((c?.minutes ?? 0) - (c?.overtimeMinutes ?? 0))} normal · <span className={c?.overtimeMinutes ? "ot-text" : ""}>{fmtH(c?.overtimeMinutes ?? 0)} overtime</span></span>,
                            },
                            { key: "entries", label: "Entries", value: c?.entries ?? 0 },
                            { key: "share", label: "Share", value: `${c?.sharePct ?? 0}%` },
                        ]} />
                    </div>
                    <div className="mt">
                        <div className="u" style={{ marginBottom: 6 }}>Hours per week on this project</div>
                        {!c ? <SkeletonLines lines={4} /> : (
                            <Columns height={130} labelEvery={3} format={(v) => `${Math.round(v)}h`}
                                data={c.weekly.map((w) => ({ label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)}`, value: w.minutes / 60 }))} />
                        )}
                    </div>
                    <div className="mt">
                        <div className="spread">
                            <div className="u">Work entries</div>
                            <div className="muted" style={{ fontSize: "11.5px" }}>{c ? `${c.entries} entries` : ""}</div>
                        </div>
                        <div style={{ marginTop: 4 }}>
                            {!c ? <SkeletonLines lines={5} /> : c.recentEntries.map((e) => (
                                <EntryRow key={e.id} entry={e} showProject={false} showCreated onOpen={() => onOpenEntry(e.id)} />
                            ))}
                        </div>
                    </div>
                </>
            )}
        </Drawer>
    );
}
