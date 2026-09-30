import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { clickable } from "./clickable";

describe("a clickable row or tile", () => {
    it("opens from the keyboard as from the mouse", async () => {
        const open = vi.fn();
        render(<div {...clickable(open, "button")}>Villa Mounir</div>);
        const tile = screen.getByRole("button", { name: "Villa Mounir" });
        await userEvent.tab();
        expect(tile).toHaveFocus();
        await userEvent.keyboard("{Enter}");
        await userEvent.keyboard(" ");
        await userEvent.click(tile);
        expect(open).toHaveBeenCalledTimes(3);
    });

    it("leaves the keys of what is inside it alone", async () => {
        const open = vi.fn();
        const inner = vi.fn();
        // as the app's buttons inside a clickable row do, it keeps its click to itself
        render(<div {...clickable(open, "button")}>Row <button onClick={(e) => { e.stopPropagation(); inner(); }}>Edit</button></div>);
        screen.getByRole("button", { name: "Edit" }).focus();
        await userEvent.keyboard("{Enter}");
        expect(inner).toHaveBeenCalledTimes(1);
        expect(open).not.toHaveBeenCalled();
    });

    it("is plain when there is nothing to open", () => {
        render(<div {...clickable(undefined, "button")}>Nothing</div>);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.getByText("Nothing")).not.toHaveAttribute("tabindex");
    });
});
