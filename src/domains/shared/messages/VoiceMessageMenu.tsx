import { useState } from "react";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { useDeleteMessage } from "./messagesApi";

/**
 * The three dots on the sender's own voice message. Delete asks first, then removes the message and its recording for
 * everyone in the chat: nothing is left in its place.
 */
export default function VoiceMessageMenu({ messageId }: { messageId: number }) {
    const [asking, setAsking] = useState(false);
    const remove = useDeleteMessage();

    function close() {
        setAsking(false);
        remove.reset();
    }

    function submit() {
        remove.mutate(messageId, {
            onSuccess: () => {
                setAsking(false);
                toast({ text: "Voice message deleted", sub: "It's gone for everyone in the chat", icon: "trash" });
            },
        });
    }

    return (
        <>
            <span className="msg-more">
                <MenuButton icon="dots" label="Voice message actions" align="right" width={170}>
                    {(closeMenu) => (
                        <div>
                            <button className="pop-item danger" onClick={() => { closeMenu(); setAsking(true); }}><Icon name="trash" />Delete</button>
                        </div>
                    )}
                </MenuButton>
            </span>
            {asking && (
                <Modal title="Delete this voice message?" onClose={close}
                    foot={
                        <>
                            <div className="grow">{remove.error ? <span className="err" role="alert"><Icon name="alert" /><ErrorMessage error={remove.error} /></span> : null}</div>
                            <button type="button" className="btn" onClick={close}>Keep it</button>
                            <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={submit}>
                                {remove.isPending ? "Deleting…" : "Delete"}
                            </button>
                        </>
                    }>
                    <p>It's deleted for everyone in the chat, with its recording. This can't be undone.</p>
                </Modal>
            )}
        </>
    );
}
