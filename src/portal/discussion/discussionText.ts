import type { DiscussionPerson } from "./discussionTypes";

/*
 * What the discussion does with the words in it. Text is plain: it is cut into pieces here and drawn as text, never as
 * HTML. Two kinds of pieces stand out: the "@Name" of someone mentioned, and https: links.
 */

export type TextPart = { text: string; kind: "plain" | "mention" | "link" };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// a name ends where letters and digits end: "@Nadia" is not "@Nadiameh"
const NAME_END = "(?![\\p{L}\\p{N}])";
const LINK = "https:\\/\\/[^\\s<>]+";
// punctuation that closes a sentence rather than a link
const LINK_TAIL = /[.,;:!?)\]}'"]+$/;

const isLink = (url: string) => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && parsed.hostname !== "";
    } catch {
        return false;
    }
};

/** Whether the text names this person: "@Nadia Karam" does, "@Nadia Karamel" doesn't. */
export function namesPerson(text: string, name: string): boolean {
    return new RegExp(`@${escapeRegExp(name)}${NAME_END}`, "u").test(text);
}

/** The text cut where a mention or a link is. */
export function textParts(text: string, names: string[]): TextPart[] {
    const kinds: string[] = [];
    if (names.length > 0) kinds.push(`@(?:${[...names].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})${NAME_END}`);
    kinds.push(LINK);
    const out: TextPart[] = [];
    const push = (part: TextPart) => {
        const last = out[out.length - 1];
        if (part.text === "") return;
        if (last && last.kind === "plain" && part.kind === "plain") last.text += part.text;
        else out.push(part);
    };

    let at = 0;
    for (const match of text.matchAll(new RegExp(kinds.join("|"), "gu"))) {
        push({ text: text.slice(at, match.index), kind: "plain" });
        at = match.index + match[0].length;
        if (match[0].startsWith("@")) {
            push({ text: match[0], kind: "mention" });
            continue;
        }
        const url = match[0].replace(LINK_TAIL, "");
        push({ text: url, kind: isLink(url) ? "link" : "plain" });
        push({ text: match[0].slice(url.length), kind: "plain" });
    }
    push({ text: text.slice(at), kind: "plain" });
    return out;
}

/** The names of the people the keys stand for, among those who take part. */
export function namesOf(keys: string[], people: DiscussionPerson[]): string[] {
    return people.filter((p) => keys.includes(p.key)).map((p) => p.name);
}

/** The "@" being typed just before the caret, if there is one: where it starts and the letters after it. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
    const match = /(^|\s)@([\p{L}'’-]*)$/u.exec(text.slice(0, caret));
    return match ? { start: match.index + match[1].length, query: match[2] } : null;
}

/** Who "@query" can be: the others who take part whose name has it, those starting with it first. */
export function mentionCandidates(people: DiscussionPerson[], query: string): DiscussionPerson[] {
    const q = query.toLowerCase();
    const others = people.filter((p) => !p.isYou && p.name.toLowerCase().includes(q));
    const startsWith = (p: DiscussionPerson) => p.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q));
    return [...others.filter(startsWith), ...others.filter((p) => !startsWith(p))].slice(0, 6);
}
