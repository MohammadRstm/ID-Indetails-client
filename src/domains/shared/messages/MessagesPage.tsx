import { useState } from "react";
import { useSearchParams } from "react-router";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { useCurrentUser } from "@/app/session/useSession";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import GroupTile from "./GroupTile";
import Thread from "./Thread";
import { chatKey, chatOf, useContacts, useConversations, usePresence, type Chat, type Conversation } from "./messagesApi";

// direct messages are listed by who people are: super admins, then admins, then employees
const LEVELS = [{ role: "super_admin", label: "Super admins" }, { role: "admin", label: "Admins" }, { role: "employee", label: "Employees" }];
const areaLabel = (d: string | null | undefined) => (d ? AREAS[d as "design"]?.label ?? "" : "");

/** The chat asked for in the address (?group=4, ?with=12), or none. */
function chatFrom(params: URLSearchParams): Chat | null {
    const group = Number(params.get("group")), person = Number(params.get("with"));
    if (Number.isInteger(group) && group > 0) return { kind: "group", teamId: group };
    if (Number.isInteger(person) && person > 0) return { kind: "dm", userId: person };
    return null;
}

/**
 * Team chats and direct messages (the prototype's P.Messages): the chats down the side, the one open beside
 * them. Who talks to whom follows the API: a team's chat has its people, their business's admins and the
 * super admins; anyone messages their own business and the super admins.
 */
export default function MessagesPage() {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState("");
    const conversations = useConversations();
    const contacts = useContacts();
    const presence = usePresence();
    const list = conversations.data ?? [];
    const recent = list.filter((c) => c.lastMessage).sort((a, b) => b.lastMessage!.createdAt.localeCompare(a.lastMessage!.createdAt));
    const asked = chatFrom(params);
    const chat = asked ?? (recent[0] ? chatOf(recent[0]) : null);
    const byChat = new Map(list.flatMap((c) => { const k = chatOf(c); return k ? [[chatKey(k), c] as const] : []; }));
    const open = chat ? byChat.get(chatKey(chat)) : undefined;
    const q = search.trim().toLowerCase();
    const super_ = permissions.isSuperAdmin;

    const groups = list.filter((c) => c.type === "group" && c.team && (!q || `${c.team.name} ${areaLabel(c.team.domain)}`.toLowerCase().includes(q)))
        .sort((a, b) => a.team!.domain.localeCompare(b.team!.domain) || a.team!.name.localeCompare(b.team!.name));
    const people = (contacts.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
    const select = (next: Chat) => setParams(next.kind === "group" ? { group: String(next.teamId) } : { with: String(next.userId) });
    const person = chat?.kind === "dm" ? (contacts.data ?? []).find((c) => c.id === chat.userId) ?? open?.person ?? null : null;
    const team = chat?.kind === "group" ? open?.team ?? null : null;

    const count = (c: Conversation | undefined) => (c && c.unread > 0 ? <span className={cx("msg-count", c.unreadMention && "mention")}>{c.unreadMention ? "@" : c.unread}</span> : null);

    return (
        <div className="msg-full-page">
            <div className="msg-page">
                <div className="msg-sidebar">
                    <div className="search" style={{ margin: "0 0 10px" }}>
                        <Icon name="search" />
                        <input className="input" placeholder="Find people or groups" aria-label="Find people or groups" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    {conversations.isError ? <LoadError error={conversations.error} retry={() => conversations.refetch()} what="your chats" />
                        : !conversations.data || !contacts.data ? <SkeletonLines lines={8} /> : (
                            <>
                                {groups.length > 0 && <div className="msg-sec-label">Groups</div>}
                                {groups.map((c) => {
                                    const k: Chat = { kind: "group", teamId: c.team!.id };
                                    return (
                                        <div key={chatKey(k)} className={cx("msg-contact-row", chat && chatKey(chat) === chatKey(k) && "on")} role="button" tabIndex={0}
                                            onClick={() => select(k)} onKeyDown={(e) => { if (e.key === "Enter") select(k); }}>
                                            <GroupTile domain={c.team!.domain} size="sm" />
                                            <div className="grow" style={{ minWidth: 0 }}>
                                                <div className="trunc" style={{ fontWeight: 600 }}>{c.team!.name}</div>
                                                {super_ && <div className="muted trunc" style={{ fontSize: 11 }}>{areaLabel(c.team!.domain)}</div>}
                                            </div>
                                            {count(c)}
                                        </div>
                                    );
                                })}
                                <div className="msg-sec-label">Direct messages</div>
                                {LEVELS.map((lv) => {
                                    const rows = people.filter((p) => p.role === lv.role).sort((a, b) => a.name.localeCompare(b.name));
                                    if (!rows.length) return null;
                                    return (
                                        <div key={lv.role} className="msg-dm-group">
                                            <div className="msg-sub-label">{lv.label}<span>{rows.length}</span></div>
                                            {rows.map((p) => {
                                                const k: Chat = { kind: "dm", userId: p.id };
                                                return (
                                                    <div key={p.id} className={cx("msg-contact-row", chat && chatKey(chat) === chatKey(k) && "on")} role="button" tabIndex={0}
                                                        onClick={() => select(k)} onKeyDown={(e) => { if (e.key === "Enter") select(k); }}>
                                                        <Avatar person={{ name: p.name, photoFileId: p.photoFileId, online: presence.data?.has(p.id) ?? false }} size={28} presence />
                                                        <div className="grow" style={{ minWidth: 0 }}>
                                                            <div className="trunc" style={{ fontWeight: 600 }}>{p.name}</div>
                                                            <div className="muted trunc" style={{ fontSize: 11 }}>{p.position ?? ""}{super_ && p.domain ? ` · ${areaLabel(p.domain)}` : ""}</div>
                                                        </div>
                                                        {count(byChat.get(chatKey(k)))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                                {groups.length === 0 && people.length === 0 && <Empty art="search" title="No matches" />}
                            </>
                        )}
                </div>

                <div className="msg-thread">
                    {!chat ? (conversations.data ? <Empty art="done" title="Pick a conversation" text="Choose someone or a group from the list to start." /> : null)
                        : <Thread key={chatKey(chat)} chat={chat} person={person} team={team} meId={me.id} />}
                </div>
            </div>
        </div>
    );
}
