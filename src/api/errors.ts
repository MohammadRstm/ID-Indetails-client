import axios from "axios";

/** The API's uniform error body: every failure has this shape. */
export type ApiErrorBody = {
    type: string;
    code: string;
    message: string;
    errors: Record<string, string[]> | null;
    /** For profit_floor: the refused change, kept so whoever sees the project's money can force it through. */
    blockedChangeId?: number | null;
    traceId?: string;
};

export class ApiError extends Error {
    readonly status: number;
    readonly type: string;
    readonly code: string;
    readonly fieldErrors: Record<string, string>;
    readonly blockedChangeId: number | null;
    /** The request's trace id: every line the API logged for it carries it. */
    readonly traceId: string | null;

    constructor(status: number, body: Partial<ApiErrorBody>) {
        super(body.message || defaultMessage(status));
        this.name = "ApiError";
        this.status = status;
        this.type = body.type || "unexpected";
        this.code = body.code || "internal_error";
        this.fieldErrors = firstErrors(body.errors);
        this.blockedChangeId = body.blockedChangeId ?? null;
        this.traceId = body.traceId ?? null;
    }

    get isNetwork() {
        return this.status === 0;
    }

    /**
     * What a person can quote for an unexpected failure on the server's side, to find it in the log. Null for any
     * other failure: their own mistakes, and outages the message already explains (a 503 "unavailable").
     */
    get ref(): string | null {
        return this.status >= 500 && this.type === "unexpected" && this.traceId ? refOf(this.traceId) : null;
    }
}

/** The part of a trace id a person can read out: the first 8 characters of a W3C trace id, otherwise the whole id. */
export function refOf(traceId: string): string {
    const w3c = /^[0-9a-f]{2}-([0-9a-f]{32})-/.exec(traceId);
    return w3c ? w3c[1].slice(0, 8) : traceId;
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

/** The message to show for a failure; one on the server's side ends with its reference, "(ref 4bf92f35)". */
export function errorMessage(error: unknown): string {
    const apiError = toApiError(error);
    return apiError.ref ? `${apiError.message} (ref ${apiError.ref})` : apiError.message;
}

export function isStatus(error: unknown, status: number): boolean {
    return error != null && toApiError(error).status === status;
}
