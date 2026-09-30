import axios from "axios";

/** The API's uniform error body: every failure has this shape. */
export type ApiErrorBody = {
    type: string;
    code: string;
    message: string;
    errors: Record<string, string[]> | null;
    traceId?: string;
};

export class ApiError extends Error {
    readonly status: number;
    readonly type: string;
    readonly code: string;
    readonly fieldErrors: Record<string, string>;

    constructor(status: number, body: Partial<ApiErrorBody>) {
        super(body.message || defaultMessage(status));
        this.name = "ApiError";
        this.status = status;
        this.type = body.type || "unexpected";
        this.code = body.code || "internal_error";
        this.fieldErrors = firstErrors(body.errors);
    }

    get isNetwork() {
        return this.status === 0;
    }
}

function defaultMessage(status: number): string {
    if (status === 0) return "The server can't be reached. Check your connection and try again.";
    if (status === 401) return "Please sign in again.";
    if (status === 403) return "You don't have access to this.";
    if (status === 404) return "This couldn't be found.";
    if (status === 429) return "Too many requests. Wait a moment and try again.";
    return "Something went wrong. Please try again.";
}

/**
 * Field errors keyed the way forms name their fields. The API sends camelCase paths ("contacts[0].value");
 * malformed JSON comes as "$.startedAt", and errors about the whole request as "request".
 */
function firstErrors(errors: Record<string, string[]> | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!errors) return out;
    for (const [key, messages] of Object.entries(errors)) {
        const field = key.replace(/^\$\.?/, "");
        const name = field.charAt(0).toLowerCase() + field.slice(1);
        if (messages?.length && !out[name]) out[name] = messages[0];
    }
    return out;
}

/** Any failure from a request, as an ApiError. */
export function toApiError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (axios.isAxiosError(error)) {
        if (!error.response) return new ApiError(0, {});
        const data = error.response.data;
        const body = data && typeof data === "object" && "code" in data ? (data as ApiErrorBody) : {};
        return new ApiError(error.response.status, body);
    }
    return new ApiError(-1, { message: error instanceof Error ? error.message : undefined });
}

/** The message to show for a failure. */
export function errorMessage(error: unknown): string {
    return toApiError(error).message;
}

export function isStatus(error: unknown, status: number): boolean {
    return error != null && toApiError(error).status === status;
}
