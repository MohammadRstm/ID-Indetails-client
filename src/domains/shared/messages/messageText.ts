import type { Message } from "./messagesApi";

/** What a message says in a list: its text, or what it carries. */
export function snippet(m: Message | null | undefined): string {
    if (!m) return "";
    if (m.kind === "task_comment") return `Task comment${m.body ? `: ${m.body}` : ""}`;
    if (m.body) return m.body;
    const first = m.attachments[0];
    return first ? (first.kind === "video" || first.mimeType.startsWith("video/") ? "📹 Video" : "📷 Photo") : "";
}

export const firstName = (name: string) => name.split(" ")[0] || name;

/** A message's text cut where its mentions are (the prototype's renderText): "@Sarah Haddad" stands out. */
export function mentionParts(text: string, names: string[]): { text: string; mention: boolean }[] {
    if (!names.length) return [{ text, mention: false }];
    const escaped = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`@(?:${escaped.join("|")})`, "g");
    const out: { text: string; mention: boolean }[] = [];
    let at = 0;
    for (const m of text.matchAll(re)) {
        if (m.index > at) out.push({ text: text.slice(at, m.index), mention: false });
        out.push({ text: m[0], mention: true });
        at = m.index + m[0].length;
    }
    if (at < text.length) out.push({ text: text.slice(at), mention: false });
    return out;
}

/** A message starts a new run unless the same person wrote the one before within five minutes. */
export function startsRun(m: Message, prev: Message | undefined): boolean {
    return !prev || prev.sender.id !== m.sender.id || prev.kind === "task_comment" || m.kind === "task_comment"
        || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
}
