import { useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@/api/errors";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { toast } from "@/shared/components/Feedback/toast";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import MediaLightbox from "@/shared/components/Overlays/MediaLightbox";
import Modal from "@/shared/components/Overlays/Modal";
import { useFileUrl } from "@/shared/files/useFileUrl";
import { fmtDayDate, fmtDayDateY, fmtDur, fmtRange, relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import EntryComments from "./EntryComments";
import { commentCount } from "./entryWords";
import { entryBody, uploadFile, useSaveEntry, type WorkEntry } from "./workApi";
import { clickable } from "@/shared/utils/clickable";


type EntryRowProps = {
    entry: WorkEntry;
    showProject?: boolean;
    showPerson?: boolean;
    showCreated?: boolean;
    /** A file can be attached to it after the fact. */
    canAttach?: boolean;
    onOpen?: (e: WorkEntry) => void;
    right?: ReactNode;
};

/** One work entry in a list: how long, when, what, and its file and comments (the prototype's UI.EntryRow). */
export default function EntryRow({ entry: e, showProject = true, showPerson, showCreated, canAttach, onOpen, right }: EntryRowProps) {
    const [viewing, setViewing] = useState(false);
    const [comments, setComments] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const save = useSaveEntry();
    const attachable = canAttach && e.canEdit && !e.attachment;

    async function onPick(f: File) {
        try {
            const file = await uploadFile(f);
            await save.mutateAsync({ id: e.id, body: entryBody(e, { attachmentFileId: file.id }) });
            toast({ text: "File attached", icon: "checkCircle" });
        } catch (err) {
            toast({ text: "The file wasn't attached", sub: errorMessage(err), icon: "alert" });
        }
    }

    // the hidden input comes before .entry, so .entry stays the last child of the list's last row
    return (
        <>
            {attachable && (
                <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (f) onPick(f);
                    ev.target.value = "";
                }} />
            )}
            <div className={cx("entry", onOpen && "click")} title={onOpen ? "Open this entry" : undefined} {...clickable(onOpen ? () => onOpen(e) : undefined, "button")}>
                <div className="entry-when">
                    <div className="entry-dur mono">{fmtDur(e.minutes)}</div>
                    <div className="entry-range mono">{fmtRange(e.startedAt, e.endedAt)}</div>
                </div>
                <div className="grow">
                    <div className="entry-desc">{e.description}</div>
                    <div className="entry-meta">
                        {showPerson && (
                            <span className="row" style={{ gap: 5 }}><PersonAvatar person={e.person} size={16} /><PersonName person={e.person} /></span>
                        )}
                        {showProject && (
                            <span className="row" style={{ gap: 5 }}><ProjectTile icon={e.project.icon} tint={e.project.tint} size="sm" />{e.project.title}</span>
                        )}
                        <span>{fmtDayDate(e.startedAt)}</span>
                        {showCreated && <span className="muted">logged {relTime(e.createdAt)}</span>}
                        {e.attachment && (
                            <span className="link" {...clickable((ev) => { ev.stopPropagation(); setViewing(true); }, "button")}>
                                <Icon name="file" style={{ width: 12, height: 12 }} />View file
                            </span>
                        )}
                        {attachable && (
                            <span className="link-quiet" role="button" tabIndex={0}
                                onClick={(ev) => { ev.stopPropagation(); fileRef.current?.click(); }}
                                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); fileRef.current?.click(); } }}>
                                <Icon name="attach" style={{ width: 12, height: 12 }} />{save.isPending ? "Attaching…" : "Attach file"}
                            </span>
                        )}
                        <span className={e.commentCount ? "link" : "link-quiet"} {...clickable((ev) => { ev.stopPropagation(); if (onOpen) onOpen(e); else setComments(true); }, "button")}>
                            <Icon name="chat" style={{ width: 12, height: 12 }} />{commentCount(e.commentCount)}
                        </span>
                    </div>
                </div>
                {right}
            </div>
            {viewing && e.attachment && <MediaLightbox file={e.attachment} onClose={() => setViewing(false)} />}
            {comments && <EntryCommentsModal entry={e} onClose={() => setComments(false)} />}
        </>
    );
}

/** An entry and its comments (the prototype's UI.EntryCommentsModal). */
export function EntryCommentsModal({ entry: e, onClose }: { entry: WorkEntry; onClose: () => void }) {
    const [viewing, setViewing] = useState(false);
    const { url } = useFileUrl(e.attachment && e.attachment.kind !== "video" ? e.attachment.id : null);
    return (
        <Modal title="Work entry" sub={`${e.person.name} · ${e.project.title}`} onClose={onClose}
            foot={<><div className="grow" /><button className="btn" onClick={onClose}>Close</button></>}>
            <div className="cm-entry">
                <div className="row" style={{ gap: 10 }}>
                    <PersonAvatar person={e.person} size={32} />
                    <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 650 }}><PersonName person={e.person} /></div>
                        <div className="muted mono" style={{ fontSize: 11 }}>{fmtDayDateY(e.startedAt)} · {fmtRange(e.startedAt, e.endedAt)} · {fmtDur(e.minutes)}</div>
                    </div>
                    <ProjectTile icon={e.project.icon} tint={e.project.tint} />
                </div>
                <p style={{ margin: "10px 0 0", fontSize: "13.5px" }}>{e.description}</p>
                {url && <img className="cm-thumb" src={url} alt={e.attachment!.name} title="View file" {...clickable(() => setViewing(true), "button")} />}
                {e.attachment?.kind === "video" && <span className="link" {...clickable(() => setViewing(true), "button")}><Icon name="file" />View file</span>}
            </div>
            <EntryComments entryId={e.id} author={e.person} domain="design" />
            {viewing && e.attachment && <MediaLightbox file={e.attachment} onClose={() => setViewing(false)} />}
        </Modal>
    );
}
