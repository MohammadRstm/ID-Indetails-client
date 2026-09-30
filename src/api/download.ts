import { ApiError, toApiError, type ApiErrorBody } from "./errors";
import { http } from "./http";

/*
 * Files, PDFs and CSVs need the access token, so they are fetched as blobs rather than linked to directly
 * (an <img src> or <a href> would answer 401).
 */

/** Fetches a file from the API as a blob, with the name the server gave it. */
export async function fetchBlob(url: string, params?: Record<string, unknown>): Promise<{ blob: Blob; fileName: string | null }> {
    try {
        const response = await http.get<Blob>(url, { params, responseType: "blob" });
        return { blob: response.data, fileName: fileNameOf(response.headers["content-disposition"]) };
    } catch (error) {
        throw await readBlobError(error);
    }
}

/** Downloads a file from the API and saves it. */
export async function downloadFile(url: string, fallbackName: string, params?: Record<string, unknown>): Promise<void> {
    const { blob, fileName } = await fetchBlob(url, params);
    saveBlob(blob, fileName ?? fallbackName);
}

export function saveBlob(blob: Blob, fileName: string) {
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function fileNameOf(disposition: string | undefined): string | null {
    if (!disposition) return null;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (star) return decodeURIComponent(star[1]);
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    return plain ? plain[1] : null;
}

// With responseType "blob", an error body arrives as a Blob too.
async function readBlobError(error: unknown): Promise<ApiError> {
    const apiError = toApiError(error);
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
        try {
            const body = JSON.parse(await data.text()) as ApiErrorBody;
            return new ApiError(apiError.status, body);
        } catch {
            return apiError;
        }
    }
    return apiError;
}
