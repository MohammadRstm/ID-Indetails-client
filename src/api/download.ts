import { http } from "./http";

/*
 * Files, PDFs and CSVs need the access token, so they are fetched as blobs rather than linked to directly
 * (an <img src> or <a href> would answer 401).
 */

/** Fetches a file from the API as a blob, with the name the server gave it. */
export async function fetchBlob(url: string, params?: Record<string, unknown>): Promise<{ blob: Blob; fileName: string | null }> {
    // a failure is already an ApiError with the server's message (the http client reads a Blob error body)
    const response = await http.get<Blob>(url, { params, responseType: "blob" });
    return { blob: response.data, fileName: fileNameOf(response.headers["content-disposition"]) };
}

/** Downloads a file from the API and saves it. */
export async function downloadFile(url: string, fallbackName: string, params?: Record<string, unknown>): Promise<void> {
    const { blob, fileName } = await fetchBlob(url, params);
    saveBlob(blob, fileName ?? fallbackName);
}

/**
 * Prints a PDF from the API. It is fetched as a blob (the token is needed) and loaded into a hidden frame, which is
 * printed once it has loaded. Phones and tablets can't print from a frame, so there the PDF opens in a new tab to be
 * printed or shared from the viewer; if the browser blocks that tab, the file is saved instead.
 */
export async function printFile(url: string, params?: Record<string, unknown>, fallbackName = "document.pdf"): Promise<void> {
    const { blob, fileName } = await fetchBlob(url, params);
    const objectUrl = URL.createObjectURL(blob);
    if (canPrintFromFrame() && (await printInFrame(objectUrl))) return;
    if (!window.open(objectUrl, "_blank")) saveBlob(blob, fileName ?? fallbackName);
    // the new tab needs the address for longer than a download does
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Touch devices (and every browser on iOS) can't print a frame's content. */
function canPrintFromFrame(): boolean {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    return !ios && !window.matchMedia?.("(pointer: coarse)").matches;
}

/**
 * Loads the PDF in a hidden frame and prints it, then removes the frame and the address when printing ends (or a
 * minute later). Answers false, leaving the address alone, when the browser would not print it.
 */
function printInFrame(objectUrl: string): Promise<boolean> {
    return new Promise(resolve => {
        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
        let cleaned = false;
        const clean = () => {
            if (cleaned) return;
            cleaned = true;
            frame.remove();
            URL.revokeObjectURL(objectUrl);
        };
        frame.onload = () => {
            try {
                const printing = frame.contentWindow;
                if (!printing) throw new Error("The frame has no window");
                printing.addEventListener("afterprint", clean);
                printing.focus();
                printing.print();
            } catch {
                frame.remove();
                resolve(false);
                return;
            }
            setTimeout(clean, 60_000);
            resolve(true);
        };
        frame.src = objectUrl;
        document.body.appendChild(frame);
    });
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
