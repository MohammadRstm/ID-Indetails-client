import { fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { offUntil, useAway } from "./timeOffApi";

/** The amber "Off until …" badge (the prototype's "Day off"), shown while someone is on approved time off today. */
export function OffBadge({ userId }: { userId: number }) {
    const { data } = useAway();
    const until = offUntil(data, userId);
    if (!until) return null;
    return (
        <span className="badge badge-hold" title="On approved time off">
            <Icon name="calendar" />
            Off until {fmtDate(until)}
        </span>
    );
}
