import type { Receipt } from "./messagesApi";

/** "Seen by 3 of 12", or by everyone; in a direct chat "Seen", "Delivered" or "Sent". */
export function seenWords(r: Receipt): string {
    if (r.of === 1) return r.seen === 1 ? "Seen" : r.delivered === 1 ? "Delivered" : "Sent";
    if (r.of > 0 && r.seen === r.of) return "Seen by everyone";
    return `Seen by ${r.seen} of ${r.of}`;
}
