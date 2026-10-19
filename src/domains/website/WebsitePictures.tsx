import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { FieldError } from "@/shared/components/Forms/Field";
import { useFileUrl } from "@/shared/files/useFileUrl";
import Icon from "@/shared/icons/Icon";
import { PICTURE_TYPES, uploadPictures } from "./websiteApi";

/** A website picture, small, as the page shows it; a grey tile while it loads or when there is none. */
export function Thumb({ fileId, width = 36, ratio = 4 / 5, alt = "" }: { fileId: number | null | undefined; width?: number; ratio?: number; alt?: string }) {
    const { url } = useFileUrl(fileId);
    const style = { width, height: Math.round(width / ratio), borderRadius: 6, objectFit: "cover" as const, background: "var(--line)", display: "block", flex: "none" };
    return url ? <img src={url} alt={alt} style={style} /> : <span style={style} aria-hidden="true" />;
}

type PictureSlotProps = {
    label: string;
    hint: string;
    fileId: number | null;
    /** Width ÷ height of the preview: 4:5 for the thumbnail, 16:9 for the main picture. */
    ratio: number;
    canEdit: boolean;
    required?: boolean;
    error?: string;
    onChange: (fileId: number | null) => void;
};

/** One picture of a project: its preview, and choosing, replacing or clearing it. */
export function PictureSlot({ label, hint, fileId, ratio, canEdit, required, error, onChange }: PictureSlotProps) {
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [failed, setFailed] = useState<string>();

    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        setFailed(undefined);
        try {
            onChange((await uploadPictures([file]))[0]);
        } catch (e) {
            setFailed(errorMessage(e));
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="field">
            <div className={required ? "label required" : "label"}>{label}</div>
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
                <Thumb fileId={fileId} width={ratio < 1 ? 72 : 128} ratio={ratio} alt={label} />
                {canEdit && (
                    <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-sm" disabled={uploading} onClick={() => input.current?.click()}>
                            <Icon name="upload" />{uploading ? "Uploading…" : fileId == null ? "Choose" : "Replace"}
                        </button>
                        {fileId != null && <button type="button" className="btn btn-sm btn-quiet" onClick={() => onChange(null)}>Remove</button>}
                        <input ref={input} type="file" accept={PICTURE_TYPES} hidden aria-label={`${label} file`}
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
                    </div>
                )}
            </div>
            {failed || error ? <FieldError message={failed ?? error} /> : <div className="hint">{hint}</div>}
        </div>
    );
}
