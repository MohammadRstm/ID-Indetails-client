import type { ReactNode } from "react";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

type FieldProps = {
    id: string;
    label: ReactNode;
    error?: string;
    hint?: ReactNode;
    /** Marks the label with a star; an optional field says so in its placeholder instead. */
    required?: boolean;
    children: ReactNode;
};

/** A labelled form field in the prototype's .field layout, with its error or hint underneath. */
export default function Field({ id, label, error, hint, required, children }: FieldProps) {
    return (
        <div className="field">
            <label className={cx("label", required && "required")} htmlFor={id}>{label}</label>
            {children}
            {error ? <FieldError message={error} /> : hint ? <div className="hint">{hint}</div> : null}
        </div>
    );
}

/** A small error line in the prototype's .err style. */
export function FieldError({ message }: { message: string | undefined }) {
    if (!message) return null;
    return (
        <div className="err" role="alert">
            <Icon name="alert" />
            <span>{message}</span>
        </div>
    );
}
