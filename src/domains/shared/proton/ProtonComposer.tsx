import { useState, type RefObject } from "react";
import Icon from "@/shared/icons/Icon";
import { useProtonUsage } from "./protonApi";
import type { ProtonConversation } from "./useProtonConversation";

type ProtonComposerProps = {
    conversation: ProtonConversation;
    /** The box the panel puts the keyboard in when it opens. */
    input: RefObject<HTMLTextAreaElement | null>;
    canStartOver: boolean;
    /** Whether the person is writing to Proton: the blob listens. */
    onComposing: (composing: boolean) => void;
};

/** Where the person writes to Proton, with this month's allowance (never money) and a fresh start. */
export default function ProtonComposer({ conversation, input, canStartOver, onComposing }: ProtonComposerProps) {
    const [text, setText] = useState("");
    const usage = useProtonUsage();
    const left = usage.data;

    const send = () => {
        const question = text.trim();
        if (!question || conversation.pending) return;
        setText("");
        onComposing(false);
        conversation.question(question);
    };

    return (
        <div className="proton-foot">
            <form className="proton-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <textarea
                    ref={input}
                    className="input"
                    aria-label="Ask Proton"
                    placeholder="Ask me anything about the company"
                    rows={2}
                    maxLength={2000}
                    dir="auto"
                    value={text}
                    onChange={(e) => { setText(e.target.value); onComposing(e.target.value.trim().length > 0); }}
                    onBlur={() => onComposing(false)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                />
                <button className="btn btn-primary" type="submit" disabled={!text.trim() || conversation.pending} aria-label="Send">
                    <Icon name="send" />
                </button>
            </form>
            <div className="proton-meta muted">
                {left ? (left.companyLimitReached ? "Proton has used this month's budget."
                    : `${left.questionsRemaining} of ${left.questionsAllowed} questions left this month`) : " "}
                {canStartOver && <button className="btn btn-quiet btn-sm" onClick={conversation.startOver}>New conversation</button>}
            </div>
        </div>
    );
}
