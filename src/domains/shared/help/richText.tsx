import { Fragment, type ReactNode } from "react";

/** **bold** in Help's text, drawn as bold; nothing else is markup, and nothing becomes HTML. */
export function rich(text: string): ReactNode {
    return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>));
}
