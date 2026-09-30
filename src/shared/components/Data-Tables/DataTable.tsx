import type { CSSProperties, Key, ReactNode } from "react";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

export type SortState<K extends string = string> = { key: K; dir: "asc" | "desc" };

export type Column<T> = {
    key: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    right?: boolean;
    mono?: boolean;
    nowrap?: boolean;
    /** Makes the header sort the table by this key. */
    sortKey?: string;
    width?: CSSProperties["width"];
    className?: string;
};

type DataTableProps<T> = {
    columns: Column<T>[];
    rows: T[] | undefined;
    rowKey: (row: T) => Key;
    loading?: boolean;
    error?: unknown;
    onRetry?: () => void;
    /** What the table is of, for the load error ("the projects"). */
    what?: string;
    /** Shown in the body when there are no rows. */
    empty?: ReactNode;
    sort?: SortState;
    onSort?: (sort: SortState) => void;
    onRowClick?: (row: T) => void;
    rowClassName?: (row: T) => string | undefined;
    /** tbl-min (860px) or tbl-min-sm (640px): wide tables scroll sideways on small screens. */
    minWidth?: "tbl-min" | "tbl-min-sm";
    skeletonRows?: number;
    /** A last row, such as totals. */
    foot?: ReactNode;
};

/** The prototype's .tbl, typed: columns, sorting, a loading state, an inline error and an empty state. */
export default function DataTable<T>({
    columns, rows, rowKey, loading, error, onRetry, what, empty, sort, onSort, onRowClick, rowClassName, minWidth, skeletonRows = 5, foot,
}: DataTableProps<T>) {
    const colSpan = columns.length;
    let body: ReactNode;
    if (error && !rows) {
        body = (
            <tr><td colSpan={colSpan}><LoadError error={error} retry={onRetry} what={what} /></td></tr>
        );
    } else if (loading && !rows) {
        body = Array.from({ length: skeletonRows }, (_, i) => (
            <tr key={i} className="skel-row" aria-hidden="true">
                {columns.map((c) => (
                    <td key={c.key} className={cx(c.right && "r")}>
                        <Skeleton width={c.right ? "50%" : i % 2 ? "70%" : "85%"} style={c.right ? { marginLeft: "auto" } : undefined} />
                    </td>
                ))}
            </tr>
        ));
    } else if (!rows?.length) {
        body = empty ? <tr><td colSpan={colSpan} style={{ borderBottom: 0 }}>{empty}</td></tr> : null;
    } else {
        body = rows.map((row) => (
            <tr key={rowKey(row)} className={cx(onRowClick && "click", rowClassName?.(row))} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((c) => (
                    <td key={c.key} className={cx(c.right && "r", c.mono && "mono", c.nowrap && "nowrap", c.className)}>{c.cell(row)}</td>
                ))}
            </tr>
        ));
    }

    return (
        <div className="tbl-wrap">
            <table className={cx("tbl", minWidth)} aria-busy={loading || undefined}>
                <thead>
                    <tr>
                        {columns.map((c) =>
                            c.sortKey && sort && onSort ? (
                                <SortTh key={c.key} sortKey={c.sortKey} sort={sort} onSort={onSort} right={c.right} width={c.width}>
                                    {c.header}
                                </SortTh>
                            ) : (
                                <th key={c.key} className={cx(c.right && "r")} style={c.width ? { width: c.width } : undefined}>{c.header}</th>
                            ),
                        )}
                    </tr>
                </thead>
                <tbody>
                    {body}
                    {rows?.length ? foot : null}
                </tbody>
            </table>
        </div>
    );
}

type SortThProps = {
    sortKey: string;
    sort: SortState;
    onSort: (sort: SortState) => void;
    right?: boolean;
    width?: CSSProperties["width"];
    className?: string;
    children: ReactNode;
};

/** A header that sorts its column: first click descending, the next ascending (the prototype's UI.SortTh). */
export function SortTh({ sortKey, sort, onSort, right, width, className, children }: SortThProps) {
    const on = sort.key === sortKey;
    return (
        <th
            className={cx("sortable", right && "r", className)}
            style={width ? { width } : undefined}
            aria-sort={on ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
            onClick={() => onSort({ key: sortKey, dir: on && sort.dir === "desc" ? "asc" : "desc" })}
        >
            {children}
            {on && <Icon name={sort.dir === "desc" ? "arrowDown" : "arrowUp"} />}
        </th>
    );
}
