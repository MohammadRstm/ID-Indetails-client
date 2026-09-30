import DateInput from "@/shared/components/Forms/DateInput";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { companyToday, MONTHS, partsOf } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { CompanyPeriod, PeriodChoice } from "./companyPeriod";

const YEARS_BACK = 5;

/** The window picker (the prototype's PeriodBar): quick presets, a year or quarter, and a free from–to range. */
export default function PeriodBar({ choice, period, onChange }: { choice: PeriodChoice; period: CompanyPeriod; onChange: (choice: PeriodChoice) => void }) {
    const today = companyToday();
    const thisYear = partsOf(today).year;
    const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => thisYear - i);
    const picked = choice.mode === "pick" ? choice : null;
    const year = picked?.year ?? thisYear;
    const preset = choice.mode === "month" || choice.mode === "quarter" || choice.mode === "year" ? choice.mode : "none";

    return (
        <div className="co-period panel">
            <Segmented value={preset} aria-label="Period" onChange={(mode) => mode !== "none" && onChange({ mode })}
                options={[{ value: "month", label: "This month" }, { value: "quarter", label: "This quarter" }, { value: "year", label: "This year" }]} />
            <span className="co-period-sep" />
            <div className="row" style={{ gap: 6 }}>
                <Select className={cx("select sm", picked && "picked")} style={{ width: 104 }} aria-label="Year" value={picked ? String(picked.year) : ""}
                    onChange={(v) => v && onChange({ mode: "pick", year: +v, q: picked?.q ?? 0 })}
                    options={[{ value: "", label: "Year" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]} />
                <Select className={cx("select sm", picked && "picked")} style={{ width: 132 }} aria-label="Quarter" value={picked ? String(picked.q || "") : ""}
                    onChange={(v) => onChange({ mode: "pick", year, q: +v || 0 })}
                    options={[
                        { value: "", label: picked ? "Whole year" : "Quarter" },
                        ...[1, 2, 3, 4].map((q) => ({
                            value: String(q), label: `Q${q} · ${MONTHS[(q - 1) * 3]}–${MONTHS[(q - 1) * 3 + 2]}`,
                            disabled: `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01` > today,
                        })),
                    ]} />
            </div>
            <span className="co-period-sep" />
            <div className="row co-period-range" style={{ gap: 6 }}>
                <div style={{ width: 150 }}>
                    <DateInput className={cx(choice.mode === "custom" && "picked")} value={period.from} max={today} aria-label="From"
                        onChange={(from) => from && onChange({ mode: "custom", from, to: from > period.to ? from : period.to })} />
                </div>
                <span className="muted">to</span>
                <div style={{ width: 150 }}>
                    <DateInput className={cx(choice.mode === "custom" && "picked")} value={period.to} max={today} aria-label="To"
                        onChange={(to) => to && onChange({ mode: "custom", from: to < period.from ? to : period.from, to })} />
                </div>
            </div>
            <span className="grow" />
            <span className="co-period-label"><Icon name="calendar" />{period.label}</span>
        </div>
    );
}
