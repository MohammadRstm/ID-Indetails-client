import { useState } from "react";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { canDeleteMessage, fileLabels, useDeleteMessage, type Message } from "./messagesApi";

/**
 * The three dots on a message. Everyone in the chat downloads each photo, video and voice note it carries. On the
 * sender's own message, Delete asks first, then removes it and its files for everyone: nothing is left in its place.
 */
export default function MessageMenu({ message, mine }: { message: Message; mine: boolean }) {
    const [asking, setAsking] = useState(false);
    const remove = useDeleteMessage();
    const deletable = mine && canDeleteMessage(message);
    const files = fileLabels(message.attachments);
    if (!deletable && files.length === 0) return null;

    function close() {
        setAsking(false);
        remove.reset();
    }

    function submit() {
        remove.mutate(message.id, {
            onSuccess: () => {
                setAsking(false);
                toast({ text: "Message deleted", sub: "It's gone for everyone in the chat", icon: "trash" });
            },
        });
    }

    async function download(file: Message["attachments"][number]) {
        try {
            await downloadFile(`/files/${file.id}`, file.name);
        } catch (e) {
            toast({ text: "The file wasn't downloaded", sub: errorMessage(e), icon: "alert" });
        }
    }

    return (
        <>
            <span className="msg-more">
                <MenuButton icon="dots" label="Message actions" align="right" width={190}>
                    {(closeMenu) => (
                        <div>
                            {files.map(({ file, label }) => (
                                <button key={file.id} className="pop-item" onClick={() => { closeMenu(); void download(file); }}>
                                    <Icon name="download" />Download {label}
                                </button>
                            ))}
                            {deletable && (
                                <button className="pop-item danger" onClick={() => { closeMenu(); setAsking(true); }}><Icon name="trash" />Delete</button>
                            )}
                        </div>
                    )}
                </MenuButton>
            </span>
            {asking && (
                <Modal title="Delete this message?" onClose={close}
                    foot={
                        <>
                            <div className="grow">{remove.error ? <span className="err" role="alert"><Icon name="alert" /><ErrorMessage error={remove.error} /></span> : null}</div>
                            <button type="button" className="btn" onClick={close}>Keep it</button>
                            <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={submit}>
                                {remove.isPending ? "Deleting…" : "Delete"}
                            </button>
                        </>
                    }>
                    <p>
                        It's deleted for everyone in the chat{message.attachments.length > 0 ? ", with its photos, videos and voice notes" : ""}.
                        This can't be undone.
                    </p>
                </Modal>
            )}
        </>
    );
}
