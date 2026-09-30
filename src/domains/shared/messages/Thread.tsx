import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { canOpen } from "@/app/routing/routeTable";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import { PersonName } from "@/shared/components/Identity/People";
import MediaLightbox from "@/shared/components/Overlays/MediaLightbox";
import { useFileUrl } from "@/shared/files/useFileUrl";
import { dayKey, fmtDayDate, fmtDayDateY, fmtRange, fmtTime, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import Composer from "./Composer";
import GroupTile from "./GroupTile";
import { mentionParts, startsRun } from "./messageText";
import { chatKey, useMarkChatRead, usePresence, useSendMessage, useTeamMembers, useThread, type Chat, type Contact, type Message } from "./messagesApi";

type File = Message["attachments"][number];

const ROLE: Record<string, string> = { super_admin: "Super admin", admin: "Admin", employee: "Employee" };

function Media({ file, className, onOpen }: { file: File; className?: string; onOpen?: () => void }) {
    const { url } = useFileUrl(file.id);
    if (!url) return <div className={cx("msg-att", className)} style={{ width: 180, height: 120, background: "var(--surface-3)" }} />;
    return file.kind === "video" || file.mimeType.startsWith("video/")
        ? <video className="msg-att" src={url} controls />
        : <img className={cx("msg-att", className)} src={url} alt={file.name} title={file.name} onClick={onOpen} />;
}

/** An admin's comment on someone's work, shared to their team (the prototype's TaskCommentCard). */
function TaskCard({ m, mine }: { m: Message; mine: boolean }) {
    const [viewing, setViewing] = useState(false);
    const t = m.taskComment;
    if (!t) return null;
    const end = new Date(new Date(t.startedAt).getTime() + t.minutes * 60_000).toISOString();
    return (
        <div className={cx("msg-bubble task-card", mine && "mine")}>
            <div className="tc-head">
                <span className="msg-mention">@all</span>
                <span className="tc-label"><Icon name="chat" />Task comment</span>
                <span className="grow" />
                <span className="tc-proj trunc">{t.projectTitle}</span>
            </div>
            <div className="tc-emp">
                <Avatar person={{ name: t.author.name, photoFileId: t.author.photoFileId }} size={22} />
                <div style={{ minWidth: 0 }}>
                    <b><PersonName person={{ id: t.author.id, name: t.author.name, domain: "design" }} /></b>
                    <div className="muted mono" style={{ fontSize: "10.5px" }}>{fmtDayDate(t.startedAt)} · {fmtRange(t.startedAt, end)}</div>
                </div>
            </div>
            {t.attachment && <Media file={t.attachment} className="tc-att" onOpen={() => setViewing(true)} />}
            <div className="tc-task"><span className="u">Task</span>{t.description}</div>
            {m.body && <div className="tc-quote">{m.body}</div>}
            <div className="tc-by">
                <Avatar person={{ name: m.sender.name, photoFileId: m.sender.photoFileId }} size={16} />
                <span>- {m.sender.name}</span>
                <span className="grow" />
                <span className="msg-time mono" style={{ marginTop: 0 }}>{fmtTime(m.createdAt)}</span>
            </div>
            {viewing && t.attachment && <MediaLightbox file={t.attachment} onClose={() => setViewing(false)} />}
        </div>
    );
}

function Body({ m, mine, showName, names }: { m: Message; mine: boolean; showName: boolean; names: string[] }) {
    if (m.kind === "task_comment") return <TaskCard m={m} mine={mine} />;
    return (
        <div className={cx("msg-bubble", mine && "mine")}>
            {showName && <div className="msg-sender"><PersonName person={{ id: m.sender.id, name: m.sender.name }} /></div>}
            {m.body && (
                <div className="msg-text">
                    {mentionParts(m.body, names).map((p, i) => (p.mention ? <span key={i} className="msg-mention">{p.text}</span> : p.text))}
                </div>
            )}
            {m.attachments.map((a) => <Media key={a.id} file={a} />)}
            <div className="msg-time mono">{fmtTime(m.createdAt)}</div>
        </div>
    );
}

type ThreadProps = { chat: Chat; person: Contact | null; team: { id: number; name: string; domain: string } | null; meId: number };

/**
 * One chat (the prototype's thread): who it is with, the messages by day, and the composer. Opening it, and
 * each new message while it is open, marks it read.
 */
export default function Thread({ chat, person, team, meId }: ThreadProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const thread = useThread(chat);
    const members = useTeamMembers(chat.kind === "group" ? chat.teamId : null);
    const presence = usePresence();
    const send = useSendMessage(chat);
    const markRead = useMarkChatRead();
    const listRef = useRef<HTMLDivElement>(null);
    const messages = [...(thread.data?.pages ?? [])].reverse().flatMap((p) => p.items);
    const newest = messages[messages.length - 1]?.id ?? 0;
    const names = (members.data ?? []).map((p) => p.name);
    const markChat = markRead.mutate;
    const key = chatKey(chat);
    const loaded = !!thread.data;
    const kind = chat.kind, id = chat.kind === "group" ? chat.teamId : chat.userId;

    // read up to the newest message, whenever a new one arrives
    useEffect(() => {
        if (loaded) markChat(kind === "group" ? { kind, teamId: id } : { kind, userId: id });
    }, [kind, id, newest, loaded, markChat]);

    // the newest at the bottom, in view
    useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [key, newest]);

    const days: { key: string; items: Message[] }[] = [];
    for (const m of messages) {
        const k = dayKey(m.createdAt);
        const last = days[days.length - 1];
        if (last?.key === k) last.items.push(m);
        else days.push({ key: k, items: [m] });
    }

    const profile = person?.domain && canOpen(permissions, person.domain as "design", `people/${person.id}`) ? `/${person.domain}/people/${person.id}` : null;
    const who = person ? { name: person.name, photoFileId: person.photoFileId, online: presence.data?.has(person.id) ?? false } : null;

    return (
        <>
            <div className="msg-thread-head">
                {person && who ? (
                    <div className={profile ? "msg-thread-person" : undefined} onClick={profile ? () => navigate(profile) : undefined} title={profile ? "View profile" : undefined}>
                        <div className="row" style={{ gap: 10 }}>
                            <Avatar person={who} size={32} presence />
                            <div style={{ minWidth: 0 }}>
                                <div className="trunc" style={{ fontWeight: 650 }}>{person.name}</div>
                                <div className="muted trunc" style={{ fontSize: "11.5px" }}>{person.position ?? ROLE[person.role] ?? ""}</div>
                            </div>
                        </div>
                    </div>
                ) : team ? (
                    <div className="row" style={{ gap: 10 }}>
                        <GroupTile domain={team.domain} />
                        <div>
                            <div style={{ fontWeight: 650 }}>{team.name}</div>
                            <div className="muted" style={{ fontSize: "11.5px" }}>
                                {members.data ? `${members.data.length} member${members.data.length === 1 ? "" : "s"} · ` : ""}{AREAS[team.domain as "design"]?.label}
                            </div>
                        </div>
                    </div>
                ) : null}
                <div className="grow" />
            </div>
            <div className="msg-list" ref={listRef}>
                {thread.isError ? <div className="mt"><LoadError error={thread.error} retry={() => thread.refetch()} what="the messages" /></div>
                    : !thread.data ? <div className="mt"><SkeletonLines lines={6} /></div> : (
                        <>
                            {thread.hasNextPage && (
                                <div style={{ textAlign: "center", padding: "6px 0" }}>
                                    <button className="btn btn-sm btn-quiet" disabled={thread.isFetchingNextPage} onClick={() => thread.fetchNextPage()}>
                                        {thread.isFetchingNextPage ? "Loading…" : "Show older messages"}
                                    </button>
                                </div>
                            )}
                            {messages.length === 0 && <Empty art="done" title="No messages yet" text="Say hello." />}
                            {days.map((day) => (
                                <div key={day.key} className="day-group">
                                    <div className="day-head"><h4>{relDay(day.key)}</h4><span className="muted" style={{ fontSize: 11 }}>{fmtDayDateY(day.key)}</span></div>
                                    {day.items.map((m, i) => {
                                        const mine = m.sender.id === meId;
                                        const first = startsRun(m, day.items[i - 1]);
                                        if (chat.kind === "group" && !mine) {
                                            return (
                                                <div key={m.id} className={cx("msg-row", first && "first")}>
                                                    <div className="msg-av">{first && <Avatar person={{ name: m.sender.name, photoFileId: m.sender.photoFileId }} size={30} />}</div>
                                                    <Body m={m} mine={false} showName={first} names={names} />
                                                </div>
                                            );
                                        }
                                        return <Body key={m.id} m={m} mine={mine} showName={false} names={names} />;
                                    })}
                                </div>
                            ))}
                        </>
                    )}
            </div>
            <Composer key={key} members={chat.kind === "group" ? members.data ?? [] : null} meId={meId} sending={send.isPending} error={send.error}
                onSend={(body) => send.mutateAsync(body)} />
        </>
    );
}
