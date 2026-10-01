import { useRef } from "react";
import { errorMessage } from "@/api/errors";
import { useFileUrl } from "@/shared/files/useFileUrl";
import Icon from "@/shared/icons/Icon";
import type { AttachmentState } from "./attachments";

/** The hidden file input behind "Attach…". */
function useFilePicker(onPick: (f: File) => void) {
    const ref = useRef<HTMLInputElement>(null);
    const input = (
        <input ref={ref} type="file" accept="image/*,video/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
        }} />
    );
    return { input, open: () => ref.current?.click() };
}

/** Log work's attachment: a thumbnail with a remove button, or a button to add one. */
export function AttachmentField({ state }: { state: AttachmentState }) {
    const picker = useFilePicker(state.pick);
    const { url } = useFileUrl(state.file?.id);
    return (
        <div className="field mt">
            <label className="label optional">Attachment</label>
            {state.file ? (
                <div className="msg-attach-preview">
                    <div className="msg-attach-thumb">
                        {url && (state.file.kind === "video" ? <video src={url} /> : <img src={url} alt={state.file.name} />)}
                        <button className="icon-btn" type="button" onClick={state.clear} aria-label="Remove"><Icon name="x" /></button>
                    </div>
                </div>
            ) : (
                <button type="button" className="btn btn-sm btn-quiet" disabled={state.uploading} onClick={picker.open}>
                    <Icon name="attach" />{state.uploading ? "Uploading…" : "Attach an image or video"}
                </button>
            )}
            {state.error && <div className="err mt-s"><Icon name="alert" />{errorMessage(state.error)}</div>}
            {picker.input}
        </div>
    );
}

/** The day composer's smaller version: the file's name as a chip. */
export function AttachmentChip({ state }: { state: AttachmentState }) {
    const picker = useFilePicker(state.pick);
    return (
        <>
            {state.file ? (
                <span className="chip on"><Icon name="attach" />{state.file.name}
                    <button type="button" className="icon-btn" style={{ width: 20, height: 20 }} aria-label="Remove attachment" onClick={state.clear}><Icon name="x" /></button>
                </span>
            ) : (
                <button type="button" className="btn btn-sm btn-quiet" disabled={state.uploading} onClick={picker.open}>
                    <Icon name="attach" />{state.uploading ? "Uploading…" : "Attach a file"}
                </button>
            )}
            {state.error && <span className="err"><Icon name="alert" />{errorMessage(state.error)}</span>}
            {picker.input}
        </>
    );
}
