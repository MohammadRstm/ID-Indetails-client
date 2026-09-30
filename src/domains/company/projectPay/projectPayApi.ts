import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import type { PayUnit } from "./payPeriod";

export type ProjectPay = Schemas["ProjectPayResponse"];
export type ProjectPayProject = Schemas["ProjectPayProjectResponse"];
export type ProjectPayPerson = Schemas["ProjectPayPersonResponse"];

export type ProjectPayParams = { unit: PayUnit; date: string; projectId: number | null };

/** Each Design project's time in a week, month or quarter and the pay it represents (salary:view). */
export function useProjectPay(params: ProjectPayParams) {
    return useQuery({
        // an entry's pay moves with its salaries, so it refreshes with them
        queryKey: ["company", "salaries", "project-pay", params],
        queryFn: async () => (await http.get<ProjectPay>("/company/project-pay", { params })).data,
        placeholderData: keepPreviousData,
    });
}
