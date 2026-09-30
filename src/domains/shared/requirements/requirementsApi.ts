import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type Requirement = Schemas["RequirementResponse"];
export type RequirementList = Schemas["RequirementListResponse"];
export type SaveRequirementBody = { text: string; deadline: string | null; assigneeIds: number[] };

export function useRequirements(projectId: number, enabled = true) {
    return useQuery({
        queryKey: keys.requirements.project(projectId),
        queryFn: async () => (await http.get<RequirementList>(`/projects/${projectId}/requirements`)).data,
        enabled,
    });
}

export type MyRequirements = Schemas["MyRequirementsResponse"];

/** The open requirements assigned to the signed-in person, across the projects they see. */
export function useMyRequirements() {
    return useQuery({
        queryKey: keys.requirements.mine,
        queryFn: async () => (await http.get<MyRequirements>("/me/requirements")).data,
    });
}

/** Adding, editing, ticking or removing a requirement moves the project's progress too. */
function useRequirementChange<T>(projectId: number, request: (arg: T) => Promise<unknown>) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: request,
        // a requirement moves the project's progress, which an employee's project cards show too
        onSuccess: () => { void invalidate(keys.requirements.project(projectId), keys.requirements.mine, keys.projects.all, keys.dashboard.all, keys.work.myProjects); },
    });
}

export function useAddRequirement(projectId: number) {
    return useRequirementChange(projectId, (body: SaveRequirementBody) => http.post(`/projects/${projectId}/requirements`, body));
}

export function useUpdateRequirement(projectId: number) {
    return useRequirementChange(projectId, ({ id, body }: { id: number; body: SaveRequirementBody }) =>
        http.put(`/projects/${projectId}/requirements/${id}`, body));
}

export function useTickRequirement(projectId: number) {
    return useRequirementChange(projectId, ({ id, done }: { id: number; done: boolean }) =>
        http.post(`/projects/${projectId}/requirements/${id}/${done ? "done" : "undone"}`));
}

export function useDeleteRequirement(projectId: number) {
    return useRequirementChange(projectId, (id: number) => http.delete(`/projects/${projectId}/requirements/${id}`));
}
