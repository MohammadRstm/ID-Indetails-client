import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@/api/errors";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { ProjectTile } from "@/shared/components/Data/Bits";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import MediaLightbox from "@/shared/components/Overlays/MediaLightbox";
import Modal from "@/shared/components/Overlays/Modal";
import { useFileUrl } from "@/shared/files/useFileUrl";
import { fmtDayDate, fmtDayDateY, fmtDur, fmtRange, relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { entryBody, uploadFile, useSaveEntry, type WorkEntry } from "./workApi";

type Comment = Schemas["WorkEntryCommentResponse"];

const commentCount = (n: number) => `${n} comment${n === 1 ? "" : "s"}`;

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
            <div className={cx("entry", onOpen && "click")} title={onOpen ? "Open this entry" : undefined} onClick={onOpen ? () => onOpen(e) : undefined}>
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
                            <span className="link" onClick={(ev) => { ev.stopPropagation(); setViewing(true); }}>
                                <Icon name="file" style={{ width: 12, height: 12 }} />View file
                            </span>
                        )}
                        {attachable && (
                            <span className="link-quiet" onClick={(ev) => { ev.stopPropagation(); fileRef.current?.click(); }}>
                                <Icon name="attach" style={{ width: 12, height: 12 }} />{save.isPending ? "Attaching…" : "Attach file"}
                            </span>
                        )}
                        <span className={e.commentCount ? "link" : "link-quiet"} onClick={(ev) => { ev.stopPropagation(); if (onOpen) onOpen(e); else setComments(true); }}>
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
                {url && <img className="cm-thumb" src={url} alt={e.attachment!.name} title="View file" onClick={() => setViewing(true)} />}
                {e.attachment?.kind === "video" && <span className="link" onClick={() => setViewing(true)}><Icon name="file" />View file</span>}
            </div>
            <EntryComments entryId={e.id} />
            {viewing && e.attachment && <MediaLightbox file={e.attachment} onClose={() => setViewing(false)} />}
        </Modal>
    );
}

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin" };

/** The comment thread on an entry. */
function EntryComments({ entryId }: { entryId: number }) {
    const query = useQuery({
        queryKey: ["work", "comments", entryId],
        queryFn: async () => (await http.get<Comment[]>(`/work-entries/${entryId}/comments`)).data,
    });
    const list = query.data ?? [];
    return (
        <div className="cm">
            <div className="cm-title">{query.data ? commentCount(list.length) : "Comments"}</div>
            {query.isError ? <LoadError error={query.error} retry={() => query.refetch()} what="the comments" />
                : !query.data ? <SkeletonLines lines={2} />
                    : list.length ? list.map((c) => (
                        <div key={c.id} className="cm-item">
                            <PersonAvatar person={c.author} size={30} />
                            <div className="grow" style={{ minWidth: 0 }}>
                                <div className="cm-meta">
                                    <b><PersonName person={c.author} /></b>
                                    {ROLE_LABEL[c.author.role] && <span className="badge badge-new">{ROLE_LABEL[c.author.role]}</span>}
                                    <span className="muted">{relTime(c.createdAt)}</span>
                                </div>
                                <div className="cm-text">{c.body}</div>
                                {c.sentToGroup && <div className="cm-sent"><Icon name="chat" />Sent to the team group chat · @all</div>}
                            </div>
                        </div>
                    )) : <div className="muted" style={{ fontSize: "12.5px", padding: "6px 0" }}>No comments on this entry yet.</div>}
        </div>
    );
}
