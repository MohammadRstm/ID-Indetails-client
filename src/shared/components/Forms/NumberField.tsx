import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { fitNumber, upTo, type NumberShape } from "@/shared/format/limits";
import { cx } from "@/shared/utils/cx";
import { FieldError } from "./Field";

type NumberFieldProps = {
    value: string | number;
    /** The text typed, once it fits the shape. */
    onChange: (text: string) => void;
    shape: NumberShape;
    id?: string;
    "aria-label"?: string;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
    disabled?: boolean;
    /** Row and column, for grids that move between fields with Enter. */
    r?: number;
    c?: number;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * A number typed into a box: workers, a rate, a percentage. It takes no more digits, decimals or size than its
 * shape allows, so nothing too large for the API is ever sent, and says so under itself when a key is refused.
 */
export default function NumberField({ value, onChange, shape, className, r, c, ...rest }: NumberFieldProps) {
    // the text as typed, so "12." stays while 12 is handed up; a different number set from outside replaces it
    const [text, setText] = useState(String(value));
    const [last, setLast] = useState(value);
    if (value !== last) {
        setLast(value);
        if (value === "" ? text !== "" : Number(text) !== Number(value)) setText(String(value));
    }
    const [refused, setRefused] = useState(false);

    return (
        <>
            <input {...rest} className={cx("input mono", className)} inputMode={shape.decimals ? "decimal" : "numeric"} value={text}
                data-r={r} data-c={c} onBlur={() => setRefused(false)}
                onChange={(e) => {
                    const next = fitNumber(e.target.value, shape, text);
                    setRefused(next == null);
                    if (next == null) return;
                    setText(next);
                    onChange(next);
                }} />
            {refused && <FieldError message={upTo(shape)} />}
        </>
    );
}
