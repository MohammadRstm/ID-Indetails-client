import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { joinPhone, splitPhone } from "@/shared/format/phone";
import PhoneField from "./PhoneField";

describe("phone numbers", () => {
    it("split into the country they dial and the rest", () => {
        expect(splitPhone("+961 3 555 142")).toEqual({ iso: "LB", local: "3 555 142" });
        expect(splitPhone("+33612345678")).toEqual({ iso: "FR", local: "612345678" });
        // the longest code wins: +211 is South Sudan, not +2…
        expect(splitPhone("+211 912 345 678").iso).toBe("SS");
        // a code several countries share means the main one, unless another of them was picked
        expect(splitPhone("+1 416 555 0100").iso).toBe("US");
        expect(splitPhone("+1 416 555 0100", "CA").iso).toBe("CA");
        expect(splitPhone("+1 416 555 0100", "FR").iso).toBe("US");
        // no code: all of it is the number, under the home country
        expect(splitPhone("03 555 142")).toEqual({ iso: "LB", local: "03 555 142" });
        expect(splitPhone("")).toEqual({ iso: "LB", local: "" });
    });

    it("join back, and stay empty without a number", () => {
        expect(joinPhone("FR", "6 12 34 56 78")).toBe("+33 6 12 34 56 78");
        expect(joinPhone("FR", "  ")).toBe("");
    });
});

describe("PhoneField", () => {
    function Harness({ start = "" }: { start?: string }) {
        const [value, setValue] = useState(start);
        return (
            <>
                <label htmlFor="ph">Phone</label>
                <PhoneField id="ph" value={value} onChange={setValue} />
                <output aria-label="Stored">{value}</output>
            </>
        );
    }

    it("keeps the code the person picks, found by country or by code", async () => {
        render(<Harness />);
        const code = screen.getByRole("button", { name: "Country code" });
        expect(code).toHaveTextContent("+961");
        await userEvent.click(code);
        await userEvent.type(screen.getByLabelText("Filter options"), "fra");
        expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["France +33"]);
        await userEvent.click(screen.getByRole("option", { name: "France +33" }));
        // nothing is kept until there is a number
        expect(screen.getByLabelText("Stored")).toHaveTextContent(/^$/);
        await userEvent.type(screen.getByLabelText("Phone"), "6 12 34 56 78");
        expect(screen.getByLabelText("Stored")).toHaveTextContent("+33 6 12 34 56 78");

        await userEvent.click(code);
        await userEvent.type(screen.getByLabelText("Filter options"), "+961");
        await userEvent.click(screen.getByRole("option", { name: "Lebanon +961" }));
        expect(screen.getByLabelText("Stored")).toHaveTextContent("+961 6 12 34 56 78");
    });

    it("shows a stored number split, and takes the country of one typed with its own code", async () => {
        render(<Harness start="+44 20 7946 0958" />);
        expect(screen.getByRole("button", { name: "Country code" })).toHaveTextContent("+44");
        const number = screen.getByLabelText("Phone");
        expect(number).toHaveValue("20 7946 0958");

        await userEvent.clear(number);
        await userEvent.type(number, "+971 4 123 4567");
        expect(screen.getByRole("button", { name: "Country code" })).toHaveTextContent("+971");
        expect(number).toHaveValue("4 123 4567");
        expect(screen.getByLabelText("Stored")).toHaveTextContent("+971 4 123 4567");
    });
});
