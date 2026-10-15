import { http, HttpResponse, type RequestHandler } from "msw";
import type { PortalContentFile } from "./contentApi";
import type { FileComment, ProjectFile, ProjectFiles } from "./filesApi";
import { page, person, projectId, usageOf } from "./portalTestKit";

/*
 * What the Project files tab's tests share: the API's shapes as small builders, a mock of the files endpoint that a
 * test can change as the files change, and mocks of an upload and of a file's comments.
 */

/** The Project files tab, opened on one of its sections. */
export const filesPart = (name: string) => `${page}?tab=files&part=${name}`;
export const filesBase = "/api/projects/:id/files";
export const sarahRef = { id: 4, name: "Sarah Haddad" };

/**
 * A file of the project; unless a test says otherwise it is in Presentation, not for the client and never published,
 * the person's to change, without comments, and can be the hero when it is a JPG, PNG or WebP image.
 */
export const projectFileOf = (id: number, title: string, file: PortalContentFile, over: Partial<ProjectFile> = {}): ProjectFile => {
    const shown = file.preview === "image" || file.preview === "video";
    return {
        id, section: "presentation", title, sortOrder: id, isHero: false,
        canBeHero: file.preview === "image" && /\.(jpe?g|png|webp)$/i.test(file.name), file,
        previewUrl: shown ? `/api/content-store/previews/${file.id}` : null,
        previewUrlExpiresAt: shown ? "2026-09-30T10:00:00Z" : null,
        createdAt: "2026-09-29T10:00:00Z", updatedAt: "2026-09-29T10:00:00Z", updatedBy: person, uploadedBy: file.uploadedBy,
        forClient: false, removed: false, canEdit: true, comments: { total: 0, open: 0 }, clientState: null,
        ...over,
    };
};

/** The project's files as the API answers them, to a project_files:manage holder on a client project unless a test says otherwise. */
export const filesOf = (items: ProjectFile[], over: Partial<ProjectFiles> = {}): ProjectFiles => ({
    projectId, storageReady: true, canEdit: true, readOnlyReason: null, canManage: true, canChooseForClient: false, isClientProject: true,
    usage: usageOf(items.length, items.length * 2), acceptedExtensions: ["jpg", "jpeg", "png", "pdf", "mp4"], items,
    ...over,
});

export const servedFiles = (files: ProjectFiles) => http.get(filesBase, () => HttpResponse.json(files));

/** The files endpoint answering what `box.files` holds now, and counting how often it was asked: a test changes the files as the API would. */
export function liveFiles(initial: ProjectFiles) {
    const box = { files: initial, gets: 0 };
    return { box, handler: http.get(filesBase, () => { box.gets++; return HttpResponse.json(box.files); }) };
}

/** How the mock upload answers; a test changes one of them. */
type Answers = {
    start: () => Response;
    /** null: the usual links. */
    parts: () => Response | null;
    put: (part: string, attempt: number) => Response | Promise<Response>;
    complete: (attempt: number) => Response;
};

