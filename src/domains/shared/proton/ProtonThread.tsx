import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { cx } from "@/shared/utils/cx";
import ActionCard from "./ActionCard";
import { talkDuration } from "./blob/talkPlan";
import ProtonWelcome from "./ProtonWelcome";
import SourcesNote from "./SourcesNote";
import type { ProtonRef } from "./protonApi";
import type { ProtonChat } from "./protonChat";
import { celebrate, changeChat } from "./protonStore";
import type { ProtonConversation } from "./useProtonConversation";

type ProtonThreadProps = {
    chat: ProtonChat;
    conversation: ProtonConversation;
    linkOf: (ref: ProtonRef) => string | null;
    /** The reply being said right now: it is revealed as it is said, unless motion should be still. */
    saying: string | null;
    still: boolean;
    /** A question has taken a while: say so. */
    stillLooking: boolean;
};

/** The conversation itself: what was asked and answered, the buttons of the newest reply, and any proposed change. */
export default function ProtonThread({ chat, conversation, linkOf, saying, still, stillLooking }: ProtonThreadProps) {
    const bottom = useRef<HTMLDivElement>(null);
    const [skipped, setSkipped] = useState<number | null>(null);
    // only the newest proposal can still be confirmed, and only the newest reply's buttons pressed: the API replaced the others
    const newest = chat.turns.findLast((t) => t.from === "proton" && t.action != null);
    const latestAction = newest?.from === "proton" ? newest.action?.id : undefined;
    const lastTurn = chat.turns.length - 1;
    const pending = conversation.pending;

    useEffect(() => bottom.current?.scrollIntoView?.({ block: "end" }), [chat.turns.length, pending]);

    // the newest reply appears as it is said; a click shows it all at once
    const revealing = (i: number, text: string) =>
        !still && i === lastTurn && skipped !== i && saying === text;

    return (
        <div className="proton-thread">
            {chat.turns.length === 0 && <ProtonWelcome onAsk={conversation.question} linkOf={linkOf} disabled={pending} />}
            {chat.turns.map((turn, i) => turn.from === "note" ? (
                <div key={i} className="proton-note muted" role="status">{turn.text}</div>
            ) : (
                <div key={i} className={cx("proton-turn", turn.from)}>
                    <div className={cx("msg-bubble", turn.from === "you" && "mine")}>
                        <div
                            className={cx("msg-text", turn.from === "proton" && revealing(i, turn.text) && "proton-reveal")}
                            style={turn.from === "proton" ? { ["--reveal-ms" as string]: `${talkDuration(turn.text)}ms` } : undefined}
                            dir="auto"
                            onClick={() => setSkipped(i)}
                        >
                            {turn.text}
                        </div>
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
                    {turn.from === "proton" && turn.action && chat.conversationId && (
                        <ActionCard
                            action={turn.action}
                            conversationId={chat.conversationId}
                            state={chat.actions[turn.action.id] ?? { kind: "open" }}
                            replaced={turn.action.id !== latestAction}
                            onDecided={(state) => {
                                changeChat((c) => ({ ...c, actions: { ...c.actions, [turn.action!.id]: state } }));
                                if (state.kind === "done") celebrate();
                            }}
                        />
                    )}
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
                    <div className="msg-bubble muted proton-typing">
                        <span className="proton-dots" aria-hidden="true"><i /><i /><i /></span>
                        <span>{stillLooking ? "Still looking…" : "Looking into it…"}</span>
                    </div>
                </div>
            )}
            <div ref={bottom} />
        </div>
    );
}
