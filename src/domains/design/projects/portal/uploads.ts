import type { QueryClient } from "@tanstack/react-query";
import { toApiError } from "@/api/errors";
import { http } from "@/api/http";
import { applyItem, contentBase, contentKey, refreshIfOutdated, type PortalContentItem, type PortalSection, type PortalUsage } from "./contentApi";

/*
 * The upload queue. It lives outside React, so uploads carry on when the person moves between sections, tabs or
 * pages, and each project's rows are shown again when they come back. A file goes in as one upload on the API:
 * start, links for its parts, each part sent straight to the file storage, then complete.
 */

export const UPLOAD_LIMITS = { files: 2, parts: 3, linkBatch: 100 };
/** Waits in milliseconds, so a test can shorten them: between a part's tries, and how long a finished row stays. */
export const UPLOAD_MS = { retry: [1000, 3000, 9000], done: 2500 };
/** Part links last about an hour; one older than this is asked for again before it is used. */
const LINK_LIFE_MS = 40 * 60_000;
const PART_TIMEOUT_MS = 30 * 60_000;
/** Answers after which sending the file again can't help. */
const FINAL = ["portal_file_content_mismatch", "portal_file_type_not_allowed", "portal_content_read_only", "portal_project_not_eligible"];

export type UploadRow = {
    id: string;
    projectId: number;
    section: PortalSection;
    name: string;
    size: number;
    /** Sending a new file for an existing card. */
    replacing: boolean;
    status: "waiting" | "sending" | "finishing" | "done" | "failed";
    /** Bytes the storage has taken so far. */
    sent: number;
    error: string | null;
    canRetry: boolean;
};

type Started = { uploadId: number; partSize: number; partCount: number };
type Completed = { item: PortalContentItem; usage: PortalUsage };

type Job = {
    id: string;
    queryClient: QueryClient;
    projectId: number;
    section: PortalSection;
    replaceItemId: number | null;
    file: File;
    clientToken: string;
    upload: Started | null;
    /** The parts the storage has confirmed. */
    done: Set<number>;
    /** How much of each part has gone (all of it once confirmed). */
    partBytes: Map<number, number>;
    sent: number;
    links: Map<number, { url: string; at: number }>;
    refreshing: Promise<void> | null;
    /** Stops what is in flight: a cancel, or a part that failed for good. */
    stop: AbortController;
    cancelled: boolean;
};

let rows: UploadRow[] = [];
const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
let running = 0;
let watching = false;

export function subscribeUploads(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const uploadRows = () => rows;

function emit() {
    listeners.forEach((listener) => listener());
}

function update(id: string, change: Partial<UploadRow>) {
    rows = rows.map((row) => (row.id === id ? { ...row, ...change } : row));
    emit();
}

function forget(id: string) {
    jobs.delete(id);
    rows = rows.filter((row) => row.id !== id);
    emit();
}

/** The browser asks before a tab with uploads under way is closed or reloaded. */
function watchLeaving() {
    if (watching) return;
    watching = true;
    window.addEventListener("beforeunload", (event) => {
        if (rows.some((row) => row.status === "waiting" || row.status === "sending" || row.status === "finishing")) event.preventDefault();
    });
}

// ---- what the person does ----

type NewUploads = {
    queryClient: QueryClient;
    projectId: number;
    section: PortalSection;
    files: File[];
    /** The extensions the API accepts; any other file is refused here, before anything is sent. */
    accepted: string[];
    /** Sends the (one) file as the new file of this card. */
    replaceItemId?: number;
};

export function addUploads({ queryClient, projectId, section, files, accepted, replaceItemId }: NewUploads) {
    watchLeaving();
    for (const file of files) {
        const row: UploadRow = {
            id: crypto.randomUUID(), projectId, section, name: file.name, size: file.size, replacing: replaceItemId != null,
            status: "waiting", sent: 0, error: null, canRetry: false,
        };
        const refused = refusal(file, accepted);
        if (refused) {
            rows = [...rows, { ...row, status: "failed", error: refused }];
            continue;
        }
        jobs.set(row.id, {
            id: row.id, queryClient, projectId, section, replaceItemId: replaceItemId ?? null, file, clientToken: crypto.randomUUID(), upload: null,
            done: new Set(), partBytes: new Map(), sent: 0, links: new Map(), refreshing: null, stop: new AbortController(), cancelled: false,
        });
        rows = [...rows, row];
    }
    emit();
    pump();
}

function refusal(file: File, accepted: string[]): string | null {
    if (file.size === 0) return "This file is empty.";
    const dot = file.name.lastIndexOf(".");
    const extension = dot < 0 ? "" : file.name.slice(dot + 1).toLowerCase();
    if (accepted.includes(extension)) return null;
    return `${extension ? `.${extension} files` : "Files without an extension"} can't be added to the client portal.`;
}

/** Tries a failed file again: what the storage already has is not sent twice. */
export function retryUpload(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row || row.status !== "failed" || !row.canRetry || !jobs.has(id)) return;
    update(id, { status: "waiting", error: null });
    pump();
}