/** The mock of one upload on the project's files: two parts of four bytes, sent to relative part links. */
export function uploadApi(uploaded: ProjectFile | null, usage = usageOf(1, 2)) {
    const log = {
        started: [] as Record<string, unknown>[],
        asked: [] as number[][],
        puts: [] as { part: string; attempt: number; authorization: string | null }[],
        completes: 0,
        deleted: [] as string[],
    };
    const attempts = new Map<string, number>();
    const api: Answers & { log: typeof log; handlers: RequestHandler[] } = {
        log,
        start: () => HttpResponse.json({ uploadId: 7, partSize: 4, partCount: 2 }, { status: 201 }),
        parts: () => null,
        put: () => new HttpResponse(null, { status: 200 }),
        complete: () => HttpResponse.json({ item: uploaded, usage }),
        handlers: [],
    };
    api.handlers = [
        http.post(`${filesBase}/uploads`, async ({ request }) => {
            log.started.push({ ...((await request.json()) as Record<string, unknown>), authorization: request.headers.get("authorization") });
            return api.start();
        }),
        http.post(`${filesBase}/uploads/:uploadId/parts`, async ({ request }) => {
            const { partNumbers } = (await request.json()) as { partNumbers: number[] };
            log.asked.push(partNumbers);
            return api.parts() ?? HttpResponse.json({
                parts: partNumbers.map((n) => ({ partNumber: n, url: `/api/content-store/parts/p${n}` })),
                expiresAt: "2026-09-30T10:00:00Z",
            });
        }),
        http.put("/api/content-store/parts/:part", ({ request, params }) => {
            const name = String(params.part);
            const attempt = (attempts.get(name) ?? 0) + 1;
            attempts.set(name, attempt);
            log.puts.push({ part: name, attempt, authorization: request.headers.get("authorization") });
            return api.put(name, attempt);
        }),
        http.post(`${filesBase}/uploads/:uploadId/complete`, () => api.complete(++log.completes)),
        http.delete(`${filesBase}/uploads/:uploadId`, ({ params }) => {
            log.deleted.push(String(params.uploadId));
            return new HttpResponse(null, { status: 204 });
        }),
    ];
    return api;
}

/** A comment on file 5, written an hour before the tests' "now" by Nadia, unless a test says otherwise. Nothing is the reader's to change. */
export const commentOf = (id: number, body: string, over: Partial<FileComment> = {}): FileComment => ({
    id, itemId: 5, author: person, body, createdAt: "2026-09-30T08:00:00Z", editedAt: null, fixedAt: null, fixedBy: null,
    canEdit: false, canDelete: false, canFix: false, ...over,
});

/**
 * The mock of a file's comments: it holds them in `box.comments`, keeps what it was sent, and answers as the API is
 * meant to. What the reader writes is theirs (`author`) to edit and delete.
 */
export function commentsApi(initial: FileComment[], author = person) {
    const box = { comments: initial, sent: [] as { what: string; body: unknown }[] };
    let next = 100;
    const replace = (id: number, change: Partial<FileComment>) => {
        box.comments = box.comments.map((c) => (c.id === id ? { ...c, ...change } : c));
        return HttpResponse.json(box.comments.find((c) => c.id === id));
    };
    const handlers = [
        http.get(`${filesBase}/items/:itemId/comments`, () => HttpResponse.json(box.comments)),
        http.post(`${filesBase}/items/:itemId/comments`, async ({ request, params }) => {
            const body = (await request.json()) as { body: string };
            box.sent.push({ what: `post ${String(params.itemId)}`, body });
            const comment = commentOf(next++, body.body, { itemId: Number(params.itemId), author, createdAt: "2026-09-30T09:00:00Z", canEdit: true, canDelete: true });
            box.comments = [...box.comments, comment];
            return HttpResponse.json(comment);
        }),
        http.put(`${filesBase}/comments/:commentId/fixed`, async ({ request, params }) => {
            const body = (await request.json()) as { fixed: boolean };
            box.sent.push({ what: `fixed ${String(params.commentId)}`, body });
            return replace(Number(params.commentId), body.fixed ? { fixedAt: "2026-09-30T09:00:00Z", fixedBy: author } : { fixedAt: null, fixedBy: null });
        }),
        http.put(`${filesBase}/comments/:commentId`, async ({ request, params }) => {
            const body = (await request.json()) as { body: string };
            box.sent.push({ what: `edit ${String(params.commentId)}`, body });
            return replace(Number(params.commentId), { body: body.body, editedAt: "2026-09-30T09:00:00Z" });
        }),
        http.delete(`${filesBase}/comments/:commentId`, ({ params }) => {
            box.sent.push({ what: `delete ${String(params.commentId)}`, body: null });
            box.comments = box.comments.filter((c) => c.id !== Number(params.commentId));
            return new HttpResponse(null, { status: 204 });
        }),
    ];
    return { box, handlers };
}
