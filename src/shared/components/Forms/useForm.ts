import { useCallback, useState } from "react";
import type { ZodType } from "zod";
import { toApiError } from "@/api/errors";

export type FormErrors<T> = Partial<Record<keyof T | "form", string>>;

/**
 * A form's values and errors. `validate` checks the zod schema before anything is sent; `fail` puts what the
 * API answered next to the right field, or, when it concerns no field, in `errors.form`.
 *
 * A form that shows its errors as they happen gives each field `onBlur={form.touch("name")}` and shows `form.error("name")`:
 * a field's error once someone has left it, and every field's once they have tried to submit, following the typing.
 */
export function useForm<T extends Record<string, unknown>>(initial: T, schema?: ZodType<T>) {
    const [values, setValues] = useState<T>(initial);
    const [errors, setErrors] = useState<FormErrors<T>>({});
    // for `error`: the fields left once, and whether a submit was tried
    const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
    const [tried, setTried] = useState(false);

    const set = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
        setValues((current) => ({ ...current, [name]: value }));
        // Typing again clears that field's error and the form's.
        setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
    }, []);

    const validate = useCallback((): boolean => {
        setTried(true);
        if (!schema) return true;
        const result = schema.safeParse(values);
        if (result.success) return true;
        const next: FormErrors<T> = {};
        for (const issue of result.error.issues) {
            const key = String(issue.path[0] ?? "form") as keyof T | "form";
            next[key] ??= issue.message;
        }
        setErrors(next);
        return false;
    }, [schema, values]);

    const fail = useCallback((error: unknown) => {
        const apiError = toApiError(error);
        const next: FormErrors<T> = {};
        for (const [field, message] of Object.entries(apiError.fieldErrors)) {
            if (field in initial) next[field as keyof T] = message;
        }
        if (Object.keys(next).length === 0) next.form = apiError.message;
        setErrors(next);
    }, [initial]);

    /** An onBlur for a field: from then on `error` shows what is wrong with it. */
    const touch = useCallback((name: keyof T) => () => setTouched((current) => (current[name] ? current : { ...current, [name]: true })), []);

    /** The error to show next to a field: what the last submit or the API said, else, once it was left, what the schema says of it now. */
    function error(name: keyof T): string | undefined {
        if (errors[name]) return errors[name];
        if (!schema || !(tried || touched[name])) return undefined;
        const result = schema.safeParse(values);
        return result.success ? undefined : result.error.issues.find((issue) => issue.path[0] === name)?.message;
    }

    return { values, set, errors, setErrors, validate, fail, touch, error };
}
