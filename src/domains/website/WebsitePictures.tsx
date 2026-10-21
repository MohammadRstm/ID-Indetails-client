import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { FieldError } from "@/shared/components/Forms/Field";
import { useFileUrl } from "@/shared/files/useFileUrl";
import Icon from "@/shared/icons/Icon";
import { uploadingLabel } from "@/shared/files/upload";
import { CARD_EDGE, PICTURE_TYPES, uploadPictures } from "./websiteApi";

/** A website picture, small, as the page shows it; a grey tile while it loads or when there is none. */
export function Thumb({ fileId, width = 36, ratio = 4 / 5, alt = "" }: { fileId: number | null | undefined; width?: number; ratio?: number; alt?: string }) {
    // twice its width, for sharp screens
    const { url } = useFileUrl(fileId, width * 2);
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
    // how far the upload has got, from 0 to 1, while there is one
    const [uploading, setUploading] = useState<number | null>(null);
    const [failed, setFailed] = useState<string>();

    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(0);
        setFailed(undefined);
        try {
            // the card (portrait preview) is shown smaller than the page picture
            onChange((await uploadPictures([file], ratio < 1 ? CARD_EDGE : undefined, (_, fraction) => setUploading(fraction)))[0]);
        } catch (e) {
            setFailed(errorMessage(e));
        } finally {
            setUploading(null);
        }
    }

    return (
        <div className="field">
            <div className={required ? "label required" : "label"}>{label}</div>
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
                <Thumb fileId={fileId} width={ratio < 1 ? 72 : 128} ratio={ratio} alt={label} />
                {canEdit && (
                    <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-sm" disabled={uploading != null} onClick={() => input.current?.click()}>
                            <Icon name="upload" />{uploading != null ? uploadingLabel(1, 0, uploading) : fileId == null ? "Choose" : "Replace"}
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
