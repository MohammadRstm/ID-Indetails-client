import type { ReactNode } from "react";
import { useCurrentUser } from "@/app/session/useSession";
import { fmtDayDateY } from "@/shared/format/time";
import { companyNow } from "../../design/work/day";

/** "Good evening, Sarah", with today's date and a line about their projects: the head of someone's own projects page. */
export default function GreetingHead({ sub, actions }: { sub: ReactNode; actions?: ReactNode }) {
    const me = useCurrentUser();
    const { today, minute } = companyNow();
    const hour = Math.floor(minute / 60);
    return (
        <div className="page-head">
            <div>
                <h1 className="page-title">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {me.firstName}</h1>
                <div className="page-sub">{fmtDayDateY(today)} · {sub}</div>
            </div>
            {actions && <div className="page-actions">{actions}</div>}
        </div>
    );
}
