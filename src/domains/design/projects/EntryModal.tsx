import { useState } from "react";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import DayRuler from "@/shared/components/Charts/DayRuler";
import { ProjectTile } from "@/shared/components/Data/Bits";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import MediaLightbox from "@/shared/components/Overlays/MediaLightbox";
import Modal from "@/shared/components/Overlays/Modal";
import { fmtDayDateY, fmtDur, fmtRange, relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import EntryComments from "../work/EntryComments";
import { useEmployeeTeam, useEntryDetail } from "./projectWorkApi";

type EntryModalProps = {
    entryId: number;
    onClose: () => void;
    /** Opened over a drawer: the backdrop sits above it. */
    overDrawer?: boolean;
};

/** One work entry, with the person's other work that day and the comments (the prototype's EntryModal). */
export default function EntryModal({ entryId, onClose, overDrawer }: EntryModalProps) {
    const permissions = usePermissions();
    const detail = useEntryDetail(entryId);
    const [viewing, setViewing] = useState(false);
    const d = detail.data;
    const e = d?.entry;
    const position = useEmployeeTeam(e?.person.id ?? 0, !!e && permissions.has(P.EMPLOYEE_VIEW)).data?.position;

    return (
        <Modal title="Work entry" scrimClass={overDrawer ? "scrim-over-drawer" : undefined} onClose={onClose}
            foot={
                <>
                    <div className="grow muted">{e ? `Logged ${relTime(e.createdAt)} · entry ${e.id}` : ""}</div>
                    {e?.attachment && <button className="btn" onClick={() => setViewing(true)}><Icon name="file" />View file</button>}
                    <button className="btn" onClick={onClose}>Close</button>
                </>
            }>
            {detail.isError ? <LoadError error={detail.error} retry={() => detail.refetch()} what="the entry" />
                : !d || !e ? <SkeletonLines lines={6} /> : (
                    <>
                        <div className="row" style={{ gap: 11, marginBottom: 12 }}>
                            <PersonAvatar person={e.person} size={36} />
                            <div className="grow">
                                <div style={{ fontWeight: 650 }}><PersonName person={e.person} /></div>
                                {position && <div className="muted" style={{ fontSize: "11.5px" }}>{position}</div>}
                            </div>
                            <ProjectTile icon={e.project.icon} tint={e.project.tint} />
                        </div>
                        <div className="panel" style={{ background: "var(--surface-2)" }}>
                            <div className="panel-body">
                                <div className="row wrap" style={{ gap: 18 }}>
                                    <div><div className="u">Date</div><div style={{ fontWeight: 600 }}>{fmtDayDateY(e.startedAt)}</div></div>
                                    <div><div className="u">Time</div><div className="mono" style={{ fontWeight: 600 }}>{fmtRange(e.startedAt, e.endedAt)}</div></div>
                                    <div><div className="u">Duration</div><div className="mono" style={{ fontWeight: 600 }}>{fmtDur(e.minutes)}</div></div>
                                </div>
                                <div className="mt">
                                    <DayRuler large blocks={[{ start: e.startedAt, end: e.endedAt }]}
                                        others={d.sameDay.filter((x) => x.id !== e.id).map((x) => ({ start: x.startedAt, end: x.endedAt, label: x.description }))} />
                                </div>
                            </div>
                        </div>
                        <div className="mt">
                            <div className="u">Work description</div>
                            <p style={{ marginTop: 4, fontSize: "13.5px" }}>{e.description}</p>
                        </div>
                        <EntryComments entryId={e.id} author={e.person} domain="design" />
                    </>
                )}
            {viewing && e?.attachment && <MediaLightbox file={e.attachment} onClose={() => setViewing(false)} />}
        </Modal>
    );
}
