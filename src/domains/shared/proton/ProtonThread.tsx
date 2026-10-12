import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { Link } from "react-router";
import { cx } from "@/shared/utils/cx";
import ActionCard from "./ActionCard";
import ProtonWelcome from "./ProtonWelcome";
import SourcesNote from "./SourcesNote";
import { useRemember, type ProtonPendingAction, type ProtonRef } from "./protonApi";
import type { ProtonChat } from "./protonChat";
import { celebrate, changeChat } from "./protonStore";
import type { ProtonConversation } from "./useProtonConversation";

// the charts load with the first answer that has one
const ProtonBlocks = lazy(() => import("./ProtonBlocks"));

type ProtonThreadProps = {
    chat: ProtonChat;
    conversation: ProtonConversation;
    linkOf: (ref: ProtonRef) => string | null;
    /** The answer as it is being written, while a question is answered. */
    draft: string | null;
    /** What Proton is doing for it, in the server's words. */
    status: string | null;
    /** A question has taken a while: say so. */
    stillLooking: boolean;
    /** The thread fills a page: charts and tables are shown in full rather than small. */
    wide?: boolean;
};

/** Cards for the same change (the same kind, on the same record): the API keeps only the newest of them. */
const sameChange = (card: ProtonPendingAction) => `${card.tool}:${card.target?.type ?? ""}:${card.target?.id ?? ""}`;

/** The conversation itself: what was asked and answered, the buttons of the newest reply, and any proposed changes. */
export default function ProtonThread({ chat, conversation, linkOf, draft, status, stillLooking, wide }: ProtonThreadProps) {
    const bottom = useRef<HTMLDivElement>(null);
    // a later proposal for the same change replaces a card; other cards stay open. Only the newest reply's buttons can be pressed.
    const newest = new Map<string, string>();
    for (const turn of chat.turns) {
        if (turn.from === "proton") for (const card of turn.cards) newest.set(sameChange(card), card.id);
    }
    const lastTurn = chat.turns.length - 1;
    const remember = useRemember();
    // what became of "Remember this" under each message, by its place in the chat
    const [remembered, setRemembered] = useState<Record<number, string>>({});
    const keep = (i: number, text: string) => {
        if (!chat.conversationId) return;
        remember.mutate({ conversationId: chat.conversationId, text }, {
            onSuccess: () => setRemembered((r) => ({ ...r, [i]: "I'll remember that." })),
            onError: (error) => setRemembered((r) => ({ ...r, [i]: errorMessage(error) })),
        });
    };
    const pending = conversation.pending;

    // the thread follows new text only while the reader is at the bottom, so reading further up isn't interrupted;
    // their own new question always brings them down
    const atBottom = useRef(true);
    useEffect(() => {
        const scroller = bottom.current?.closest(".proton-scroll");
        if (!scroller) return;
        const onScroll = () => { atBottom.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80; };
        scroller.addEventListener("scroll", onScroll);
        return () => scroller.removeEventListener("scroll", onScroll);
    }, []);
    const askedLast = chat.turns.at(-1)?.from === "you";
    // braces: newer browsers return a Promise from scrollIntoView, which React would take for a cleanup
    useEffect(() => {
        if (atBottom.current || askedLast) bottom.current?.scrollIntoView?.({ block: "end" });
    }, [chat.turns.length, pending, draft, askedLast]);

    return (
        <div className="proton-thread">
            {chat.turns.length === 0 && <ProtonWelcome onAsk={conversation.question} linkOf={linkOf} disabled={pending} />}
            {chat.turns.map((turn, i) => turn.from === "note" ? (
                <div key={i} className="proton-note muted" role="status">{turn.text}</div>
            ) : (
                <div key={i} className={cx("proton-turn", turn.from)}>
                    <div className={cx("msg-bubble", turn.from === "you" && "mine")}>
                        <div className="msg-text" dir="auto">{turn.text}</div>
                        {turn.from === "proton" && turn.refs.length > 0 && (
                            <div className="chips proton-refs">
                                {turn.refs.map((ref) => {
                                    const to = linkOf(ref);
                                    return to
                                        ? <Link key={`${ref.type}-${ref.id}`} className="chip" to={to}>{ref.name}</Link>
                                        : <span key={`${ref.type}-${ref.id}`} className="chip">{ref.name}</span>;
                                })}
                            </div>
                        )}
                        {turn.from === "proton" && (turn.choices.length > 0 || turn.quickReplies.length > 0) && (
                            <div className="proton-choices" role="group" aria-label="Options">
                                {turn.choices.map((choice) => (
                                    <button
                                        key={`${choice.type}-${choice.id}`}
                                        className="btn btn-sm"
                                        disabled={i !== lastTurn || pending}
                                        onClick={() => conversation.pick(choice)}
                                    >
                                        {choice.label}{choice.detail && <span className="muted"> · {choice.detail}</span>}
                                    </button>
                                ))}
                                {turn.quickReplies.map((option) => (
                                    <button key={option.reply} className="btn btn-sm" disabled={i !== lastTurn || pending} onClick={() => conversation.reply(option)}>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {turn.from === "proton" && <SourcesNote sources={turn.sources} />}
                        {turn.from === "proton" && turn.did && <div className="muted proton-did" role="status">{turn.did}</div>}
                    </div>
                    {turn.from === "proton" && turn.blocks.length > 0 && (
                        <Suspense fallback={<div className="muted proton-block-more">Drawing the figures…</div>}>
                            <ProtonBlocks blocks={turn.blocks} linkOf={linkOf} wide={wide} />
                        </Suspense>
                    )}
                    {turn.from === "you" && chat.conversationId && (
                        remembered[i]
                            ? <div className="muted proton-remembered" role="status">{remembered[i]}</div>
                            : <button className="btn btn-quiet btn-sm proton-remember" disabled={remember.isPending} onClick={() => keep(i, turn.text)}>Remember this</button>
                    )}
                    {turn.from === "proton" && chat.conversationId && turn.cards.map((card) => (
                        <ActionCard
                            key={card.id}
                            action={card}
                            conversationId={chat.conversationId!}
                            state={chat.actions[card.id] ?? { kind: "open" }}
                            replaced={newest.get(sameChange(card)) !== card.id}
                            onDecided={(state) => {
                                changeChat((c) => ({ ...c, actions: { ...c.actions, [card.id]: state } }));
                                if (state.kind === "done") celebrate();
                            }}
                        />
                    ))}
                    {turn.from === "proton" && i === lastTurn && turn.suggestions.length > 0 && (
                        <div className="proton-choices proton-suggestions" role="group" aria-label="Suggested replies">
                            {turn.suggestions.map((suggestion, index) => (
                                <button key={suggestion} className="btn btn-sm btn-quiet" disabled={pending} onClick={() => conversation.suggest(suggestion, index)}>
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            {pending && (
                <div className="proton-turn proton">
                    {draft && <div className="msg-bubble proton-draft"><div className="msg-text" dir="auto">{draft}</div></div>}
                    <div className="muted proton-typing">
                        <span className="proton-dots" aria-hidden="true"><i /><i /><i /></span>
                        <span>{status ?? (stillLooking ? "Still looking…" : "Looking into it…")}</span>
                    </div>
                </div>
            )}
            <div ref={bottom} />
        </div>
    );
}
