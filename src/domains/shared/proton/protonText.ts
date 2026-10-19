/*
 * Proton writes plain text with a little markdown: **bold**, *italic*, `code`, "- " and "1. " lists, and now and then
 * a heading. Here it is read into blocks for ProtonMarkdown to draw, or reduced to plain text for where an answer
 * isn't drawn. Nothing becomes HTML or a link (names link through the answer's own refs).
 */

export type MdItem = { text: string; sub: string[] };
export type MdBlock =
    | { kind: "p"; lines: string[] }
    | { kind: "h"; text: string }
    | { kind: "ul"; items: MdItem[] }
    | { kind: "ol"; items: MdItem[]; start: number };

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/** The answer's blocks: paragraphs (their lines kept), headings, and lists with one level of sub-items. */
export function blocksOf(text: string): MdBlock[] {
    const blocks: MdBlock[] = [];
    let paragraph: string[] | null = null;
    let list: Extract<MdBlock, { items: MdItem[] }> | null = null;
    // a blank line ends a paragraph; a list carries on across one if the next line is another of its items
    let gap = false;

    const close = () => {
        paragraph = null;
        list = null;
    };

    for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
        if (!raw.trim()) {
            paragraph = null;
            gap = true;
            continue;
        }

        const bullet = BULLET.exec(raw);
        const numbered = bullet ? null : NUMBERED.exec(raw);
        if (bullet || numbered) {
            const indented = (bullet?.[1] ?? numbered![1]).length >= 2;
            const itemText = bullet ? bullet[2] : numbered![3];
            const kind = bullet ? "ul" : "ol";
            if (indented && list && list.items.length > 0) {
                list.items[list.items.length - 1].sub.push(itemText);
            } else if (list && list.kind === kind) {
                list.items.push({ text: itemText, sub: [] });
            } else {
                close();
                list = kind === "ul"
                    ? { kind: "ul", items: [{ text: itemText, sub: [] }] }
                    : { kind: "ol", start: Number(numbered![2]), items: [{ text: itemText, sub: [] }] };
                blocks.push(list);
            }

            gap = false;
            continue;
        }

        const heading = HEADING.exec(raw);
        if (heading || RULE.test(raw)) {
            close();
            if (heading) blocks.push({ kind: "h", text: heading[1] });
            gap = false;
            continue;
        }

        // an indented line straight under a list item continues it
        if (list && !gap && /^\s{2,}/.test(raw)) {
            const last = list.items[list.items.length - 1];
            last.text = `${last.text} ${raw.trim()}`;
            continue;
        }

        if (!paragraph) {
            list = null;
            paragraph = [];
            blocks.push({ kind: "p", lines: paragraph });
        }

        paragraph.push(raw.trim());
        gap = false;
    }

    return blocks;
}

// **bold** or __bold__, `code`, and *italic* or _italic_ (an underscore inside a word, as in snake_case, isn't one)
export const INLINE = /\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__|`([^`\n]+)`|\*(?=[^\s*])([^*\n]+?)(?<=\S)\*|(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])/gu;

const unmark = (...m: (string | undefined)[]) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "";

/**
 * The same answer as plain text, for where it isn't drawn: the blob's preview, the screen reader's announcement and
 * the voice. Markers go; lines stay.
 */
export function plainText(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .filter((line) => !RULE.test(line))
        .map((line) => line
            .replace(HEADING, "$1")
            .replace(/^(\s*)[-*•]\s+/, "$1")
            .replace(INLINE, unmark)
            // italic inside bold
            .replace(INLINE, unmark))
        .join("\n")
        .trim();
}
