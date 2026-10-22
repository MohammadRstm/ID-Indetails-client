import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { uploadAll } from "@/shared/files/upload";

export type WebsiteProject = Schemas["WebsiteProjectResponse"];
export type WebsiteProjects = Schemas["WebsiteProjectsResponse"];
export type WebsiteContent = Schemas["WebsiteContentResponse"];
export type WebsiteProjectBody = Schemas["WebsiteProjectRequest"];
export type LinkCandidate = Schemas["WebsiteLinkCandidateResponse"];
/** What the website shows; the API never sends null for a system project's status (the schema shares the nullable enum). */
export type WebsiteStatus = "in_progress" | "completed";

/** The website's moving strip shows at most this many projects (the API says so too, as conveyorLimit). */
export const CONVEYOR_LIMIT = 20;

export const STATUS_LABEL: Record<WebsiteStatus, string> = { in_progress: "In progress", completed: "Completed" };

const projectsKey = ["website", "projects"] as const;
const contentKey = ["website", "content"] as const;

/** Every website project, published or not, newest first (website:view or website:manage). */
export function useWebsiteProjects() {
    return useQuery({ queryKey: projectsKey, queryFn: async () => (await http.get<WebsiteProjects>("/website/projects")).data });
}

/** Services, locations, social links, the contact email and the favicon (website:view or website:manage). */
export function useWebsiteContent() {
    return useQuery({ queryKey: contentKey, queryFn: async () => (await http.get<WebsiteContent>("/website/content")).data });
}

/** System projects of both businesses to show on the website, matching what was typed (website:manage). */
export function useLinkCandidates(search: string, enabled: boolean) {
    return useQuery({
        queryKey: ["website", "candidates", search],
        queryFn: async () => (await http.get<LinkCandidate[]>("/website/link-candidates", { params: { search: search || undefined } })).data,
        enabled,
        staleTime: 30_000,
    });
}

export type WebsiteCountry = Schemas["WebsiteCountryResponse"];
export type WebsiteCity = Schemas["WebsiteCityResponse"];
export type WebsiteCityElsewhere = Schemas["WebsiteCityElsewhereResponse"];

/** The countries a place is chosen from; they never change while the page is open. */
export function useCountries() {
    return useQuery({
        queryKey: ["website", "places", "countries"],
        queryFn: async () => (await http.get<WebsiteCountry[]>("/website/places/countries")).data,
        staleTime: Infinity,
    });
}

/** A country's cities, biggest first, narrowed by what was typed (50 at most). */
export function useCities(countryCode: string | undefined, search: string, enabled: boolean) {
    return useQuery({
        queryKey: ["website", "places", "cities", countryCode, search],
        queryFn: async () => (await http.get<WebsiteCity[]>("/website/places/cities", { params: { country: countryCode, search: search || undefined } })).data,
        enabled: enabled && !!countryCode,
        staleTime: Infinity,
        placeholderData: keepPreviousData,
    });
}

/** Cities of that name in other countries, for one the chosen country doesn't have (three letters typed at least). */
export function useCitiesElsewhere(countryCode: string | undefined, search: string, enabled: boolean) {
    return useQuery({
        queryKey: ["website", "places", "elsewhere", countryCode, search],
        queryFn: async () => (await http.get<WebsiteCityElsewhere[]>("/website/places/cities-elsewhere", { params: { country: countryCode, search } })).data,
        enabled: enabled && !!countryCode && search.length >= 3,
        staleTime: Infinity,
    });
}

/** A project changed: the list shows it, and the strip may have moved. */
function useProjectsChanged() {
    const queryClient = useQueryClient();
    return () => { void queryClient.invalidateQueries({ queryKey: ["website"] }); };
}

export function useSaveWebsiteProject() {
    const changed = useProjectsChanged();
    return useMutation({
        mutationFn: async ({ id, body }: { id: number | null; body: WebsiteProjectBody }) =>
            (id == null ? await http.post<WebsiteProject>("/website/projects", body) : await http.put<WebsiteProject>(`/website/projects/${id}`, body)).data,
        onSuccess: changed,
    });
}

