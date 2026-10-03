import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { parseDateText } from "@/shared/format/parseDate";
import { parseTime } from "@/shared/format/parseTime";
import { periodRange } from "@/shared/format/periods";
import { Delta } from "./Charts/Bars";
import DataTable, { type SortState } from "./Data-Tables/DataTable";
import Pager from "./Data-Tables/Pager";
import DateInput from "./Forms/DateInput";
import { ChipGroup } from "./Forms/Filters";
import Select from "./Forms/Select";
import TimeField from "./Forms/TimeField";
import HelpTip from "./Feedback/HelpTip";
import MenuButton from "./Overlays/MenuButton";
import Modal from "./Overlays/Modal";
import { tip } from "./Overlays/tip";
import TipHost from "./Overlays/TipHost";

describe("Select", () => {
    function Harness({ count = 3, onChange = vi.fn() }: { count?: number; onChange?: (v: string) => void }) {
        const [value, setValue] = useState("o0");
        const options = Array.from({ length: count }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` }));
        return <Select aria-label="Pick" value={value} options={options} onChange={(v) => { setValue(v); onChange(v); }} />;
    }

    it("opens, moves with the keyboard and picks", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const button = screen.getByRole("button", { name: "Pick" });
        button.focus();
        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
        expect(onChange).toHaveBeenCalledWith("o2");
        expect(button).toHaveTextContent("Option 2");
    });

    it("shows a value that isn't one of its options as a choice still to make", () => {
        render(<Select aria-label="Project" value="gone" options={[{ value: "a", label: "Villa Mounir" }]} onChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Project" })).toHaveTextContent("Choose…");
    });

    it("filters long lists", async () => {
        render(<Harness count={12} />);
        await userEvent.click(screen.getByRole("button", { name: "Pick" }));
        await userEvent.type(screen.getByLabelText("Filter options"), "11");
        expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Option 11"]);
    });
});

describe("typed dates and times", () => {
    it("reads dates the way people write them", () => {
        const today = "2026-09-30";
        expect(parseDateText("23/9/2026", today)).toBe("2026-09-23");
        expect(parseDateText("23.9.26", today)).toBe("2026-09-23");
        expect(parseDateText("23/9", today)).toBe("2026-09-23");
        expect(parseDateText("Sep 23 2026", today)).toBe("2026-09-23");
        expect(parseDateText("23 September", today)).toBe("2026-09-23");
        expect(parseDateText("sept 2026", today)).toBe("2026-09-01");
        expect(parseDateText("yesterday", today)).toBe("2026-09-29");
        expect(parseDateText("31/2/2026", today)).toBeNull();
        expect(parseDateText("", today)).toBe("");
    });

    it("reads times, taking 1 to 7 without am/pm as the afternoon", () => {
        expect(parseTime("930")).toBe(9 * 60 + 30);
        expect(parseTime("9:30pm")).toBe(21 * 60 + 30);
        expect(parseTime("3")).toBe(15 * 60);
        expect(parseTime("12am")).toBe(0);
        expect(parseTime("25:00")).toBeNull();
    });
});

describe("DataTable", () => {
    const columns = [
        { key: "name", header: "Name", cell: (r: { id: number; name: string; hours: number }) => r.name },
        { key: "hours", header: "Hours", right: true, sortKey: "hours", cell: (r: { hours: number }) => r.hours },
    ];

    it("sorts descending first, then ascending", async () => {
        const onSort = vi.fn();
        const sort: SortState = { key: "name", dir: "desc" };
        render(<DataTable columns={columns} rows={[{ id: 1, name: "Sarah", hours: 3 }]} rowKey={(r) => r.id} sort={sort} onSort={onSort} />);
        await userEvent.click(screen.getByText("Hours"));
        expect(onSort).toHaveBeenCalledWith({ key: "hours", dir: "desc" });
        // and from the keyboard
        screen.getByRole("columnheader", { name: "Hours" }).focus();
        await userEvent.keyboard("{Enter}");
        expect(onSort).toHaveBeenCalledTimes(2);
    });

    it("shows skeletons while loading, an inline error with a retry, and an empty state", async () => {
        const retry = vi.fn();
        const { rerender, container } = render(<DataTable columns={columns} rows={undefined} loading rowKey={() => 0} />);
        expect(container.querySelectorAll(".skel").length).toBeGreaterThan(0);

        rerender(<DataTable columns={columns} rows={undefined} error={new ApiError(500, {})} onRetry={retry} what="the people" rowKey={() => 0} />);
        expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the people.");
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalled();

        rerender(<DataTable columns={columns} rows={[]} rowKey={() => 0} empty="Nobody yet" />);
        expect(screen.getByText("Nobody yet")).toBeInTheDocument();
    });
});

describe("Pager", () => {
    it("shows the range and moves between pages", async () => {
        const onPage = vi.fn();
        render(<Pager page={1} pageSize={30} total={75} onPage={onPage} />);
        expect(screen.getByText("1–30 of 75")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "3" }));
        expect(onPage).toHaveBeenCalledWith(3);
    });

    it("hides itself when one page holds everything", () => {
        const { container } = render(<Pager page={1} pageSize={30} total={12} onPage={() => {}} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("small pieces", () => {
    it("chips report the one picked", async () => {
        const onChange = vi.fn();
        render(<ChipGroup value="all" onChange={onChange} options={[{ value: "all", label: "All", count: 4 }, { value: "hold", label: "On hold" }]} />);
        await userEvent.click(screen.getByRole("button", { name: "On hold" }));
        expect(onChange).toHaveBeenCalledWith("hold");
    });

    it("a modal closes with Escape", () => {
        const onClose = vi.fn();
        render(<Modal title="Invoice" onClose={onClose}><p>Body</p></Modal>);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });

    it("Escape in a menu inside a modal closes the menu only", async () => {
        const onClose = vi.fn();
        render(
            <Modal title="Invoice" onClose={onClose}>
                <MenuButton label="Payment actions">{() => <button>Void payment</button>}</MenuButton>
            </Modal>,
        );
        await userEvent.click(screen.getByRole("button", { name: "Payment actions" }));
        expect(screen.getByRole("button", { name: "Void payment" })).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("button", { name: "Void payment" })).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
        // with the menu closed, Escape is the modal's again
        await userEvent.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("a help tip explains its field on focus or a click, and Escape closes it", async () => {
        render(<label>Label <HelpTip label="a client's label">What kind of client this is.</HelpTip></label>);
        const tip = screen.getByRole("button", { name: "What is a client's label?" });
        expect(screen.queryByRole("tooltip")).toBeNull();
        await userEvent.tab();
        expect(tip).toHaveFocus();
        expect(screen.getByRole("tooltip")).toHaveTextContent("What kind of client this is.");
        expect(tip).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("tooltip")).toBeNull();
        await userEvent.click(tip);
        expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("a modal takes the keyboard focus, and gives it back when it closes", () => {
        function Harness({ open }: { open: boolean }) {
            return <><button>Open invoice</button>{open && <Modal title="Invoice" onClose={vi.fn()}><p>Body</p></Modal>}</>;
        }
        const { rerender } = render(<Harness open={false} />);
        screen.getByRole("button", { name: "Open invoice" }).focus();
        rerender(<Harness open />);
        expect(screen.getByRole("dialog", { name: "Invoice" })).toHaveFocus();
        rerender(<Harness open={false} />);
        expect(screen.getByRole("button", { name: "Open invoice" })).toHaveFocus();
    });

    it("a change is good news or bad news", () => {
        const { container, rerender } = render(<Delta value={120} prev={100} />);
        expect(container.textContent).toContain("+20.0%");
        expect(container.querySelector(".up")).not.toBeNull();
        rerender(<Delta value={120} prev={100} inverse />);
        expect(container.querySelector(".down")).not.toBeNull();
    });

    it("periods run to today and compare with the same stretch before", () => {
        expect(periodRange("month", "2026-09-30")).toMatchObject({ from: "2026-09-01", to: "2026-09-30", prevFrom: "2026-08-01", prevTo: "2026-08-30" });
        expect(periodRange("quarter", "2026-09-30")).toMatchObject({ from: "2026-07-01", label: "Q3 2026 to date", prevFrom: "2026-04-01", prevLabel: "Q2 2026" });
        expect(periodRange("30d", "2026-09-30")).toMatchObject({ from: "2026-09-01" });
    });
});

describe("the hover popup", () => {
    it("hides on a press, a key, a scroll or leaving the window, as what it described may be gone or covered", () => {
        render(<TipHost />);
        const popup = document.getElementById("tip")!;
        const show = () => {
            tip.show({ clientX: 20, clientY: 20 }, [{ big: "Ceiling plan drawings" }, { k: "Time", v: "9:00 AM – 11:30 AM" }]);
            expect(popup).toBeVisible();
        };
        show();
        fireEvent.pointerDown(document.body);
        expect(popup).not.toBeVisible();
        show();
        fireEvent.keyDown(document.body, { key: "Enter" });
        expect(popup).not.toBeVisible();
        show();
        fireEvent.scroll(window);
        expect(popup).not.toBeVisible();
        show();
        fireEvent.blur(window);
        expect(popup).not.toBeVisible();
    });
});

describe("dropdowns in a dialog", () => {
    function Meeting() {
        const [end, setEnd] = useState(10 * 60);
        const [project, setProject] = useState("a");
        const [day, setDay] = useState("2026-10-01");
        return (
            <Modal title="New meeting" onClose={vi.fn()}>
                <TimeField label="End" value={end} min={9 * 60} onChange={setEnd} />
                <Select aria-label="Project" value={project} onChange={setProject}
                    options={[{ value: "a", label: "Villa Mounir" }, { value: "b", label: "Haddad HQ" }]} />
                <DateInput aria-label="Day" value={day} onChange={setDay} />
            </Modal>
        );
    }

    it("float over the page, so opening one never stretches the dialog", async () => {
        render(<Meeting />);
        const dialog = screen.getByRole("dialog", { name: "New meeting" });

        await userEvent.click(screen.getByLabelText("End"));
        const time = screen.getByRole("button", { name: /^11:00 AM/ });
        expect(dialog.contains(time)).toBe(false);
        expect(time.closest(".pop")).toHaveClass("floating");

        await userEvent.click(screen.getByRole("button", { name: "Project" }));
        expect(dialog.contains(screen.getByRole("listbox"))).toBe(false);
        await userEvent.keyboard("{Escape}");

        await userEvent.click(screen.getByRole("button", { name: "Open calendar" }));
        const calendar = screen.getByRole("button", { name: "Previous month" }).closest(".cal")!;
        expect(dialog.contains(calendar)).toBe(false);
    });

    it("a time list picks, closes with Escape without closing the dialog, and closes when the field is left", async () => {
        render(<Meeting />);
        const dialog = screen.getByRole("dialog", { name: "New meeting" });
        const end = screen.getByLabelText("End");

        await userEvent.click(end);
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("button", { name: /^11:00 AM/ })).toBeNull();
        expect(dialog).toBeInTheDocument();

        await userEvent.tab();
        await userEvent.click(end);
        await userEvent.click(screen.getByRole("button", { name: /^11:00 AM/ }));
        expect(end).toHaveValue("11:00 AM");
        expect(screen.queryByRole("button", { name: /^11:15 AM/ })).toBeNull();

        await userEvent.tab({ shift: true });
        await userEvent.click(end);
        expect(screen.getByRole("button", { name: /^11:15 AM/ })).toBeInTheDocument();
        await userEvent.tab();
        expect(screen.queryByRole("button", { name: /^11:15 AM/ })).toBeNull();
    });
});

describe("menus and dialogs opened from a table", () => {
    function Row() {
        const [open, setOpen] = useState(false);
        return (
            <div className="tbl-wrap" data-testid="table">
                <table><tbody><tr><td className="r">
                    <MenuButton icon="dots" label="More actions">
                        {(close) => <button className="pop-item" onClick={() => { close(); setOpen(true); }}>Deactivate</button>}
                    </MenuButton>
                    {open && <Modal title="Deactivate account" onClose={() => setOpen(false)}>Their history stays.</Modal>}
                </td></tr></tbody></table>
            </div>
        );
    }

    it("float over the page instead of growing the table", async () => {
        render(<Row />);
        const table = screen.getByTestId("table");
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        const item = screen.getByRole("button", { name: "Deactivate" });
        expect(table.contains(item)).toBe(false);
        expect(item.closest(".pop")).toHaveClass("floating");

        await userEvent.click(item);
        const dialog = screen.getByRole("dialog", { name: "Deactivate account" });
        // drawn on the page, so it takes nothing from the cell (its right-aligned text, its width)
        expect(table.contains(dialog)).toBe(false);
        expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    });
});
