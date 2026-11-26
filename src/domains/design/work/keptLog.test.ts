import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { isDayOffLog, isKeptLog } from "./workApi";

const failure = (code: string, blockedChangeId: number | null = 9) => new ApiError(422, { code, message: "Kept", blockedChangeId });

describe("Hours kept instead of logged", () => {
    it("wait for approval when the department isn't on the project, or the day is part of the logger's time off", () => {
        expect(isKeptLog(failure("department_not_on_project"))).toBe(true);
        expect(isKeptLog(failure("time_off_hours_held"))).toBe(true);
        expect(isDayOffLog(failure("time_off_hours_held"))).toBe(true);
        expect(isDayOffLog(failure("department_not_on_project"))).toBe(false);
    });

    it("are refusals like any other when nothing was kept", () => {
        expect(isKeptLog(failure("time_off_hours_held", null))).toBe(false);
        expect(isKeptLog(failure("time_off_day"))).toBe(false);
        expect(isDayOffLog(failure("entry_overlaps"))).toBe(false);
    });
});
