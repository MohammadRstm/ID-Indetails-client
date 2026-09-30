import { useCallback, useState } from "react";
import type { ZodType } from "zod";
import { toApiError } from "@/api/errors";

export type FormErrors<T> = Partial<Record<keyof T | "form", string>>;

/**
 * A form's values and errors. `validate` checks the zod schema before anything is sent; `fail` puts what the
 * API answered next to the right field, or, when it concerns no field, in `errors.form`.
 */
export function useForm<T extends Record<string, unknown>>(initial: T, schema?: ZodType<T>) {
    const [values, setValues] = useState<T>(initial);
    const [errors, setErrors] = useState<FormErrors<T>>({});

    const set = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
        setValues((current) => ({ ...current, [name]: value }));
        // Typing again clears that field's error and the form's.
        setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
    }, []);

    const validate = useCallback((): boolean => {
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

    return { values, set, errors, setErrors, validate, fail };
}
