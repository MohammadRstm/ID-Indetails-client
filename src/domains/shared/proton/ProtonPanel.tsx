import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toApiError } from "@/api/errors";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useArea } from "@/app/shell/useArea";
import { Drawer } from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import ActionCard from "./ActionCard";
import ProtonWelcome from "./ProtonWelcome";
import SourcesNote from "./SourcesNote";
import { useAskProton, useEndConversation, useProtonUsage, type AskBody, type ProtonChoice, type ProtonQuickReplyOption, type ProtonRef } from "./protonApi";
import { emptyChat, type ProtonChat, type ProtonTurn } from "./protonChat";
import { stepOf, useRunProtonCommands } from "./uiCommands";
import { useProtonPageContext } from "./useProtonPageContext";

type ProtonPanelProps = { chat: ProtonChat; onChange: (update: (chat: ProtonChat) => ProtonChat) => void; onClose: () => void };

type Ask = Omit<AskBody, "conversationId" | "page">;

const ROLLED_OVER = "Our chat was getting long, so I kept a short summary of it and carried on.";

/**
 * Proton, the company assistant: questions in plain language, answers from what this person may see. It sits beside
 * the page rather than over it, so when Proton opens something the person sees it change and can keep talking.
 */
export default function ProtonPanel({ chat, onChange, onClose }: ProtonPanelProps) {
    const [text, setText] = useState("");
    const ask = useAskProton();
    const end = useEndConversation();
    const usage = useProtonUsage();
    const page = useProtonPageContext();
    const run = useRunProtonCommands();
    const permissions = usePermissions();
    const area = useArea();
    const bottom = useRef<HTMLDivElement>(null);
    // only the newest proposal can still be confirmed, and only the newest reply's buttons pressed: the API replaced the others
    const newest = chat.turns.findLast((t) => t.from === "proton" && t.action != null);
    const latestAction = newest?.from === "proton" ? newest.action?.id : undefined;
    const lastTurn = chat.turns.length - 1;

    useEffect(() => bottom.current?.scrollIntoView?.({ block: "end" }), [chat.turns.length]);

    // the same route rules as Proton's own commands: a link shows only where this person may go
    const linkOf = (ref: ProtonRef) => {
        const step = stepOf({ type: `open_${ref.type}`, id: ref.id, domain: ref.domain, label: ref.name }, permissions,
            area.kind === "domain" ? area.domain : null);
        return step?.kind === "go" ? step.path : null;
    };

    const add = (...turns: ProtonTurn[]) => onChange((c) => ({ ...c, turns: [...c.turns, ...turns] }));

    const send = (conversationId: string | null, body: Ask, retried = false) =>
        ask.mutate({ conversationId, page, ...body }, {
            onSuccess: (reply) => {
                const did = run(reply.uiCommands);
                onChange((c) => ({
                    ...c,
                    conversationId: reply.conversationId,
                    turns: [
                        ...c.turns,
                        ...(reply.rolledOver ? [{ from: "note", text: ROLLED_OVER } as const] : []),
                        {
                            from: "proton", text: reply.reply, refs: reply.refs, sources: reply.sources, action: reply.pendingAction,
                            choices: reply.choices, quickReplies: reply.quickReplies, suggestions: reply.suggestions, did,
                        },
                    ],
                }));
            },
            onError: (error) => {
                const failure = toApiError(error);
                if (failure.code !== "proton_conversation_ended" || conversationId == null) {
                    add({ from: "error", text: failure.message });
                    return;
                }

                // The server no longer has the chat: carry on in a new one. A typed question is simply asked again
                // there; a button belonged to the old chat, so the person asks again in their own words.
                onChange((c) => ({ ...c, conversationId: null }));
                add({ from: "note", text: body.text && !retried ? failure.message : `${failure.message} Could you ask that again?` });
                if (body.text && !retried) send(null, { text: body.text }, true);
            },
        });

    const submit = (shown: string, body: Ask) => {
        if (ask.isPending) return;
        add({ from: "you", text: shown });
        send(chat.conversationId, body);
    };

    const typed = () => {
        const question = text.trim();
        if (!question) return;
        setText("");
        submit(question, { text: question });
    };

    // a button sends only what it is; the API checks it was offered and writes the question itself
    const pick = (choice: ProtonChoice) => submit(choice.label, { choice: { type: choice.type, id: choice.id } });
    const reply = (option: ProtonQuickReplyOption) => submit(option.label, { reply: option.reply });
    const suggest = (suggestion: string, index: number) => submit(suggestion, { suggestion: index });

    const startOver = () => {
        if (chat.conversationId) end.mutate(chat.conversationId);
        onChange(() => emptyChat);
    };

    const left = usage.data;
    return (
        <Drawer
            title="Proton"
            modeless
            onClose={onClose}
            head={
                <div className="proton-head">
                    <div className="modal-title">Proton</div>
                    <div className="muted">AI assistant</div>
                </div>
            }
            foot={
                <div className="proton-foot">
                    <form className="proton-composer" onSubmit={(e) => { e.preventDefault(); typed(); }}>
                        <textarea
                            className="input"
                            aria-label="Ask Proton"
                            placeholder="Ask me anything about the company"
                            rows={2}
                            maxLength={2000}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); typed(); } }}
                        />
                        <button className="btn btn-primary" type="submit" disabled={!text.trim() || ask.isPending} aria-label="Send">
                            <Icon name="send" />
                        </button>
                    </form>
                    <div className="proton-meta muted">
                        {left ? (left.companyLimitReached ? "Proton has used this month's budget."
                            : `${left.questionsRemaining} of ${left.questionsAllowed} questions left this month`) : " "}
                        {chat.turns.length > 0 && <button className="btn btn-quiet btn-sm" onClick={startOver}>New conversation</button>}
                    </div>
                </div>
            }
        >
            <div className="proton-thread" aria-live="polite">
                {chat.turns.length === 0 && <ProtonWelcome onAsk={(question) => submit(question, { text: question })} linkOf={linkOf} disabled={ask.isPending} />}
                {chat.turns.map((turn, i) => turn.from === "note" ? (
                    <div key={i} className="proton-note muted" role="status">{turn.text}</div>
                ) : (
                    <div key={i} className={cx("proton-turn", turn.from)}>
                        <div className={cx("msg-bubble", turn.from === "you" && "mine")}>
                            <div className="msg-text">{turn.text}</div>
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
                                            disabled={i !== lastTurn || ask.isPending}
                                            onClick={() => pick(choice)}
                                        >
                                            {choice.label}{choice.detail && <span className="muted"> · {choice.detail}</span>}
                                        </button>
                                    ))}
                                    {turn.quickReplies.map((option) => (
                                        <button key={option.reply} className="btn btn-sm" disabled={i !== lastTurn || ask.isPending} onClick={() => reply(option)}>
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
                                onDecided={(state) => onChange((c) => ({ ...c, actions: { ...c.actions, [turn.action!.id]: state } }))}
                            />
                        )}
                        {turn.from === "proton" && i === lastTurn && turn.suggestions.length > 0 && (
                            <div className="proton-choices proton-suggestions" role="group" aria-label="Suggested replies">
                                {turn.suggestions.map((suggestion, index) => (
                                    <button key={suggestion} className="btn btn-sm btn-quiet" disabled={ask.isPending} onClick={() => suggest(suggestion, index)}>
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {ask.isPending && <div className="proton-turn proton"><div className="msg-bubble muted">Looking into it…</div></div>}
                <div ref={bottom} />
            </div>
        </Drawer>
    );
}
