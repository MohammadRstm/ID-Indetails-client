import { describe, expect, it } from "vitest";
import { ApiError, errorMessage, refOf } from "./errors";

const traceId = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

describe("Error messages", () => {
    it("end with a reference a person can quote when the failure is on the server's side", () => {
        const failure = new ApiError(500, { message: "Something went wrong on our side. Please try again later.", traceId });
        expect(failure.ref).toBe("4bf92f35");
        expect(errorMessage(failure)).toBe("Something went wrong on our side. Please try again later. (ref 4bf92f35)");
    });

    it("say nothing more for the person's own mistakes, or without a trace id", () => {
        expect(errorMessage(new ApiError(422, { message: "This project is on hold.", traceId }))).toBe("This project is on hold.");
        expect(errorMessage(new ApiError(500, { message: "Something went wrong." }))).toBe("Something went wrong.");
    });

    it("quote a server request id whole", () => {
        expect(refOf("0HN7Q2ABCDEF:00000001")).toBe("0HN7Q2ABCDEF:00000001");
    });
});