/** Stops a file and takes it off the list; what the API holds for it is removed (and if that fails, it clears itself). */
export function cancelUpload(id: string) {
    const job = jobs.get(id);
    if (!job) return;
    const finishing = rows.find((row) => row.id === id)?.status === "finishing";
    job.cancelled = true;
    job.stop.abort();
    forget(id);
    if (job.upload) {
        // a cancel that came as the file was being completed may have come too late: the drafts are loaded again
        void endOnServer(job).then(() => {
            if (finishing) void job.queryClient.invalidateQueries({ queryKey: contentKey(job.projectId) });
        });
    }
}

/** Takes a failed file (or a refused one) off the list. */
export function dismissUpload(id: string) {
    const job = jobs.get(id);
    forget(id);
    if (job?.upload) void endOnServer(job);
}

/** Stops everything and empties the list (tests). */
export function resetUploads() {
    for (const job of jobs.values()) {
        job.cancelled = true;
        job.stop.abort();
    }
    jobs.clear();
    rows = [];
    emit();
}

// ---- the work ----

function pump() {
    while (running < UPLOAD_LIMITS.files) {
        const next = rows.find((row) => row.status === "waiting" && jobs.has(row.id));
        if (!next) return;
        running++;
        update(next.id, { status: "sending" });
        void run(jobs.get(next.id)!);
    }
}

async function run(job: Job) {
    job.stop = new AbortController();
    update(job.id, { sent: job.sent });
    try {
        let fresh = false;
        for (;;) {
            try {
                if (!job.upload) await start(job);
                if (job.cancelled) {
                    // cancelled while the upload was being made: it exists now, and is removed
                    await endOnServer(job);
                    return;
                }
                await sendParts(job);
                await finish(job);
                return;
            } catch (error) {
                // an upload that ended on the server (expired, refused) is made again from the start, once
                if (job.cancelled || fresh || toApiError(error).code !== "portal_upload_ended") throw error;
                fresh = true;
                restart(job);
            }
        }
    } catch (error) {
        if (!job.cancelled) fail(job, error);
    } finally {
        running--;
        pump();
    }
}

function restart(job: Job) {
    job.upload = null;
    job.clientToken = crypto.randomUUID();
    job.done.clear();
    job.partBytes.clear();
    job.links.clear();
    job.sent = 0;
    job.stop = new AbortController();
    update(job.id, { status: "sending", sent: 0 });
}

async function start(job: Job) {
    const { data } = await call(job, () =>
        http.post<Started>(`${contentBase(job.projectId)}/uploads`, {
            clientToken: job.clientToken, section: job.section, fileName: job.file.name, size: job.file.size, replaceItemId: job.replaceItemId,
        }));
    job.upload = data;
}

const pending = (job: Job) => Array.from({ length: job.upload!.partCount }, (_, i) => i + 1).filter((n) => !job.done.has(n));

