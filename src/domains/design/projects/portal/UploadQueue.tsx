import { fmtBytes } from "@/shared/format/bytes";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { SECTION_LABEL } from "./contentApi";
import type { UploadRow } from "./uploads";

type Props = {
    rows: UploadRow[];
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    onDismiss: (id: string) => void;
};

const percentOf = (row: UploadRow) => Math.min(100, Math.floor((row.sent / row.size) * 100));

function statusOf(row: UploadRow): string {
    switch (row.status) {
        case "waiting": return "Waiting";
        case "sending": return `Uploading ${percentOf(row)}%`;
        case "finishing": return "Finishing…";
        case "done": return "Uploaded";
        case "failed": return "Failed";
    }
}

function where(row: UploadRow): string {
    if (row.section === "hero") return "Hero image";
    return row.replacing ? `Replacing a file in ${SECTION_LABEL[row.section]}` : SECTION_LABEL[row.section];
}

/** The files being sent, one row each, with their progress and what can be done with them. */
export default function UploadQueue({ rows, onCancel, onRetry, onDismiss }: Props) {
    if (rows.length === 0) return null;
    return (
        <ul className="pc-queue" aria-label="Uploads">
            {rows.map((row) => (
                <li key={row.id} className="pc-up">
                    <div className="pc-up-main">
                        <div className="pc-up-name trunc" title={row.name}>{row.name}</div>
                        <div className="pc-up-meta muted">
                            {where(row)} · {fmtBytes(row.size)} · {statusOf(row)}
                        </div>
                        {row.status !== "failed" && (
                            <div className={cx("bar thin", row.status === "done" && "ok")} role="progressbar" aria-label={`Progress of ${row.name}`}
                                aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.status === "done" ? 100 : percentOf(row)}>
                                <i style={{ width: `${row.status === "done" ? 100 : percentOf(row)}%` }} />
                            </div>
                        )}
                        {row.error && <div className="err" role="alert"><Icon name="alert" /><span>{row.error}</span></div>}
                    </div>
                    <div className="pc-up-actions">
                        {row.status === "failed" ? (
                            <>
                                {row.canRetry && <button type="button" className="btn btn-sm" onClick={() => onRetry(row.id)}><Icon name="refresh" />Retry</button>}
                                <button type="button" className="btn btn-sm btn-quiet" onClick={() => onDismiss(row.id)}>Dismiss</button>
                            </>
                        ) : row.status !== "done" && (
                            <button type="button" className="btn btn-sm btn-quiet" onClick={() => onCancel(row.id)}>Cancel</button>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
}
