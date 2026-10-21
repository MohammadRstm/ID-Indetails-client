import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
    value: string;
    /** Rows it starts at, empty or short. */
    minRows?: number;
    /** Rows it grows to as it is typed in; past them it scrolls. */
    maxRows?: number;
};

/**
 * A text box that grows a row at a time as it is typed in, from minRows up to maxRows, then scrolls. It only grows
 * down: it keeps its width, and long words and links wrap, so it never widens the form or window it sits in.
 */
export default function AutoGrowTextarea({ value, minRows = 4, maxRows = 25, className, style, ...rest }: Props) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const box = ref.current;
        if (!box) return;
        const css = getComputedStyle(box);
        const line = parseFloat(css.lineHeight) || 20;
        const frame = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
        box.style.height = "auto";
        const wanted = Math.min(Math.max(box.scrollHeight + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth), minRows * line + frame), maxRows * line + frame);
        box.style.height = `${wanted}px`;
        box.style.overflowY = box.scrollHeight + frame > maxRows * line + frame + 1 ? "auto" : "hidden";
    }, [value, minRows, maxRows]);

    return (
        <textarea ref={ref} rows={minRows} value={value} className={className ? `${className} autogrow` : "autogrow"} style={style} {...rest} />
    );
}
