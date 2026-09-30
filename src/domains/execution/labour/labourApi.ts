import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type LabourWeekList = Schemas["LabourWeekListResponse"];

/** Under the project, so anything that refreshes the project refreshes its labour too. */
export const labourKey = (projectId: number) => [...keys.projects.detail(projectId), "labour"] as const;

/** Every week from the site's start, newest first, reported or not, with the total so far (project:view). */
export function useLabourWeeks(projectId: number, enabled = true) {
    return useQuery({
        queryKey: [...labourKey(projectId), "weeks"],
        queryFn: async () => (await http.get<LabourWeekList>(`/projects/${projectId}/labour-weeks`)).data,
        enabled,
    });
}
