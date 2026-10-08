import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "@/api/errors";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useArea } from "@/app/shell/useArea";
import { Drawer } from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import ActionCard from "./ActionCard";
import SourcesNote from "./SourcesNote";
import { useAskProton, useEndConversation, useProtonUsage, type AskBody, type ProtonChoice, type ProtonRef } from "./protonApi";
import { emptyChat, type ProtonChat } from "./protonChat";
import { stepOf, useRunProtonCommands } from "./uiCommands";
import { useProtonPageContext } from "./useProtonPageContext";

type ProtonPanelProps = { chat: ProtonChat; onChange: (update: (chat: ProtonChat) => ProtonChat) => void; onClose: () => void };

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
    // only the newest proposal can still be confirmed, and only the newest reply's options picked: the API replaced the others
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

    const submit = (shown: string, body: Omit<AskBody, "conversationId" | "page">) => {
        if (ask.isPending) return;
        onChange((c) => ({ ...c, turns: [...c.turns, { from: "you", text: shown }] }));
        ask.mutate({ conversationId: chat.conversationId, page, ...body }, {
            onSuccess: (reply) => {
                const did = run(reply.uiCommands);
                onChange((c) => ({
                    ...c,
                    conversationId: reply.conversationId,
                    turns: [...c.turns, {
                        from: "proton", text: reply.reply, refs: reply.refs, sources: reply.sources, action: reply.pendingAction,
                        choices: reply.choices, did,
                    }],
                }));
            },
            onError: (error) => onChange((c) => ({ ...c, turns: [...c.turns, { from: "error", text: errorMessage(error) }] })),
        });
    };

    const send = () => {
        const question = text.trim();
        if (!question) return;
        setText("");
        submit(question, { text: question });
    };

    // a pick sends only what was offered; the API checks it was, and that the person can still see it
    const pick = (choice: ProtonChoice) => submit(choice.label, { choice: { type: choice.type, id: choice.id } });

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
                    <div className="muted">Ask about what you can see, or ask it to take you somewhere.</div>
                </div>
            }
            foot={
                <div className="proton-foot">
                    <form className="proton-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
                        <textarea
                            className="input"
                            aria-label="Ask Proton"
                            placeholder="Which projects are overdue?"
                            rows={2}
                            maxLength={2000}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
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
                {chat.turns.length === 0 && (
                    <div className="empty">
                        <Icon name="compass" />
                        <div>Ask Proton anything about the company, or to open a project, a client or a page. It can also prepare a few changes — you confirm each one.</div>
                    </div>
                )}
                {chat.turns.map((turn, i) => (
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
                            {turn.from === "proton" && turn.choices.length > 0 && (
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
                    </div>
                ))}
                {ask.isPending && <div className="proton-turn proton"><div className="msg-bubble muted">Proton is looking…</div></div>}
                <div ref={bottom} />
            </div>
        </Drawer>
    );
}