async function sendParts(job: Job) {
    const todo = pending(job);
    if (todo.length === 0) return;
    await linkParts(job, todo);
    let next = 0;
    const worker = async () => {
        while (next < todo.length) await sendPart(job, todo[next++]);
    };
    try {
        await Promise.all(Array.from({ length: Math.min(UPLOAD_LIMITS.parts, todo.length) }, worker));
    } catch (error) {
        // a part that failed for good fails the file: the parts still on their way are stopped
        job.stop.abort();
        throw error;
    }
}

/** Asks for the links of some parts, a batch at a time. */
async function linkParts(job: Job, numbers: number[]) {
    for (let i = 0; i < numbers.length; i += UPLOAD_LIMITS.linkBatch) {
        const { data } = await call(job, () =>
            http.post<{ parts: { partNumber: number; url: string }[] }>(
                `${contentBase(job.projectId)}/uploads/${job.upload!.uploadId}/parts`,
                { partNumbers: numbers.slice(i, i + UPLOAD_LIMITS.linkBatch) },
                { signal: job.stop.signal },
            ));
        for (const part of data.parts) job.links.set(part.partNumber, { url: part.url, at: Date.now() });
    }
}

/** New links for a part and the ones after it; parts waiting on the same answer share one request. */
function refreshLinks(job: Job, part: number): Promise<void> {
    job.refreshing ??= linkParts(job, [part, ...pending(job).filter((n) => n !== part)].slice(0, UPLOAD_LIMITS.linkBatch))
        .finally(() => { job.refreshing = null; });
    return job.refreshing;
}

async function sendPart(job: Job, part: number) {
    const { partSize } = job.upload!;
    const body = job.file.slice((part - 1) * partSize, Math.min(part * partSize, job.file.size));
    let failures = 0;
    let throttled = 0;
    for (;;) {
        for (let asked = 0; !hasLink(job, part); asked++) {
            if (asked > 1) throw new Error(`The API gave no link for part ${part}.`);
            await refreshLinks(job, part);
        }
        try {
            await put(job, part, job.links.get(part)!.url, body);
            job.done.add(part);
            progress(job, part, body.size);
            return;
        } catch (error) {
            if (job.stop.signal.aborted) throw error;
            progress(job, part, 0);
            const status = error instanceof PartFailed ? error.status : 0;
            if (status === 429) {
                // asked to slow down: that alone never fails the file
                await sleep(backoff(throttled++), job.stop.signal);
                continue;
            }
            if (failures >= UPLOAD_MS.retry.length) throw error;
            await sleep(UPLOAD_MS.retry[failures++], job.stop.signal);
            // a link the storage no longer accepts: ask for new ones
            if (status === 403) job.links.delete(part);
        }
    }
}

function hasLink(job: Job, part: number) {
    const link = job.links.get(part);
    return link != null && Date.now() - link.at <= LINK_LIFE_MS;
}

class PartFailed extends Error {
    status: number;
    constructor(status: number, part: number) {
        super(status === 0 ? `The connection dropped while sending part ${part}.` : `The file storage refused part ${part} (${status}).`);
        this.status = status;
    }
}

/**
 * One part, sent to the file storage with a plain request: no sign-in header (the link itself is the permission, and
 * the staff token must never reach another site) and no content type.
 */
function put(job: Job, part: number, url: string, body: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
        const { signal } = job.stop;
        if (signal.aborted) return reject(new PartFailed(-1, part));
        const xhr = new XMLHttpRequest();
        // stopped by us: the answer doesn't wait for the browser's own "abort" event
        const abort = () => {
            xhr.abort();
            settle(new PartFailed(-1, part));
        };
        signal.addEventListener("abort", abort, { once: true });
        const settle = (error?: PartFailed) => {
            signal.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve();
        };
        xhr.upload.onprogress = (event) => progress(job, part, Math.min(event.loaded, body.size));
        xhr.onload = () => settle(xhr.status >= 200 && xhr.status < 300 ? undefined : new PartFailed(xhr.status, part));
        xhr.onerror = () => settle(new PartFailed(0, part));
        xhr.ontimeout = () => settle(new PartFailed(0, part));
        xhr.onabort = () => settle(new PartFailed(-1, part));
        xhr.open("PUT", url);
        xhr.timeout = PART_TIMEOUT_MS;
        xhr.send(body);
    });
}

