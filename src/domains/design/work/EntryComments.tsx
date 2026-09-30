import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { fullName, useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Avatar from "@/shared/components/Identity/Avatar";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import { relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useAddComment, useEmployeeTeam } from "../projects/projectWorkApi";
import { commentCount } from "./entryWords";
import { loadFailed } from "@/api/queryState";

type Comment = Schemas["WorkEntryCommentResponse"];

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin" };

/**
 * The comment thread on an entry and, with work_entry:comment, the box to add one (the prototype's
 * UI.EntryComments). The entry's author is notified; their team chat too when asked.
 */
export default function EntryComments({ entryId, author, domain }: { entryId: number; author: { id: number; name: string }; domain: string }) {
    const permissions = usePermissions();
    const canComment = permissions.has(P.WORK_ENTRY_COMMENT);
    const query = useQuery({
        queryKey: ["work", "comments", entryId],
        queryFn: async () => (await http.get<Comment[]>(`/work-entries/${entryId}/comments`)).data,
    });
    const list = query.data ?? [];
    return (
        <div className="cm">
            <div className="cm-title">{query.data ? commentCount(list.length) : "Comments"}</div>
            {canComment && <Compose entryId={entryId} author={author} domain={domain} canSeeTeam={permissions.has(P.EMPLOYEE_VIEW)} />}
            {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the comments" />
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

function Compose({ entryId, author, domain, canSeeTeam }: { entryId: number; author: { id: number; name: string }; domain: string; canSeeTeam: boolean }) {
    const me = useCurrentUser();
    const add = useAddComment(entryId);
    const who = useEmployeeTeam(author.id, canSeeTeam).data;
    // a comment can go to the author's team chat when they are in a team of the entry's domain
    const team = who?.team && who.domain === domain ? who.team : null;
    const [text, setText] = useState("");
    const [send, setSend] = useState(false);

    function submit() {
        if (!text.trim()) return;
        add.mutate({ body: text, sendToGroup: send && !!team }, {
            onSuccess: (c) => {
                toast({
                    text: "Comment added", icon: "checkCircle",
                    sub: `${author.name.split(" ")[0]} has been notified${c.sentToGroup && team ? ` · posted to the ${team.name} group chat` : ""}`,
                });
                setText("");
                setSend(false);
            },
        });
    }

    return (
        <div className="cm-compose">
            <Avatar person={{ name: fullName(me), photoFileId: me.photoFileId }} size={30} />
            <div className="grow">
                <textarea className="textarea cm-input" rows={2} placeholder="Add a comment…" aria-label="Add a comment" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="cm-actions">
                    {team && (
                        <label className="cm-check">
                            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
                            <span>Also send to the <b>{team.name}</b> group chat <span className="msg-mention">@all</span></span>
                        </label>
                    )}
                    <span className="grow">{add.error ? <span className="err"><Icon name="alert" />{errorMessage(add.error)}</span> : null}</span>
                    <button className="btn btn-sm btn-quiet" disabled={!text} onClick={() => { setText(""); setSend(false); }}>Cancel</button>
                    <button className="btn btn-sm btn-primary" disabled={!text.trim() || add.isPending} onClick={submit}>Comment</button>
                </div>
            </div>
        </div>
    );
}
