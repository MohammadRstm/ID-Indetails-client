import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import Avatar from "@/shared/components/Identity/Avatar";
import Icon from "@/shared/icons/Icon";
import { uploadFile } from "@/domains/design/work/workApi";
import { clearDraft, onDraft, peekDraft } from "@/domains/shared/proton/formFill";
import type { Contact } from "./messagesApi";

type Picked = { id: number; name: string; video: boolean; preview: string };

type ComposerProps = {
    /** In a group, "@" offers its members. */
    members: Contact[] | null;
    meId: number;
    sending: boolean;
    error: unknown;
    onSend: (body: { body: string; mentionIds: number[]; attachmentIds: number[] }) => Promise<unknown>;
    /** The chat ("dm-9", "group-3"): a draft Proton wrote for it starts here. */
    draftKey?: string;
};

const MAX_FILES = 10;

/**
 * Writing a message (the prototype's Composer): text, photos and videos, and in a group "@" to mention
 * someone. Files upload as soon as they are picked; Enter sends.
 */
export default function Composer({ members, meId, sending, error, onSend, draftKey }: ComposerProps) {
    const [text, setText] = useState(() => (draftKey ? peekDraft(draftKey) : null) ?? "");
    // a draft Proton wrote waits for the person: Enter doesn't send it until they have changed it or press Send
    const fromProton = useRef(text !== "");

    useEffect(() => {
        if (!draftKey) return;
        clearDraft(draftKey);
        return onDraft((chat) => {
            if (chat !== draftKey) return;
            const body = peekDraft(chat);
            clearDraft(chat);
            if (!body) return;
            setText((current) => (current.trim() ? current : body));
            fromProton.current = true;
        });
    }, [draftKey]);
    const [files, setFiles] = useState<Picked[]>([]);
    const [uploading, setUploading] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentioned, setMentioned] = useState<Contact[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);

    const candidates = members && mentionQuery != null
        ? members.filter((p) => p.id !== meId && p.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
        : [];
    const canSend = (text.trim().length > 0 || files.length > 0) && uploading === 0 && !sending;

    function onText(value: string, caret: number | null) {
        setText(value);
        fromProton.current = false;
        if (!members) return;
        const m = /@([a-zA-Z]*)$/.exec(value.slice(0, caret ?? value.length));
        setMentionQuery(m ? m[1] : null);
    }

    function pick(person: Contact) {
        setText(text.replace(/@([a-zA-Z]*)$/, `@${person.name} `));
        setMentioned((m) => (m.some((x) => x.id === person.id) ? m : [...m, person]));
        setMentionQuery(null);
    }

    async function onFiles(list: FileList | null) {
        const chosen = Array.from(list ?? []).slice(0, MAX_FILES - files.length);
        setUploadError(null);
        for (const f of chosen) {
            setUploading((n) => n + 1);
            try {
                const saved = await uploadFile(f);
                setFiles((prev) => [...prev, { id: saved.id, name: saved.name, video: f.type.startsWith("video/"), preview: URL.createObjectURL(f) }]);
            } catch (e) {
                setUploadError(errorMessage(e));
            } finally {
                setUploading((n) => n - 1);
            }
        }
    }

    function remove(id: number) {
        const f = files.find((x) => x.id === id);
        if (f) URL.revokeObjectURL(f.preview);
        setFiles(files.filter((x) => x.id !== id));
    }

    async function send() {
        if (!canSend) return;
        const mentionIds = mentioned.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id);
        try {
            await onSend({ body: text.trim(), mentionIds, attachmentIds: files.map((f) => f.id) });
            files.forEach((f) => URL.revokeObjectURL(f.preview));
            setText(""); setFiles([]); setMentioned([]); setMentionQuery(null);
        } catch {
            // the error shows under the composer; what was written stays
        }
    }

    const problem = uploadError ?? (error ? errorMessage(error) : null);
    return (
        <div className="msg-composer-wrap">
            {files.length > 0 && (
                <div className="msg-attach-preview">
                    {files.map((f) => (
                        <div key={f.id} className="msg-attach-thumb">
                            {f.video ? <video src={f.preview} /> : <img src={f.preview} alt={f.name} />}
                            <button className="icon-btn" onClick={() => remove(f.id)} aria-label={`Remove ${f.name}`}><Icon name="x" /></button>
                        </div>
                    ))}
                </div>
            )}
            {candidates.length > 0 && (
                <div className="mention-pop" role="listbox" aria-label="Mention">
                    {candidates.map((p) => (
                        <button key={p.id} className="pop-item" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
                            <Avatar person={{ name: p.name, photoFileId: p.photoFileId }} size={20} /><span>{p.name}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="msg-composer">
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
                <button className="icon-btn" aria-label="Attach file" disabled={files.length >= MAX_FILES} onClick={() => fileRef.current?.click()}><Icon name="attach" /></button>
                <input className="input grow" placeholder="Message…" aria-label="Message" value={text}
                    onChange={(e) => onText(e.target.value, e.target.selectionStart)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!fromProton.current) void send(); } }} />
                <button className="btn btn-primary btn-sm" disabled={!canSend} onClick={() => void send()} aria-label="Send"><Icon name="send" /></button>
            </div>
            {(problem || uploading > 0) && (
                <div className={problem ? "err mt-s" : "muted mt-s"} style={{ fontSize: "11.5px" }} role={problem ? "alert" : undefined}>
                    {problem ? <><Icon name="alert" />{problem}</> : "Uploading…"}
                </div>
            )}
        </div>
    );
}