export function useDeleteWebsiteProject() {
    const changed = useProjectsChanged();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/website/projects/${id}`); },
        onSuccess: changed,
    });
}

/** The whole moving strip, in order. */
export function useSetConveyor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (projectIds: number[]) => (await http.put<WebsiteProjects>("/website/conveyor", { projectIds })).data,
        onSuccess: (projects) => queryClient.setQueryData(projectsKey, projects),
    });
}

/**
 * A project's gallery or concept pictures (`concept` when added): add a picture, describe it, order or remove them. Each answers with the whole project, which
 * replaces it in the list straight away, so the open form shows the change.
 */
export function useGallery(projectId: number) {
    const queryClient = useQueryClient();
    const put = (project: WebsiteProject) => {
        queryClient.setQueryData<WebsiteProjects>(projectsKey, (list) =>
            list && { ...list, projects: list.projects.map((p) => (p.id === project.id ? project : p)) });
        // a project added a moment ago may not be in the list yet
        void queryClient.invalidateQueries({ queryKey: projectsKey });
    };
    const base = `/website/projects/${projectId}/images`;
    const add = useMutation({
        mutationFn: async (body: Schemas["WebsiteImageRequest"]) => (await http.post<WebsiteProject>(base, body)).data,
        onSuccess: put,
    });
    const edit = useMutation({
        mutationFn: async ({ imageId, body }: { imageId: number; body: Schemas["WebsiteImageEditRequest"] }) =>
            (await http.put<WebsiteProject>(`${base}/${imageId}`, body)).data,
        onSuccess: put,
    });
    const remove = useMutation({
        mutationFn: async (imageId: number) => (await http.delete<WebsiteProject>(`${base}/${imageId}`)).data,
        onSuccess: put,
    });
    const order = useMutation({
        mutationFn: async (ids: number[]) => (await http.put<WebsiteProject>(`${base}/order`, { ids })).data,
        onSuccess: put,
    });
    return { add, edit, remove, order };
}

export type ListKind = "services" | "locations" | "social-links";

/** One of the website's ordered lists: add, change, remove or reorder a row. Each answers with all the content. */
export function useWebsiteList<Body>(kind: ListKind) {
    const queryClient = useQueryClient();
    const put = (content: WebsiteContent) => queryClient.setQueryData(contentKey, content);
    const add = useMutation({ mutationFn: async (body: Body) => (await http.post<WebsiteContent>(`/website/${kind}`, body)).data, onSuccess: put });
    const update = useMutation({
        mutationFn: async ({ id, body }: { id: number; body: Body }) => (await http.put<WebsiteContent>(`/website/${kind}/${id}`, body)).data,
        onSuccess: put,
    });
    const remove = useMutation({ mutationFn: async (id: number) => (await http.delete<WebsiteContent>(`/website/${kind}/${id}`)).data, onSuccess: put });
    const order = useMutation({ mutationFn: async (ids: number[]) => (await http.put<WebsiteContent>(`/website/${kind}/order`, { ids })).data, onSuccess: put });
    return { add, update, remove, order };
}

/** The website's favicon, from an uploaded picture, or none (website:manage). */
export function useSetFavicon() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (fileId: number | null) =>
            (fileId == null ? await http.delete<WebsiteContent>("/website/favicon") : await http.put<WebsiteContent>("/website/favicon", { fileId })).data,
        onSuccess: (content) => queryClient.setQueryData(contentKey, content),
    });
}

export type WatermarkCheck = Schemas["WatermarkCheckResponse"];

/** Whether a picture found anywhere carries the company's invisible watermark, and which website picture it is (website:manage). */
export function useCheckWatermark() {
    return useMutation({
        mutationFn: async (file: File) => {
            const form = new FormData();
            form.append("file", file);
            return (await http.post<WatermarkCheck>("/website/watermark-check", form)).data;
        },
    });
}

/** Puts the website under construction, or brings it back (website:manage). */
export function useSetUnderConstruction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (underConstruction: boolean) => (await http.put<WebsiteContent>("/website/under-construction", { underConstruction })).data,
        onSuccess: (content) => queryClient.setQueryData(contentKey, content),
    });
}

/**
 * The company's own email: the website shows it and its contact form sends to it. It is a company setting too, so the
 * settings are read again (company_settings:manage or website:manage).
 */
export function useSetContactEmail() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (email: string) => (await http.put<Schemas["CompanySettingsResponse"]>("/company/contact-email", { email })).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: contentKey });
            void queryClient.invalidateQueries({ queryKey: ["company", "settings"] });
        },
    });
}

/** Moves one id up or down a list by one place; the same list when it can't move. */
export function moved(ids: number[], id: number, by: -1 | 1): number[] {
    const from = ids.indexOf(id), to = from + by;
    if (from < 0 || to < 0 || to >= ids.length) return ids;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
}

/** The pictures the website takes: photos only (no SVG, which can carry scripts). */
export const PICTURE_TYPES = "image/png,image/jpeg,image/webp";

/**
 * Uploads picked pictures, made small first (at most `maxEdge` px on their longest side, never cropped) and a few at a
 * time; answers with their file ids in the order picked, or the first error.
 */
export function uploadPictures(files: File[], maxEdge = 1920, onProgress?: (done: number, fraction: number) => void): Promise<number[]> {
    return uploadAll(files, { maxEdge, onProgress });
}

/** A card picture is shown at most about 540 px wide (twice that on sharp screens); a page picture up to about 1200. */
export const CARD_EDGE = 1280;
