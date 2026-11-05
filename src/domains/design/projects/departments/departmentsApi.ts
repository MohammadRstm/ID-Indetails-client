import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type ProjectDepartments = Schemas["ProjectDepartmentsResponse"];
export type ProjectDepartment = Schemas["ProjectDepartmentResponse"];
export type DepartmentMoney = Schemas["DepartmentMoneyResponse"];
export type DepartmentChange = Schemas["ProjectDepartmentChangeResponse"];

/** The name of a project worked on by every Design department (two or more). */
export const FULL_FILE = "Full file";

/** Whether the chosen departments are every Design department: the project is then a full file. */
export function isFullFile(chosen: number[], all: { id: number }[]) {
    return chosen.length >= 2 && all.every((d) => chosen.includes(d.id));
}

/** A share as a percentage, to two places when it has them: 0.3334 is "33.34%". */
export function sharePct(share: number) {
    return `${Number((share * 100).toFixed(2))}%`;
}

const departmentsKey = (projectId: number) => [...keys.projects.detail(projectId), "departments"] as const;

/** A Design project's departments; their shares and money only for whoever sees the money (financial:view). */
export function useProjectDepartments(projectId: number, enabled = true) {
    return useQuery({
        queryKey: departmentsKey(projectId),
        queryFn: async () => (await http.get<ProjectDepartments>(`/projects/${projectId}/departments`)).data,
        enabled,
    });
}

/** Every change of the split, newest first (financial:view). */
export function useDepartmentHistory(projectId: number, enabled = true) {
    return useQuery({
        queryKey: [...departmentsKey(projectId), "history"],
        queryFn: async () => (await http.get<DepartmentChange[]>(`/projects/${projectId}/departments/history`)).data,
        enabled,
    });
}

/** A change of departments moves the project, its money, and the work let through: everything built on them follows. */
function useDepartmentsChanged() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.projects.all, keys.work.all, keys.finance.all, keys.activity.all, keys.dashboard.all); };
}

/** Sets the departments (project:edit): the shares go back to equal, and hours waiting for an added one go through. */
export function useSetDepartments(projectId: number) {
    const changed = useDepartmentsChanged();
    return useMutation({
        mutationFn: async (departmentIds: number[]) =>
            (await http.put<ProjectDepartments>(`/projects/${projectId}/departments`, { departmentIds })).data,
        onSuccess: changed,
    });
}

/** Sets each department's share, adding up to 1, with why (financial:write). */
export function useSetShares(projectId: number) {
    const changed = useDepartmentsChanged();
    return useMutation({
        mutationFn: async (body: Schemas["SetDepartmentSharesRequest"]) =>
            (await http.put<ProjectDepartments>(`/projects/${projectId}/departments/shares`, body)).data,
        onSuccess: changed,
    });
}
