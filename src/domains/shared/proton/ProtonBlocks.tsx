import { useState } from "react";
import { Link } from "react-router";
import { CompositionBar, ProfitBars, RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure, { ChartTable, type ChartTableProps } from "@/shared/components/Charts/Figure";
import LineChart from "@/shared/components/Charts/LineChart";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Modal from "@/shared/components/Overlays/Modal";
import { fmtDateY, fmtTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { ProtonRef } from "./protonApi";
import {
    formatChange, formatValue, pointLabel, pointTitle, type ProtonBlock, type ProtonChartBlock, type ProtonTableBlock,
} from "./protonFigures";

const PALETTE = ["var(--heat-3)", "var(--cost)", "var(--now)", "var(--ok)", "var(--warn-mark)", "var(--heat-1)", "var(--accent)", "var(--done)"];

/** Rows a table shows in the panel; the rest are in its full view. */
const COMPACT_ROWS = 5;

type LinkOf = (ref: ProtonRef) => string | null;

/**
 * The charts, tables and headline figures under one answer. In the panel they are small, and a click shows one in
 * full; on the assistant page they are shown in full, each with its figures as a table too.
 */
export default function ProtonBlocks({ blocks, linkOf, wide }: { blocks: ProtonBlock[]; linkOf: LinkOf; wide?: boolean }) {
    const [open, setOpen] = useState<ProtonBlock | null>(null);
    if (blocks.length === 0) return null;
    return (
        <div className="proton-blocks">
            {blocks.map((block) => wide
                ? <BlockFigure key={block.id} block={block} linkOf={linkOf} />
                : <BlockCard key={block.id} block={block} onOpen={() => setOpen(block)} />)}
            {open && (
                <Modal title={open.title} sub={open.period} size="lg" onClose={() => setOpen(null)}>
                    <BlockBody block={open} linkOf={linkOf} full />
                    {open.chart && <div className="mt"><ChartTable {...twinOf(open.chart)} /></div>}
                    <BlockNotes block={open} withSource />
                </Modal>
            )}
        </div>
    );
}

/** A block in the panel: small, and the whole card opens its full view. */
function BlockCard({ block, onOpen }: { block: ProtonBlock; onOpen: () => void }) {
    return (
        // the button is the way in for the keyboard; a click anywhere on the card does the same
        <div className="proton-block" onClick={onOpen}>
            <div className="proton-block-head">
                <div className="grow">
                    <div className="proton-block-title">{block.title}</div>
                    {block.period && <div className="muted proton-block-sub">{block.period}</div>}
                </div>
                <button type="button" className="btn btn-quiet btn-sm" aria-label={`Show "${block.title}" in full`}
                    onClick={(e) => { e.stopPropagation(); onOpen(); }}>
                    <Icon name="external" />
                </button>
            </div>
            <BlockBody block={block} linkOf={() => null} />
            <BlockNotes block={block} />
        </div>
    );
}

/** A block on the assistant page: in full, with a Chart / Table switch for charts. */
function BlockFigure({ block, linkOf }: { block: ProtonBlock; linkOf: LinkOf }) {
    return (
        <Figure title={block.title} sub={block.period} table={block.chart ? twinOf(block.chart) : undefined} className="proton-chart-figure"
            foot={<BlockNotes block={block} withSource />}>
            <BlockBody block={block} linkOf={linkOf} full />
        </Figure>
    );
}

function BlockBody({ block, linkOf, full }: { block: ProtonBlock; linkOf: LinkOf; full?: boolean }) {
    if (block.kpis) {
        return (
            <KpiStrip items={block.kpis.items.map((k) => ({
                key: k.key,
                label: k.label,
                value: formatValue(k.unit, k.value),
                sub: k.previous != null ? `${formatChange(k.unit, k.change)} vs ${formatValue(k.unit, k.previous)}` : undefined,
            }))} />
        );
    }

    if (block.table) return <TableView table={block.table} linkOf={linkOf} limit={full ? undefined : COMPACT_ROWS} />;
    return block.chart ? <ChartView chart={block.chart} title={block.title} height={full ? 230 : 130} /> : null;
}

function TableView({ table, linkOf, limit }: { table: ProtonTableBlock; linkOf: LinkOf; limit?: number }) {
    const rows = limit ? table.rows.slice(0, limit) : table.rows;
    const hidden = table.rows.length - rows.length;
    return (
        <>
            <ChartTable
                cols={table.columns.map((c) => ({ label: c.label, right: c.kind === "number" }))}
                rows={rows.map((row) => row.cells.map((cell, j) => {
                    const column = table.columns[j];
                    const text = cell.text ?? (cell.number != null ? formatValue(column?.unit ?? "count", cell.number)
                        : cell.date ? (column?.kind === "week" || column?.kind === "month" ? pointTitle(column.kind, cell.date) : fmtDateY(cell.date)) : "–");
                    const to = j === 0 && row.ref ? linkOf({ ...row.ref, domain: row.ref.domain ?? null }) : null;
                    return to ? <Link to={to}>{text}</Link> : text;
                }))}
            />
            {hidden > 0 && <div className="muted proton-block-more">{hidden} more {hidden === 1 ? "row" : "rows"} in the full view</div>}
        </>
    );
}

function ChartView({ chart, title, height }: { chart: ProtonChartBlock; title: string; height: number }) {
    const [first] = chart.series;
    const format = (v: number) => formatValue(first.unit, v, true);
    if (chart.kind === "bar") {
        // a missing figure isn't a bar of 0: it is left out and said
        const shown = chart.points.filter((p) => p.values[0] != null);
        const items = shown.map((p, i) => ({ id: i, label: p.label, value: p.values[0]! }));
        const missing = chart.points.length - shown.length;
        return (
            <>
                {first.unit === "usd" && items.some((i) => i.value < 0)
                    ? <ProfitBars unit={first.label} items={items} />
                    : <RankBars unit={first.label} format={format} items={items} />}
                {missing > 0 && <div className="muted proton-block-more">No figure for {missing} of them.</div>}
            </>
        );
    }

    if (chart.kind === "composition") {
        return <CompositionBar format={format} parts={chart.points.map((p, i) => ({ label: p.label, value: p.values[0] ?? 0, color: PALETTE[i % PALETTE.length] }))} />;
    }

    const tickEvery = Math.max(1, Math.ceil(chart.points.length / 7));
    const gaps = chart.points.some((p) => chart.series.some((_, si) => p.values[si] == null));
    if (chart.kind === "line" && !gaps) {
        return (
            <LineChart title={title} height={height} format={format} tickEvery={tickEvery}
                series={chart.series.map((s, si) => ({
                    label: s.label,
                    area: si === 0 && chart.series.length === 1,
                    color: si === 0 ? undefined : PALETTE[si],
                    points: chart.points.map((p) => ({ y: p.values[si]!, label: pointLabel(chart.axis, p.label), tip: pointTitle(chart.axis, p.label) })),
                }))} />
        );
    }

    // columns, and a line with a missing point (a line would draw it as 0): the missing one is a muted, empty column
    return (
        <Columns title={title} height={height} format={format} labelEvery={tickEvery} seriesLabel={first.label} ghostLabel={chart.series[1]?.label}
            data={chart.points.map((p) => ({
                label: pointLabel(chart.axis, p.label),
                value: p.values[0] ?? 0,
                ghost: chart.series.length > 1 ? p.values[1] ?? 0 : undefined,
                tip: pointTitle(chart.axis, p.label),
                muted: p.partial || p.values[0] == null,
                note: p.values[0] == null ? "No figure" : p.partial ? "So far: it isn't over" : undefined,
            }))} />
    );
}

/** A chart's figures as a table: every series, every point, in full. */
function twinOf(chart: ProtonChartBlock): ChartTableProps {
    return {
        cols: [{ label: chart.axisLabel }, ...chart.series.map((s) => ({ label: s.label, right: true }))],
        rows: chart.points.map((p) => [
            `${pointTitle(chart.axis, p.label)}${p.partial ? " (so far)" : ""}`,
            ...chart.series.map((s, si) => formatValue(s.unit, p.values[si])),
        ]),
    };
}

function BlockNotes({ block, withSource }: { block: ProtonBlock; withSource?: boolean }) {
    if (block.notes.length === 0 && !withSource) return null;
    return (
        <ul className="muted proton-block-notes">
            {block.notes.map((note) => <li key={note}>{note}</li>)}
            {withSource && <li>From the app's own figures, read at {fmtTime(block.source.asOf)}.</li>}
        </ul>
    );
}
