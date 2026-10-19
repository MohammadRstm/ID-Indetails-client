import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProtonMarkdown from "./ProtonMarkdown";
import { blocksOf, plainText } from "./protonText";

// The answer from the bug report: bold labels in a list, under bold headings
const SUMMARY = [
    "Here's the company for the first 19 days of October, against the same 19 days of September.",
    "",
    "**Design**",
    "- **Projects:** 7 active, 2 on hold, 1 completed.",
    "- **Hours:** 155.5 h logged, down from 821.8 h (−81%).",
    "  The biggest drop was Mira & Partners office fit-out.",
    "",
    "**Execution**",
    "- **Money:** 33,500 USD received (up from 10,000 USD).",
    "- Execution doesn't log hours, so there's no hours figure for it.",
].join("\n");

describe("Proton's answers drawn from their markdown", () => {
    it("reads paragraphs, lists, headings and an indented line that carries on a list item", () => {
        expect(blocksOf(SUMMARY)).toEqual([
            { kind: "p", lines: ["Here's the company for the first 19 days of October, against the same 19 days of September."] },
            { kind: "p", lines: ["**Design**"] },
            {
                kind: "ul",
                items: [
                    { text: "**Projects:** 7 active, 2 on hold, 1 completed.", sub: [] },
                    { text: "**Hours:** 155.5 h logged, down from 821.8 h (−81%). The biggest drop was Mira & Partners office fit-out.", sub: [] },
                ],
            },
            { kind: "p", lines: ["**Execution**"] },
            {
                kind: "ul",
                items: [
                    { text: "**Money:** 33,500 USD received (up from 10,000 USD).", sub: [] },
                    { text: "Execution doesn't log hours, so there's no hours figure for it.", sub: [] },
                ],
            },
        ]);
        expect(blocksOf("## Next steps\n1. Call Acme\n2. Send the invoice\n\n3. Close it\n   - by Friday")).toEqual([
            { kind: "h", text: "Next steps" },
            { kind: "ol", start: 1, items: [{ text: "Call Acme", sub: [] }, { text: "Send the invoice", sub: [] }, { text: "Close it", sub: ["by Friday"] }] },
        ]);
    });

    it("draws bold, lists and line breaks instead of showing the markers", () => {
        const { container } = render(<ProtonMarkdown text={SUMMARY} />);

        expect(container.textContent).not.toContain("**");
        expect(screen.getByText("Design").tagName).toBe("STRONG");
        const lists = screen.getAllByRole("list");
        expect(lists).toHaveLength(2);
        expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(2);
        expect(within(lists[0]).getByText("Projects:").tagName).toBe("STRONG");
        expect(within(lists[0]).getAllByRole("listitem")[1]).toHaveTextContent("The biggest drop was Mira & Partners office fit-out.");
    });

    it("draws italic and code, and leaves what isn't markup as text", () => {
        const { container } = render(<ProtonMarkdown text={"It's *on hold* since `2026-10-01`.\n2 * 3 = 6, see project_id and **not closed"} />);

        expect(screen.getByText("on hold").tagName).toBe("EM");
        expect(screen.getByText("2026-10-01").tagName).toBe("CODE");
        // a lone star, an underscore inside a word and an unclosed bold (as while an answer streams in) stay as they are
        expect(container.textContent).toContain("2 * 3 = 6, see project_id and **not closed");
        expect(container.querySelectorAll("p br")).toHaveLength(1);
    });

    it("never turns the answer's text into HTML or a link", () => {
        const { container } = render(<ProtonMarkdown text={'<img src=x onerror="alert(1)"> **[click](https://evil.example)** <script>x</script>'} />);

        expect(container.querySelector("img, script, a")).toBeNull();
        expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
        expect(container.textContent).toContain("[click](https://evil.example)");
    });

    it("gives the same answer as plain text for the preview and the voice", () => {
        expect(plainText(SUMMARY)).toBe([
            "Here's the company for the first 19 days of October, against the same 19 days of September.",
            "",
            "Design",
            "Projects: 7 active, 2 on hold, 1 completed.",
            "Hours: 155.5 h logged, down from 821.8 h (−81%).",
            "  The biggest drop was Mira & Partners office fit-out.",
            "",
            "Execution",
            "Money: 33,500 USD received (up from 10,000 USD).",
            "Execution doesn't log hours, so there's no hours figure for it.",
        ].join("\n"));
        expect(plainText("## Done\n---\n**Bold *and italic***")).toBe("Done\nBold and italic");
    });
});
