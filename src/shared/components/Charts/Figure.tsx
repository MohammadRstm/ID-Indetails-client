import { useState, type ReactNode } from "react";
import { cx } from "@/shared/utils/cx";

export type ChartTableProps = {
    cols: { label: string; right?: boolean; mono?: boolean }[];
    rows: ReactNode[][];
};

/** A chart's figures as a plain table (the chart / table twin). */
export function ChartTable({ cols, rows }: ChartTableProps) {
    return (
        <div className="tbl-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="tbl">
                <thead>
                    <tr>{cols.map((c, i) => <th key={i} className={c.right ? "r" : ""}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            {r.map((cell, j) => <td key={j} className={cx(cols[j]?.right && "r", cols[j]?.mono && "mono")}>{cell}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

type FigureProps = {
    title: ReactNode;
    sub?: ReactNode;
    tools?: ReactNode;
    /** Adds a Chart / Table switch showing these figures. */
    table?: ChartTableProps;
    flush?: boolean;
    foot?: ReactNode;
    className?: string;
    children: ReactNode;
};

/** A panel holding a chart, optionally with its table twin (the prototype's V.Figure). */
export default function Figure({ title, sub, tools, table, flush, foot, className, children }: FigureProps) {
    const [tab, setTab] = useState<"chart" | "table">("chart");
    return (
        <div className={cx("panel", className)}>
            <div className="panel-head">
                <div className="grow" style={{ minWidth: 160 }}>
                    <div className="panel-title">{title}</div>
                    {sub && <div className="panel-sub">{sub}</div>}
                </div>
                <div className="panel-tools">
                    {tools}
                    {table && (
                        <div className="seg" role="tablist">
                            <button className={cx("seg-btn", tab === "chart" && "on")} onClick={() => setTab("chart")}>Chart</button>
                            <button className={cx("seg-btn", tab === "table" && "on")} onClick={() => setTab("table")}>Table</button>
                        </div>
                    )}
                </div>
            </div>
            <div className={cx("panel-body", flush && "flush")}>{tab === "chart" || !table ? children : <ChartTable {...table} />}</div>
            {foot && <div className="panel-foot">{foot}</div>}
        </div>
    );
}