const percent = (sent: number, size: number) => Math.floor((sent / size) * 100);

function progress(job: Job, part: number, bytes: number) {
    job.sent += bytes - (job.partBytes.get(part) ?? 0);
    job.partBytes.set(part, bytes);
    const row = rows.find((r) => r.id === job.id);
    if (row && percent(job.sent, row.size) !== percent(row.sent, row.size)) update(job.id, { sent: job.sent });
}

async function finish(job: Job) {
    update(job.id, { status: "finishing" });
    for (let tries = 0; ; tries++) {
        try {
            const { data } = await call(job, () =>
                http.post<Completed>(`${contentBase(job.projectId)}/uploads/${job.upload!.uploadId}/complete`, undefined, { signal: job.stop.signal }));
            succeed(job, data);
            return;
        } catch (error) {
            if (toApiError(error).code !== "portal_upload_incomplete") throw error;
            if (tries > 0) {
                // still not whole: nothing is trusted any more, and a retry sends every part again
                job.done.clear();
                job.partBytes.clear();
                job.sent = 0;
                throw error;
            }
            // the parts not confirmed are sent again, once
            await sleep(backoff(0), job.stop.signal);
            update(job.id, { status: "sending" });
            await sendParts(job);
            update(job.id, { status: "finishing" });
        }
    }
}

function succeed(job: Job, { item, usage }: Completed) {
    if (job.cancelled) return;
    applyItem(job.queryClient, job.projectId, item, usage);
    jobs.delete(job.id);
    update(job.id, { status: "done", sent: job.file.size, error: null });
    setTimeout(() => forget(job.id), UPLOAD_MS.done);
}

function fail(job: Job, error: unknown) {
    const { code, message } = toApiError(error);
    // the API removed a file whose bytes weren't what its name said
    if (code === "portal_file_content_mismatch") job.upload = null;
    update(job.id, { status: "failed", error: message, canRetry: !FINAL.includes(code) });
    refreshIfOutdated(job.queryClient, job.projectId, error);
}

/** Tells the API the file is not coming. A failure is ignored: whatever it holds for an upload clears itself. */
async function endOnServer(job: Job) {
    const uploadId = job.upload?.uploadId;
    if (uploadId == null) return;
    for (let n = 0; n <= UPLOAD_MS.retry.length; n++) {
        try {
            await http.delete(`${contentBase(job.projectId)}/uploads/${uploadId}`);
            return;
        } catch (error) {
            if (toApiError(error).status !== 429 || n === UPLOAD_MS.retry.length) return;
            await new Promise((resolve) => setTimeout(resolve, backoff(n)));
        }
    }
}

// ---- waiting ----

const backoff = (n: number) => UPLOAD_MS.retry[Math.min(n, UPLOAD_MS.retry.length - 1)];

/** Waits, and gives up at once when the upload is stopped. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new Error("The upload was stopped."));
        const stop = () => {
            clearTimeout(timer);
            reject(new Error("The upload was stopped."));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", stop);
            resolve();
        }, ms);
        signal.addEventListener("abort", stop, { once: true });
    });
}

/** An API call of the flow. Asked to slow down (429), it waits and asks again, for as long as it takes. */
async function call<T>(job: Job, request: () => Promise<T>): Promise<T> {
    for (let n = 0; ; n++) {
        try {
            return await request();
        } catch (error) {
            if (toApiError(error).status !== 429) throw error;
            await sleep(backoff(n), job.stop.signal);
        }
    }
}
