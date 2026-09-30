import { useNavigate } from "react-router";
import { AREAS } from "@/app/routing/areas";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import { relTime } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import GroupTile from "./GroupTile";
import { firstName, snippet } from "./messageText";
import { chatQuery, useConversations, type Conversation } from "./messagesApi";
import { loadFailed } from "@/api/queryState";
import { clickable } from "@/shared/utils/clickable";

/** The chat icon's panel (the prototype's P.MessagesDropdown): the chats with the newest messages. */
export default function MessagesDropdown({ messagesPath, close }: { messagesPath: string; close: () => void }) {
    const navigate = useNavigate();
    const conversations = useConversations();
    const list = (conversations.data ?? []).filter((c) => c.lastMessage)
        .sort((a, b) => b.lastMessage!.createdAt.localeCompare(a.lastMessage!.createdAt)).slice(0, 9);
    const open = (c: Conversation) => { close(); navigate(`${messagesPath}?${chatQuery(c)}`); };

    return (
        <div style={{ width: 356, maxWidth: "80vw" }}>
            <div className="pop-head"><div className="grow"><b>Messages</b></div></div>
            <div className="notif-list">
                {loadFailed(conversations) ? <div style={{ padding: 10 }}><LoadError error={conversations.error} retry={() => conversations.refetch()} what="your messages" /></div>
                    : !conversations.data ? <div style={{ padding: 10 }}><SkeletonLines lines={4} /></div>
                        : list.length === 0 ? <Empty art="done" title="No conversations yet" />
                            : list.map((c) => {
                                const last = c.lastMessage!;
                                return (
                                    <div key={chatQuery(c)} className={cx("notif", c.unread > 0 && "unread")} {...clickable(() => open(c), "button")}>
                                        {c.person ? <Avatar person={{ name: c.person.name, photoFileId: c.person.photoFileId }} size={28} /> : <GroupTile domain={c.team?.domain ?? ""} />}
                                        <div className="grow" style={{ minWidth: 0 }}>
                                            <div className="notif-txt trunc">
                                                {c.person ? c.person.name : `${c.team?.name} · ${AREAS[c.team?.domain as "design"]?.label ?? ""}`}
                                                {c.unreadMention && <> <span className="msg-mention-flag">@</span></>}
                                            </div>
                                            <div className="muted trunc" style={{ fontSize: "11.5px" }}>{c.type === "group" ? `${firstName(last.sender.name)}: ` : ""}{snippet(last)}</div>
                                            <div className="notif-meta">{relTime(last.createdAt)}</div>
                                        </div>
                                        {c.unread > 0 && <span className="dot dot-on" style={{ marginTop: 6 }} aria-label="Unread" />}
                                    </div>
                                );
                            })}
            </div>
            <div className="pop-foot">
                <button className="btn btn-sm btn-block btn-quiet" onClick={() => { close(); navigate(messagesPath); }}>Open Messages</button>
            </div>
        </div>
    );
}
