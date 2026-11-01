import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { projectHandlers } from "@/test/fixtures";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

describe("The sidebar's counts", () => {
    it("come from one request for the domain", async () => {
        const asked: (string | null)[] = [];
        renderApp("/design/projects", personas.superAdmin,
            http.get("/api/search/counts", ({ request }) => {
                asked.push(new URL(request.url).searchParams.get("domain"));
                return HttpResponse.json({ projects: 4, clients: 3, people: 11 });
            }),
            ...projectHandlers);

        expect(await screen.findByText("4", { selector: ".nav-count" })).toBeInTheDocument();
        expect(screen.getByText("3", { selector: ".nav-count" })).toBeInTheDocument();
        expect(screen.getByText("11", { selector: ".nav-count" })).toBeInTheDocument();
        await waitFor(() => expect(asked).toEqual(["design"]));
    });
});
