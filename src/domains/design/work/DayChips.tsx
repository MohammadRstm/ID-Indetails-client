import DateInput from "@/shared/components/Forms/DateInput";
import { addDays, companyToday, DAYS, partsOf } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";

/** The last few days as chips, and any other day (the prototype's UI.DayChips). */
export default function DayChips({ value, onChange, count = 7 }: { value: string; onChange: (day: string) => void; count?: number }) {
    const today = companyToday();
    const days = Array.from({ length: count }, (_, i) => addDays(today, -i));
    return (
        <div className="chips">
            {days.map((d, i) => {
                const p = partsOf(d);
                return (
                    <button key={d} type="button" className={cx("chip", d === value && "on")} onClick={() => onChange(d)}>
                        {i === 0 ? "Today" : i === 1 ? "Yesterday" : `${DAYS[p.weekday]} ${p.day}`}
                    </button>
                );
            })}
            <DateInput className="date-chip mono" aria-label="Another day" required value={value} max={today} onChange={(v) => { if (v) onChange(v); }} />
        </div>
    );
}
