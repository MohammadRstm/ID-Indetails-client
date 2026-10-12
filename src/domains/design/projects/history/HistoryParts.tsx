import { StatusBadge as ProjectStatus } from "@/shared/components/Data/Pills";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Annotation, StatusAt } from "./history";
import { annView, STATUS_WORD, type SourceKind } from "./words";

/** Where a figure comes from: recorded, estimated, inferred or calculated. */
export function Src({ kind, title }: { kind: SourceKind; title?: string }) {
    return <span className={`vt-src src-${kind}`} title={title}>{kind}</span>;
}

/** A status at a moment, including "not created yet". */
export function HistoryStatus({ status }: { status: StatusAt["status"] }) {
    if (status in STATUS_WORD) return <ProjectStatus status={status} />;
    return <span className="badge">{status === "not-created" ? "Not created yet" : "Unknown"}</span>;
}

export function AnnChip({ ann, nameOf }: { ann: Annotation; nameOf: (id: number) => string }) {
    const v = annView(ann, nameOf);
    if (!v) return null;
    return (
        <span className={cx("vt-ann", ann.kind === "status" && `st-${ann.status}`)}>
            <Icon name={v.icon} /><span>{v.text}</span><Src kind={v.src} />
        </span>
    );
}
