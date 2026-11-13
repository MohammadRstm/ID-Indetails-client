import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import Avatar from "@/shared/components/Identity/Avatar";
import Icon from "@/shared/icons/Icon";
import { uploadFile } from "@/domains/design/work/workApi";
import RecordingBar from "@/shared/voice/RecordingBar";
import { uploadVoice } from "@/shared/voice/uploadVoice";
import { useVoiceRecorder } from "@/shared/voice/useVoiceRecorder";
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
 * someone. Files upload as soon as they are picked; Enter sends. With nothing written, the microphone button
 * turns the row into a recorder: Send uploads the voice note and sends it as a message of its own.
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
    const rec = useVoiceRecorder();
    const [asking, setAsking] = useState(false);
    const [sendingVoice, setSendingVoice] = useState(false);
    // a voice note that uploaded but whose message failed to send isn't uploaded again on a retry
    const uploadedVoice = useRef<number | null>(null);

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
        setUploading((n) => n + chosen.length);
        // all at once, each made small first; they join the message in the order picked
        const saved = await Promise.all(chosen.map(async (f): Promise<Picked | null> => {
            try {
                const file = await uploadFile(f);
                return { id: file.id, name: file.name, video: f.type.startsWith("video/"), preview: URL.createObjectURL(f) };
            } catch (e) {
                setUploadError(errorMessage(e));
                return null;
            } finally {
                setUploading((n) => n - 1);
            }
        }));
        setFiles((prev) => [...prev, ...saved.filter((p): p is Picked => p !== null)]);
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

    async function startRecording() {
        setUploadError(null);
        setAsking(true);
        try { await rec.start(); } finally { setAsking(false); }
    }

    async function sendVoice() {
        if (sendingVoice || sending) return;
        setUploadError(null);
        setSendingVoice(true);
        try {
            let id = uploadedVoice.current;
            if (id == null) {
                const blob = await rec.finish();
                if (!blob) return;
                id = (await uploadVoice(blob)).id;
                uploadedVoice.current = id;
            }
            await onSend({ body: "", mentionIds: [], attachmentIds: [id] });
            uploadedVoice.current = null;
            rec.discard();
        } catch (e) {
            // a failed send shows under the composer from `error`; a failed upload is shown here. The recording stays for a retry
            if (uploadedVoice.current == null) setUploadError(errorMessage(e));
        } finally {
            setSendingVoice(false);
        }
    }

    function discardVoice() {
        uploadedVoice.current = null;
        rec.discard();
    }

    const recording = rec.state !== "idle";
    const problem = uploadError ?? rec.error ?? (error ? errorMessage(error) : null);
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
            {recording ? (
                <div className="msg-composer">
                    <RecordingBar seconds={rec.seconds} stopped={rec.state === "recorded"} doneLabel="Send" busy={sendingVoice || sending}
                        onDone={() => void sendVoice()} onDiscard={discardVoice} />
                </div>
            ) : (
            <div className="msg-composer">
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
                <button className="icon-btn" aria-label="Attach file" disabled={files.length >= MAX_FILES} onClick={() => fileRef.current?.click()}><Icon name="attach" /></button>
                <input className="input grow" placeholder="Message…" aria-label="Message" value={text}
                    onChange={(e) => onText(e.target.value, e.target.selectionStart)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!fromProton.current) void send(); } }} />
                {text.trim() === "" && files.length === 0 && (
                    <button className="icon-btn" aria-label="Record a voice note" disabled={asking} onClick={() => void startRecording()}><Icon name="mic" /></button>
                )}
                <button className="btn btn-primary btn-sm" disabled={!canSend} onClick={() => void send()} aria-label="Send"><Icon name="send" /></button>
            </div>
            )}
            {(problem || uploading > 0 || sendingVoice) && (
                <div className={problem ? "err mt-s" : "muted mt-s"} style={{ fontSize: "11.5px" }} role={problem ? "alert" : undefined}>
                    {problem ? <><Icon name="alert" />{problem}</> : sendingVoice ? "Sending…" : "Uploading…"}
                </div>
            )}
        </div>
    );
}
