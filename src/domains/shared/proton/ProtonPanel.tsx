import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { useArea } from "@/app/shell/useArea";
import Popover from "@/shared/components/Overlays/Popover";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { BlobPrefs } from "./blob/blobPosition";
import ProtonComposer from "./ProtonComposer";
import ProtonMemories from "./ProtonMemories";
import ProtonThread from "./ProtonThread";
import ProtonVoiceBar from "./ProtonVoiceBar";
import type { ProtonChat } from "./protonChat";
import { assistantPath, useProtonShared } from "./protonContext";
import type { ProtonConversation } from "./useProtonConversation";

/** Beside the blob on a wide screen; a sheet from the bottom on a phone, which can fold down to a peek. */
export type PanelLayout = { kind: "bubble"; style: CSSProperties } | { kind: "sheet"; height: number; folded: boolean };

type ProtonPanelProps = {
    chat: ProtonChat;
    conversation: ProtonConversation;
    layout: PanelLayout;
    draft: string | null;
    status: string | null;
    stillLooking: boolean;
    prefs: BlobPrefs;
    onPrefs: (change: Partial<BlobPrefs>) => void;
    onUnfold: () => void;
    onComposing: (composing: boolean) => void;
    onClose: () => void;
};

/**
 * Proton's speech bubble: the chat, beside the page rather than over it, so when Proton opens something the person
 * sees it change and can keep talking. It sits above dialogs too, without taking them away (decision 35).
 */
export default function ProtonPanel({
    chat, conversation, layout, draft, status, stillLooking, prefs, onPrefs, onUnfold, onComposing, onClose,
}: ProtonPanelProps) {
    const input = useRef<HTMLTextAreaElement>(null);
    const [memories, setMemories] = useState(false);
    const area = useArea();
    const navigate = useNavigate();
    const linkOf = useProtonShared()!.linkOf;

    // the keyboard goes to the composer when the panel opens
    useEffect(() => { input.current?.focus(); }, []);

    // the Proton page, on the chat in hand, in the area the person is in
    const goToChat = () => {
        onClose();
        navigate(assistantPath(area.kind === "domain" ? area.domain : "company", chat.conversationId));
    };

    const folded = layout.kind === "sheet" && layout.folded;
    return (
        <section
            className={cx("proton-panel", layout.kind, folded && "folded")}
            style={layout.kind === "bubble" ? layout.style : { height: folded ? undefined : layout.height }}
            role="dialog"
            aria-modal="false"
            aria-label="Proton"
        >
            <div className="proton-panel-head" onClick={folded ? onUnfold : undefined}>
                <div className="grow">
                    <div className="modal-title">Proton</div>
                    <div className="muted">AI assistant</div>
                </div>
                {folded && <button className="btn btn-quiet btn-sm" onClick={onUnfold}>Show chat</button>}
                <Popover
                    align="right"
                    width={200}
                    trigger={(open, toggle) => (
                        <button className={cx("icon-btn", open && "on")} onClick={toggle} aria-label="Proton options" aria-expanded={open}>
                            <Icon name="dots" />
                        </button>
                    )}
                >
                    {(close) => (
                        <div role="menu">
                            <button className="pop-item" role="menuitem" onClick={() => { onPrefs({ side: prefs.side === "left" ? "right" : "left" }); close(); }}>
                                Move to the {prefs.side === "left" ? "right" : "left"}
                            </button>
                            <button className="pop-item" role="menuitemcheckbox" aria-checked={prefs.calm} onClick={() => { onPrefs({ calm: !prefs.calm }); close(); }}>
                                {prefs.calm ? "Lively animations" : "Calm animations"}
                            </button>
                            <button className="pop-item" role="menuitem" onClick={() => { close(); goToChat(); }}>
                                Go to chat
                            </button>
                            <button className="pop-item" role="menuitem" onClick={() => { setMemories(true); close(); }}>
                                What I remember
                            </button>
                            <button className="pop-item" role="menuitem" onClick={() => { onPrefs({ tucked: true }); close(); onClose(); }}>
                                Tuck Proton away
                            </button>
                        </div>
                    )}
                </Popover>
                <button className="icon-btn" onClick={onClose} aria-label="Close">
                    <Icon name="x" />
                </button>
            </div>
            {!folded && memories && <div className="proton-panel-body"><ProtonMemories onBack={() => setMemories(false)} /></div>}
            {!folded && !memories && (
                <>
                    <div className="proton-panel-body proton-scroll">
                        <ProtonThread chat={chat} conversation={conversation} linkOf={linkOf} draft={draft} status={status} stillLooking={stillLooking} />
                    </div>
                    <ProtonVoiceBar />
                    <ProtonComposer conversation={conversation} input={input} canStartOver={chat.turns.length > 0} onComposing={onComposing} />
                </>
            )}
        </section>
    );
}
