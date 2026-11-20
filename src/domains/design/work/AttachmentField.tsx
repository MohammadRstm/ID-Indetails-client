import { useRef } from "react";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
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
                <button type="button" className="btn btn-sm btn-quiet attach-btn" disabled={state.uploading} onClick={picker.open}>
                    <Icon name="attach" />{state.uploading ? "Uploading…" : "Attach an image or video"}
                </button>
            )}
            {state.error && <div className="err mt-s"><Icon name="alert" /><ErrorMessage error={state.error} /></div>}
            {picker.input}
        </div>
    );
}
