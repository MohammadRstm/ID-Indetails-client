import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import AmountField from "./AmountField";
import { grouped } from "./groupedNumber";

describe("grouped", () => {
    it("puts commas between the thousands and leaves the decimals as typed", () => {
        expect(grouped("")).toBe("");
        expect(grouped("400")).toBe("400");
        expect(grouped("400000")).toBe("400,000");
        expect(grouped("1234567.5")).toBe("1,234,567.5");
        expect(grouped("1234.")).toBe("1,234.");
        expect(grouped("1234.5678")).toBe("1,234.5678");
        expect(grouped(".5")).toBe(".5");
    });
});

describe("AmountField", () => {
    function Harness({ start = null }: { start?: number | null }) {
        const [value, setValue] = useState<number | null>(start);
        return (
            <>
                <label htmlFor="amt">Amount</label>
                <AmountField id="amt" value={value} currencies={false} onChange={setValue} />
                <output aria-label="Stored">{value == null ? "" : String(value)}</output>
                <button type="button" onClick={() => setValue(2500000)}>Set from outside</button>
            </>
        );
    }
    const field = () => screen.getByLabelText<HTMLInputElement>("Amount");
    const stored = () => screen.getByLabelText("Stored").textContent;

    it("shows commas as it is typed and hands up the plain number", async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.type(field(), "400000");
        expect(field()).toHaveValue("400,000");
        expect(stored()).toBe("400000");
        await user.type(field(), "0");
        expect(field()).toHaveValue("4,000,000");
        expect(stored()).toBe("4000000");
    });

    it("drops the zeros in front of an amount", async () => {
        const user = userEvent.setup();
        render(<Harness start={0} />);
        expect(field()).toHaveValue("0");
        await user.type(field(), "5000");
        expect(field()).toHaveValue("5,000");
        expect(stored()).toBe("5000");
        await user.clear(field());
        await user.type(field(), "0.5");
        expect(field()).toHaveValue("0.5");
        expect(stored()).toBe("0.5");
    });

    it("takes decimals, up to two", async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.type(field(), "1234.");
        expect(field()).toHaveValue("1,234.");
        await user.type(field(), "5");
        expect(field()).toHaveValue("1,234.5");
        expect(stored()).toBe("1234.5");
        await user.type(field(), "6");
        expect(field()).toHaveValue("1,234.56");
        expect(stored()).toBe("1234.56");
        // a third decimal is refused, and the field says why
        await user.type(field(), "7");
        expect(field()).toHaveValue("1,234.56");
        expect(stored()).toBe("1234.56");
        expect(screen.getByText(/with at most 2 decimals/)).toBeInTheDocument();
    });

    it("keeps the caret beside its digit when typing in the middle", async () => {
        const user = userEvent.setup();
        render(<Harness start={12345} />);
        expect(field()).toHaveValue("12,345");
        // the caret after "12," — typing there moves the comma, and the caret stays after the new digit
        await user.type(field(), "9", { initialSelectionStart: 3, initialSelectionEnd: 3 });
        expect(field()).toHaveValue("129,345");
        expect(field().selectionStart).toBe(3);
        await user.keyboard("8");
        expect(field()).toHaveValue("1,298,345");
        expect(field().selectionStart).toBe(5);
        expect(stored()).toBe("1298345");
    });

    it("deletes the digit beyond a comma, not the comma", async () => {
        const user = userEvent.setup();
        render(<Harness start={1234567} />);
        expect(field()).toHaveValue("1,234,567");
        // Backspace just after the first comma takes the 1
        await user.type(field(), "{Backspace}", { initialSelectionStart: 2, initialSelectionEnd: 2 });
        expect(field()).toHaveValue("234,567");
        expect(field().selectionStart).toBe(0);
        expect(stored()).toBe("234567");
        // Delete just before the comma takes the 5, and the caret stays after the 4: 23,4|67
        await user.type(field(), "{Delete}", { initialSelectionStart: 3, initialSelectionEnd: 3 });
        expect(field()).toHaveValue("23,467");
        expect(field().selectionStart).toBe(4);
        expect(stored()).toBe("23467");
        // Backspace in the middle of the digits
        await user.type(field(), "{Backspace}", { initialSelectionStart: 6, initialSelectionEnd: 6 });
        expect(field()).toHaveValue("2,346");
        expect(field().selectionStart).toBe(5);
    });

    it("takes a pasted amount with or without commas", async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(field());
        await user.paste("400,000");
        expect(field()).toHaveValue("400,000");
        expect(stored()).toBe("400000");
        await user.clear(field());
        expect(stored()).toBe("0");
        await user.paste("400000.5");
        expect(field()).toHaveValue("400,000.5");
        expect(stored()).toBe("400000.5");
        // pasted in the middle: 4|00,000.5 + "12" → 41,200,000.5, the caret after the pasted digits
        await user.click(field());
        field().setSelectionRange(1, 1);
        await user.paste("12");
        expect(field()).toHaveValue("41,200,000.5");
        expect(field().selectionStart).toBe(4);
        expect(stored()).toBe("41200000.5");
    });

    it("refuses more digits than an amount can have, without moving the caret", async () => {
        const user = userEvent.setup();
        render(<Harness start={1234567890123} />);
        expect(field()).toHaveValue("1,234,567,890,123");
        await user.type(field(), "9", { initialSelectionStart: 2, initialSelectionEnd: 2 });
        expect(field()).toHaveValue("1,234,567,890,123");
        expect(field().selectionStart).toBe(2);
        expect(screen.getByText(/Up to 9,999,999,999,999.99/)).toBeInTheDocument();
    });

    it("shows an amount set from outside with its commas", async () => {
        const user = userEvent.setup();
        render(<Harness start={1500.5} />);
        expect(field()).toHaveValue("1,500.5");
        await user.click(screen.getByRole("button", { name: "Set from outside" }));
        expect(field()).toHaveValue("2,500,000");
    });
});
