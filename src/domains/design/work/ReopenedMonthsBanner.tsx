import { useState } from "react";
import DateInput from "@/shared/components/Forms/DateInput";
import { companyToday, fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { openLogWork } from "./logWorkStore";
import { monthName, useReopenedMonths } from "./reopenedMonthsApi";

function MonthRow({ month, openUntil }: { month: string; openUntil: string }) {
    const first = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const [day, setDay] = useState("");
    return (
        <div className="banner reopened-banner">
            <Icon name="calendar" />
            <div className="grow"><b>{monthName(month)} is open for logging</b> until {fmtDateY(openUntil)}. Log the hours you missed: pick a day.</div>
            <DateInput value={day} min={first} max={last < companyToday() ? last : companyToday()} aria-label={`A day in ${monthName(month)}`}
                onChange={(d) => { setDay(d); if (d) openLogWork({ date: d, fixedDay: true }); }} />
        </div>
    );
}

/** The months a super admin reopened, each with a day picker that opens the log window on that day. */
export default function ReopenedMonthsBanner() {
    const open = useReopenedMonths();
    if (!open.data?.length) return null;
    return <>{open.data.map((m) => <MonthRow key={m.month} month={m.month} openUntil={m.openUntil} />)}</>;
}
