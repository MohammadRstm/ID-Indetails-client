import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { errorMessage } from "@/api/errors";
import { useArea } from "@/app/shell/useArea";
import Icon from "@/shared/icons/Icon";
import { relTime } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { STILL_LOOKING_AFTER_MS } from "./blob/protonMood";
import ProtonComposer from "./ProtonComposer";
import ProtonThread from "./ProtonThread";
import ProtonVoiceBar from "./ProtonVoiceBar";
import { useDeleteChat, useProtonChats, useRenameChat } from "./protonApi";
import { assistantPath, useProtonShared } from "./protonContext";
import { showingPage, useProton } from "./protonStore";

/**
 * Proton's own page: the person's saved chats beside the one they are in, with room for long answers. It shows the
 * same conversation as the panel (one chat, one source of truth): while it is open the panel and blob step aside.
 */
export default function ProtonPage() {
    const shared = useProtonShared()!;
    const { conversation, linkOf } = shared;
    const proton = useProton();
    const { chatId } = useParams();
    const navigate = useNavigate();
    const area = useArea();
    const areaKey = area.kind === "domain" ? area.domain : "company";
    const input = useRef<HTMLTextAreaElement>(null);
    const [listOpen, setListOpen] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const current = proton.chat.conversationId;
    const stillLooking = useStillLooking(proton.askedAt);

    useEffect(() => {
        showingPage(true);
        return () => showingPage(false);
    }, []);

    // the chat named in the address is the one shown; a chat that can't be read sends the person to a new one
    useEffect(() => {
        if (!chatId || chatId === current) return;
        conversation.open(chatId).then(() => setProblem(null), (error: unknown) => {
            setProblem(errorMessage(error));
            navigate(assistantPath(areaKey), { replace: true });
        });
        // only when the address changes: the chat changing by itself is followed by the address below
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId]);

    // a new chat gets its address once its first answer saved it
    useEffect(() => {
        if (current && current !== chatId) navigate(assistantPath(areaKey, current), { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    const startNew = () => {
        conversation.startOver();
        setProblem(null);
        setListOpen(false);
        navigate(assistantPath(areaKey));
        input.current?.focus();
    };
    const pick = (id: string) => {
        setListOpen(false);
        if (id !== current) navigate(assistantPath(areaKey, id));
    };

    return (
        <div className="proton-page" data-proton-layer="">
            <aside className={cx("proton-page-list", listOpen && "open")} aria-label="Your chats with Proton">
                <ChatList current={current} onPick={pick} onNew={startNew} />
            </aside>
            <section className="proton-page-chat" aria-label="Proton">
                <ChatHead current={current} onList={() => setListOpen((o) => !o)} onDeleted={startNew} />
                <div className="proton-page-body proton-scroll">
                    <div className="proton-page-column">
                        {problem && <div className="banner attn" role="alert">{problem}</div>}
                        <ProtonThread wide chat={proton.chat} conversation={conversation} linkOf={linkOf} draft={proton.draft?.text ?? null}
                            status={proton.status} stillLooking={stillLooking} />
                    </div>
                </div>
                <div className="proton-page-foot">
                    <div className="proton-page-column">
                        <ProtonVoiceBar />
                        {proton.chat.locked ? (
                            <div className="proton-locked">
                                <span className="muted">{proton.chat.locked}</span>
                                <button className="btn btn-primary btn-sm" onClick={startNew}>New chat</button>
                            </div>
                        ) : (
                            <ProtonComposer conversation={conversation} input={input} canStartOver={false} onComposing={() => {}} />
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}

/** Whether the question being answered has taken a while, moving on by itself when it starts to. */
function useStillLooking(askedAt: number | null) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (askedAt == null) return;
        const id = setTimeout(() => setNow(Date.now()), Math.max(0, askedAt + STILL_LOOKING_AFTER_MS - Date.now()) + 20);
        return () => clearTimeout(id);
    }, [askedAt]);
    return askedAt != null && now - askedAt >= STILL_LOOKING_AFTER_MS;
}

function ChatList({ current, onPick, onNew }: { current: string | null; onPick: (id: string) => void; onNew: () => void }) {
    const [search, setSearch] = useState("");
    const chats = useProtonChats(search.trim());
    const items = chats.data?.items ?? [];
    return (
        <>
            <div className="proton-page-list-head">
                <button className="btn btn-primary btn-sm" onClick={onNew}><Icon name="plus" /> New chat</button>
                <input className="input" type="search" placeholder="Search chats" aria-label="Search chats" value={search}
                    onChange={(e) => setSearch(e.target.value)} />
            </div>
            <nav className="proton-page-chats">
                {chats.isError && <p className="muted proton-page-empty">Your chats couldn't be loaded.</p>}
                {chats.isSuccess && items.length === 0 && (
                    <p className="muted proton-page-empty">{search.trim() ? "No chat has that in its name." : "Your chats with Proton will be kept here."}</p>
                )}
                {items.map((chat) => (
                    <button key={chat.id} className={cx("proton-page-chat-item", chat.id === current && "on")}
                        aria-current={chat.id === current ? "page" : undefined} onClick={() => onPick(chat.id)}>
                        <span className="trunc">{chat.title}</span>
                        <span className="muted">{relTime(chat.updatedAt)}</span>
                    </button>
                ))}
            </nav>
        </>
    );
}

function ChatHead({ current, onList, onDeleted }: { current: string | null; onList: () => void; onDeleted: () => void }) {
    const chats = useProtonChats("");
    const saved = chats.data?.items.find((c) => c.id === current) ?? null;
    const rename = useRenameChat();
    const remove = useDeleteChat();
    const [editing, setEditing] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const save = () => {
        if (!saved || editing == null) return;
        rename.mutate({ id: saved.id, title: editing }, {
            onSuccess: () => { setEditing(null); setProblem(null); },
            onError: (error) => setProblem(errorMessage(error)),
        });
    };

    return (
        <div className="proton-page-head">
            <button className="icon-btn proton-page-list-toggle" onClick={onList} aria-label="Your chats"><Icon name="list" /></button>
            {editing != null ? (
                <form className="row grow" onSubmit={(e) => { e.preventDefault(); save(); }}>
                    <input className="input grow" aria-label="Chat name" value={editing} maxLength={120} autoFocus
                        onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                    <button className="btn btn-primary btn-sm" type="submit" disabled={rename.isPending}>Save</button>
                    <button className="btn btn-sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                </form>
            ) : (
                <div className="grow">
                    <div className="modal-title trunc">{saved?.title ?? "New chat"}</div>
                    <div className="muted">Proton, AI assistant</div>
                </div>
            )}
            {saved && editing == null && !confirming && (
                <>
                    <button className="btn btn-quiet btn-sm" onClick={() => setEditing(saved.title)}>Rename</button>
                    <button className="btn btn-quiet btn-sm" onClick={() => setConfirming(true)}>Delete</button>
                </>
            )}
            {saved && confirming && (
                <div className="row" role="group" aria-label="Delete this chat?">
                    <span className="muted">Delete this chat?</span>
                    <button className="btn btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
                    <button className="btn btn-sm btn-primary" disabled={remove.isPending}
                        onClick={() => remove.mutate(saved.id, { onSuccess: () => { setConfirming(false); onDeleted(); } })}>Delete</button>
                </div>
            )}
            {problem && <span className="neg" role="alert">{problem}</span>}
        </div>
    );
}
