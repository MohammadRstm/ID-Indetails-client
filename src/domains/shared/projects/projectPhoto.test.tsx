import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const project = fixtures.project;
const uploaded = { id: 60, name: "villa.webp", mimeType: "image/webp", kind: "image", sizeBytes: 10, createdAt: "2026-09-30T09:00:00Z" };

/** The photo calls: the upload, setting it on the project and taking it off, with what each was sent. */
function photoApi(photoFileId: number | null = null) {
    const calls: { call: string; body?: unknown }[] = [];
    const handlers = [
        http.get(`/api/projects/${project.id}`, () => HttpResponse.json({ ...project, photoFileId })),
        http.post("/api/files", () => { calls.push({ call: "upload" }); return HttpResponse.json(uploaded, { status: 201 }); }),
        http.get("/api/files/:id", () => new HttpResponse(new Blob(["x"], { type: "image/webp" }))),
        http.put(`/api/projects/${project.id}/photo`, async ({ request }) => {
            const body = await request.json();
            calls.push({ call: "PUT", body });
            photoFileId = (body as { fileId: number }).fileId;
            return HttpResponse.json({ ...project, photoFileId });
        }),
        http.delete(`/api/projects/${project.id}/photo`, () => {
            calls.push({ call: "DELETE" });
            photoFileId = null;
            return HttpResponse.json({ ...project, photoFileId });
        }),
    ];
    return { calls, handlers };
}

describe("a project's photo", () => {
    // files are shown from object URLs, which the test browser doesn't make
    beforeEach(() => { URL.createObjectURL = vi.fn(() => "blob:photo"); });

    it("is chosen from the device on the project's page and set on the project", async () => {
        const api = photoApi();
        renderApp(`/design/projects/${project.id}`, admin, ...api.handlers, ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Project photo" }));
        // no photo yet: there is nothing to take off
        expect(screen.queryByRole("button", { name: "Take the photo off" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Choose a photo" }));
        await userEvent.upload(screen.getByLabelText("Project photo file"), new File(["x"], "villa.jpg", { type: "image/jpeg" }));
        await waitFor(() => expect(api.calls).toEqual([{ call: "upload" }, { call: "PUT", body: { fileId: 60 } }]));
        expect(await screen.findByText("Photo changed")).toBeInTheDocument();
    });

    it("shows instead of the icon tile, and can be taken off", async () => {
        const api = photoApi(60);
        renderApp(`/design/projects/${project.id}`, admin, ...api.handlers, ...projectHandlers);
        const button = await screen.findByRole("button", { name: "Project photo" });
        await waitFor(() => expect(button.querySelector(".ptile-photo img")).not.toBeNull());
        await userEvent.click(button);
        expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Take the photo off" }));
        await waitFor(() => expect(api.calls).toEqual([{ call: "DELETE" }]));
        expect(await screen.findByText("Photo taken off")).toBeInTheDocument();
    });

    it("is only changed by whoever edits projects: an employee sees the tile alone", async () => {
        const api = photoApi(60);
        renderApp(`/design/projects/${project.id}`, personas.designEmployee, ...api.handlers, ...projectHandlers);
        expect(await screen.findByRole("heading", { name: project.title })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Project photo" })).not.toBeInTheDocument();
    });
});
