import { useState } from "react";
import { ApiError } from "@/api/errors";
import { RankBars, ProfitBars, StatusBar, CompositionBar, Spark, Delta } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import DayRuler from "@/shared/components/Charts/DayRuler";
import Figure from "@/shared/components/Charts/Figure";
import { CalendarHeat, HourHeat } from "@/shared/components/Charts/Heat";
import LineChart from "@/shared/components/Charts/LineChart";
import Waterfall from "@/shared/components/Charts/Waterfall";
import { Banner, Bar, Presence, ProjectTile, Signal } from "@/shared/components/Data/Bits";
import { Kpi, KpiStrip } from "@/shared/components/Data/Kpi";
import { CostRow, Money } from "@/shared/components/Data/Money";
import Panel, { PageHead } from "@/shared/components/Data/Panel";
import { MarginPill, StatusBadge } from "@/shared/components/Data/Pills";
import Tabs from "@/shared/components/Data/Tabs";
import DataTable, { type SortState } from "@/shared/components/Data-Tables/DataTable";
import Pager from "@/shared/components/Data-Tables/Pager";
import Empty from "@/shared/components/Feedback/Empty";
import HelpTip from "@/shared/components/Feedback/HelpTip";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import { ChipGroup, FilterSep, SearchInput, Segmented, SwitchRow, Toggle } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Stepper from "@/shared/components/Forms/Stepper";
import TimeField from "@/shared/components/Forms/TimeField";
import { Avatars, PersonLine } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal, { Drawer } from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { addMonths, companyToday, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";

/*
 * Development only (/dev/kit): every shared component with sample data, to compare with the prototype and
 * review changes. Not reachable in production builds.
 */

const people = ["Sarah Haddad", "Omar Fares", "Lina Saad", "Rami Aoun", "Maya Nassar", "Elie Khalil", "Yara Mansour"].map((name, i) => ({
    id: i + 1, name, position: ["Senior interior designer", "Architect", "Interior designer", "3D visualiser", "Junior architect", "Draughtsman", "Visualisation lead"][i], online: i % 3 !== 0,
}));
const weeks = [22, 31, 28, 35, 40, 33, 38, 44, 29, 36, 41, 39].map((h, i) => ({ label: `W${i + 1}`, value: h, ghost: h - 6 + (i % 4) * 3, tip: `Week ${i + 1}` }));
const rows = people.map((p, i) => ({ ...p, hours: 20 + i * 7, cost: 900 + i * 410 }));
const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString();

export default function KitGallery() {
    const [chip, setChip] = useState("all");
    const [seg, setSeg] = useState("quarter");
    const [select, setSelect] = useState("design");
    const [day, setDay] = useState(companyToday());
    const [time, setTime] = useState<number | null>(9 * 60 + 30);
    const [amount, setAmount] = useState(1250);
    const [currency, setCurrency] = useState("USD");
    const [toggle, setToggle] = useState(true);
    const [month, setMonth] = useState(companyToday().slice(0, 7));
    const [tab, setTab] = useState("overview");
    const [sort, setSort] = useState<SortState>({ key: "hours", dir: "desc" });
    const [page, setPage] = useState(1);
    const [modal, setModal] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const sorted = [...rows].sort((a, b) => (sort.dir === "desc" ? -1 : 1) * ((a[sort.key as "hours"] ?? 0) - (b[sort.key as "hours"] ?? 0)));

    return (
        <div className="page" style={{ maxWidth: 1200, margin: "0 auto" }}>
            <PageHead title="Component kit" sub="Every shared component, with sample data." actions={<button className="btn btn-primary" onClick={() => toast({ text: "Saved", sub: "A toast confirms what you just did." })}><Icon name="check" />Toast</button>} />

            <Tabs value={tab} onChange={setTab} items={[{ key: "overview", label: "Overview" }, { key: "requirements", label: "Requirements", count: 4 }, { key: "timeline", label: "Timeline" }]} />

            <div className="filters mt">
                <SearchInput value="" onChange={() => {}} placeholder="Search projects" />
                <ChipGroup value={chip} onChange={setChip} options={[{ value: "all", label: "All", count: 12 }, { value: "active", label: "Active", count: 8 }, { value: "hold", label: "On hold", count: 2 }]} />
                <FilterSep />
                <Segmented value={seg} onChange={setSeg} options={[{ value: "quarter", label: "Quarter" }, { value: "month", label: "Month" }, { value: "30d", label: "30d" }]} />
                <Select className="select sm" style={{ width: 150 }} value={select} onChange={setSelect} options={[{ value: "design", label: "Design" }, { value: "execution", label: "Execution" }]} aria-label="Domain" />
                <Stepper label={fmtMonthY(month)} onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} />
            </div>

            <KpiStrip items={[
                { key: "a", label: "Active projects", value: 8, sub: "2 on hold" },
                { key: "b", label: "Hours this quarter", value: "1,240", unit: "h", delta: <Delta value={1240} prev={1100} /> },
                { key: "c", label: "Revenue", value: <Money value={184500} /> },
                { key: "d", label: "Margin", value: "18.4%", hint: "Profit ÷ revenue" },
            ]} />
            <SkeletonKpis count={4} />

            <div className="grid g-2 mt">
                <Panel title="Badges and people" sub="Statuses, margins, presence">
                    <div className="row wrap" style={{ gap: 8 }}>
                        {["active", "hold", "completed", "archived", "invited"].map((s) => <StatusBadge key={s} status={s} />)}
                        <MarginPill value={0.42} /><MarginPill value={0.12} /><MarginPill value={-0.05} /><MarginPill value={null} /><MarginPill value={0} internal />
                    </div>
                    <div className="row mt" style={{ gap: 12 }}>
                        <ProjectTile icon="building" tint="#0C6B69" /><Signal level={3} /><Signal level={1} /><Presence online /><Presence online={false} lastSeenAt={threeHoursAgo} />
                    </div>
                    <div className="mt"><PersonLine person={people[0]} presence /></div>
                    <div className="mt"><Avatars people={people} max={5} /></div>
                    <div className="mt"><Bar value={64} /></div>
                    <div className="mt">
                        <CostRow label="Employee labour" value={money.exact(18400)} swatch="var(--heat-3)" />
                        <CostRow label="Project expenses" value={money.exact(2300)} swatch="var(--heat-1)" />
                        <CostRow label="Total cost" value={money.exact(20700)} strong />
                    </div>
                </Panel>
                <Panel title="Fields">
                    <div className="stack">
                        <div className="field"><label className="label">Date</label><DateInput value={day} onChange={setDay} /></div>
                        <div className="field"><label className="label">Start</label><TimeField value={time} onChange={setTime} /></div>
                        <div className="field"><label className="label">Amount</label><AmountField value={amount} onChange={setAmount} currency={currency} onCurrency={setCurrency} /></div>
                        <SwitchRow title="Start/stop timer" description="Shows the timer in the top bar." control={<Toggle checked={toggle} onChange={setToggle} label="Timer" />} />
                        <div className="row" style={{ gap: 8 }}>
                            <button className="btn" onClick={() => setModal(true)}>Open a modal</button>
                            <button className="btn" onClick={() => setDrawer(true)}>Open a drawer</button>
                            <MenuButton icon="dots" label="More">
                                {(close) => <><button className="pop-item" onClick={close}><Icon name="edit" />Edit</button><button className="pop-item" onClick={close}><Icon name="archive" />Archive</button></>}
                            </MenuButton>
                        </div>
                    </div>
                </Panel>
            </div>

            <Panel title="Table" sub="Sortable, with loading, error and empty states" flush className="mt"
                foot={<Pager page={page} pageSize={3} total={rows.length} onPage={setPage} />}>
                <DataTable rows={sorted.slice((page - 1) * 3, page * 3)} rowKey={(r) => r.id} sort={sort} onSort={setSort} onRowClick={() => {}}
                    columns={[
                        { key: "name", header: "Employee", cell: (r) => <PersonLine person={r} size={24} /> },
                        { key: "hours", header: "Hours", right: true, mono: true, sortKey: "hours", cell: (r) => `${r.hours}h` },
                        { key: "cost", header: "Labour cost", right: true, sortKey: "cost", cell: (r) => <Money value={r.cost} /> },
                    ]} />
            </Panel>
            <div className="grid g-3 mt">
                <Panel title="Loading" flush><DataTable rows={undefined} loading rowKey={() => 0} skeletonRows={3} columns={[{ key: "a", header: "Name", cell: () => null }, { key: "b", header: "Hours", right: true, cell: () => null }]} /></Panel>
                <Panel title="Failed" flush><DataTable rows={undefined} error={new ApiError(0, {})} onRetry={() => {}} what="the people" rowKey={() => 0} columns={[{ key: "a", header: "Name", cell: () => null }]} /></Panel>
                <Panel title="Empty"><Empty art="projects" title="No projects yet" text="Projects you create appear here." /></Panel>
            </div>

            <div className="grid g-2 mt">
                <Figure title="Hours per week" sub="This quarter against the last" table={{ cols: [{ label: "Week" }, { label: "Hours", right: true }], rows: weeks.map((w) => [w.label, w.value]) }}>
                    <Columns data={weeks} seriesLabel="This quarter" ghostLabel="Last quarter" format={(v) => `${Math.round(v)}h`} />
                </Figure>
                <Figure title="Payment against cost">
                    <LineChart format={(v) => money.short(v)} tickEvery={2} series={[
                        { label: "Cost to date", area: true, points: weeks.map((w, i) => ({ y: w.value * 400 * (i + 1) / 3, label: w.label, tip: w.tip })) },
                        { label: "Collected", points: weeks.map((w, i) => ({ y: i < 4 ? 14400 : i < 9 ? 18400 : 28000, label: w.label, tip: w.tip })) },
                    ]} />
                </Figure>
                <Panel title="Rank bars"><RankBars showPct items={rows.map((r) => ({ id: r.id, label: r.name, value: r.hours * 60 }))} /></Panel>
                <Panel title="Profit bars"><ProfitBars items={[{ label: "HQ fit-out", value: 14200 }, { label: "Villa interiors", value: 6100 }, { label: "Bank refresh", value: -2400 }]} /></Panel>
                <Panel title="Status and composition">
                    <StatusBar segments={[{ label: "Active", value: 8, color: "var(--accent)" }, { label: "On hold", value: 2, color: "var(--warn-mark)" }, { label: "Completed", value: 5, color: "var(--done)" }]} />
                    <div className="mt"><CompositionBar parts={[{ label: "Employee labour", value: 18400, color: "var(--heat-3)" }, { label: "Project expenses", value: 2300, color: "var(--heat-1)" }]} /></div>
                    <div className="mt"><Spark values={[3, 5, 2, 7, 6, 8, 4, 9]} /></div>
                </Panel>
                <Panel title="Waterfall"><Waterfall steps={[{ label: "Value", value: 48000, kind: "start" }, { label: "Labour", value: 22000, kind: "cost", sub: "1,240h" }, { label: "Expenses", value: 2300, kind: "cost" }, { label: "Profit", value: 0, kind: "result" }]} /></Panel>
                <Panel title="Calendar"><CalendarHeat weeks={20} value={(d) => (d.charCodeAt(9) % 5) * 110} note="Hours logged per day" /></Panel>
                <Panel title="When work happens"><HourHeat grid={Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d < 5 && h >= 9 && h < 18 ? 30 + ((h * d) % 5) * 20 : 0)))} /></Panel>
                <Panel title="Day ruler"><DayRuler blocks={[{ start: `${companyToday()}T07:00:00Z`, end: `${companyToday()}T09:30:00Z` }]} others={[{ start: `${companyToday()}T11:00:00Z`, end: `${companyToday()}T13:00:00Z` }]} /></Panel>
                <Panel title="Feedback">
                    <Banner tone="hold" icon="alert">More than the value left on this project.</Banner>
                    <div className="mt"><LoadError error={new ApiError(500, {})} retry={() => {}} what="the invoices" /></div>
                    <div className="mt"><SkeletonLines lines={3} /></div>
                </Panel>
                <Panel title="A KPI on its own"><Kpi label="Outstanding" value={<Money value={26300} />} sub="3 invoices" /></Panel>
                <Panel title="Help bubbles" sub="A &quot;?&quot; that explains on the spot, with or without a link to Help">
                    <p>Margin<HelpTip label="margin">Profit ÷ revenue.</HelpTip></p>
                    <p>Outstanding<HelpTip label="outstanding" more={{ to: "/design/help?article=billing-terms" }}>What clients still have to pay on invoices already sent.</HelpTip></p>
                </Panel>
            </div>

            {modal && (
                <Modal title="New invoice" sub="Haddad Holdings HQ fit-out" size="md" onClose={() => setModal(false)}
                    foot={<><button className="btn" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-primary" onClick={() => setModal(false)}>Save</button></>}>
                    <p>A modal closes with Escape or a click outside.</p>
                </Modal>
            )}
            {drawer && <Drawer title="Sarah Haddad" onClose={() => setDrawer(false)}><p>A drawer slides in from the right.</p></Drawer>}
        </div>
    );
}
