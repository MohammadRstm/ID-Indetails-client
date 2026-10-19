import { Fragment, type ReactNode } from "react";
import { blocksOf, INLINE, type MdItem } from "./protonText";

/** One line's bold, italic and code, as elements; the rest is text. */
function inline(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    let at = 0;
    for (const m of text.matchAll(INLINE)) {
        const index = m.index ?? 0;
        if (index > at) parts.push(text.slice(at, index));
        const [, bold, boldU, code, italic, italicU] = m;
        const strong = bold ?? boldU;
        if (strong != null) parts.push(<strong key={index}>{inline(strong)}</strong>);
        else if (code != null) parts.push(<code key={index}>{code}</code>);
        else parts.push(<em key={index}>{inline(italic ?? italicU ?? "")}</em>);
        at = index + m[0].length;
    }

    if (at < text.length) parts.push(text.slice(at));
    return parts;
}

function Items({ items }: { items: MdItem[] }) {
    return items.map((item, i) => (
        <li key={i}>
            {inline(item.text)}
            {item.sub.length > 0 && <ul>{item.sub.map((sub, j) => <li key={j}>{inline(sub)}</li>)}</ul>}
        </li>
    ));
}

/** An answer of Proton's, drawn from its markdown as elements, never as HTML. */
export default function ProtonMarkdown({ text }: { text: string }) {
    return (
        <div className="msg-text proton-md" dir="auto">
            {blocksOf(text).map((block, i) => {
                switch (block.kind) {
                    case "h":
                        return <p key={i} className="proton-md-h"><strong>{inline(block.text)}</strong></p>;
                    case "ul":
                        return <ul key={i}><Items items={block.items} /></ul>;
                    case "ol":
                        return <ol key={i} start={block.start === 1 ? undefined : block.start}><Items items={block.items} /></ol>;
                    default:
                        return (
                            <p key={i}>
                                {block.lines.map((line, j) => <Fragment key={j}>{j > 0 && <br />}{inline(line)}</Fragment>)}
                            </p>
                        );
                }
            })}
        </div>
    );
}
