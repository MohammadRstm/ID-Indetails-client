import { dayKey, daysBetween, fmtTime, relDay } from "@/shared/format/time";

/** "Online", "Last seen today at 14:05", "Last seen yesterday at 09:10", "Last seen Monday at 16:40" or "Last seen Nov 3". */
export function lastSeenWords(online: boolean, lastSeenAt: string | null | undefined, now: Date = new Date()): string {
    if (online) return "Online";
    if (!lastSeenAt) return "Not seen yet";
    const day = relDay(lastSeenAt, now);
    if (daysBetween(dayKey(lastSeenAt), dayKey(now)) >= 7) return `Last seen ${day}`;
    return `Last seen ${day === "Today" || day === "Yesterday" ? day.toLowerCase() : day} at ${fmtTime(lastSeenAt)}`;
}
