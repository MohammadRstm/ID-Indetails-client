import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Modal from "./Modal";
import { markAssistantOpening, registerOpener, runOpener, surfaceOpened, takeAssistantOpening, useOpenSurface } from "./assistantLayer";

function Field() {
    // the form takes focus the way the app's forms do
    return <input aria-label="Title" autoFocus />;
}

function OpenSurface() {
    return <div data-testid="surface">{useOpenSurface() ?? "none"}</div>;
}

describe("windows and the assistant", () => {
    it("a window the person opens takes the keyboard; one the assistant opens gives it back", () => {
        render(<button>Composer</button>);
        const composer = screen.getByRole("button", { name: "Composer" });

        const first = render(<Modal title="Edit" onClose={() => {}}><Field /></Modal>);
        expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
        first.unmount();

        composer.focus();
        markAssistantOpening();
        render(<Modal title="Edit" surfaceId="edit_project" onClose={() => {}}><Field /></Modal>);
        expect(composer).toHaveFocus();
        // the mark is used once
        expect(takeAssistantOpening()).toBeNull();
    });

    it("knows which named window is open, and runs the opener a showing page registered", () => {
        render(<OpenSurface />);
        expect(screen.getByTestId("surface")).toHaveTextContent("none");
        let close = () => {};
        act(() => { close = surfaceOpened("new_project"); });
        expect(screen.getByTestId("surface")).toHaveTextContent("new_project");
        act(() => close());
        expect(screen.getByTestId("surface")).toHaveTextContent("none");

        let opened = 0;
        const unregister = registerOpener("report_bug", () => opened++);
        expect(runOpener("report_bug")).toBe(true);
        unregister();
        expect(runOpener("report_bug")).toBe(false);
        expect(opened).toBe(1);
    });
});
