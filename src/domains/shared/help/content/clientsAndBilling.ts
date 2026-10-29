import { P } from "@/app/permissions/codes";
import { has, hasAny, link, links, list, note, only, para, sees, step, steps, type Article } from "../helpModel";

export const clients: Article[] = [
    {
        id: "add-client",
        title: "Adding a client",
        category: "clients",
        who: has(P.CLIENT_CREATE),
        summary: "Clients → Add client. Clients are records only: they never sign in.",
        ask: ["add client", "new client", "create client", "add customer", "client contacts", "client email", "client phone"],
        blocks: [
            steps(
                step("Open **Clients** and choose **Add client**.", "Clients"),
                step("Enter the name or organisation and their contacts (emails and phones). Overdue reminders go to their email contact, the primary one first."),
            ),
            links(link("Add a client", { business: "clients?new=1" })),
        ],
        related: ["manage-client"],
    },
    {
        id: "manage-client",
        title: "Editing, archiving or deleting a client",
        category: "clients",
        who: has(P.CLIENT_MANAGE),
        summary: "On the client's page: Edit changes their details; the menu archives, restores or deletes them.",
        ask: ["edit client", "archive client", "delete client", "remove client", "restore client", "client details"],
        blocks: [
            list(
                "**Archive** hides a client you no longer work with; **Show archived** on the list brings them back into view, and **Restore** makes them active again.",
                "A client with projects can't be deleted: archive them instead.",
            ),
            links(link("Open clients", { business: "clients" })),
        ],
    },
    {
        id: "who-owes",
        title: "Who owes us money?",
        category: "clients",
        who: has(P.FINANCIAL_VIEW),
        summary: "Clients → Owing us lists clients with unpaid invoices; Financials → Billing shows who owes what, and how late it is.",
        ask: ["who owes us", "owing", "unpaid", "debtors", "money owed", "late payers", "overdue clients", "receivables"],
        blocks: [
            only(has(P.CLIENT_VIEW), para("On **Clients**, the **Owing us** filter shows clients with something outstanding on their invoices.")),
            para("**Financials → Billing** has who owes us money, how old it is, and the overdue invoices."),
            links(
                link("Clients owing us", { business: "clients" }),
                link("Billing", { business: "financials?tab=billing" }),
                link("Overdue invoices", { business: "financials?tab=billing&overdue=1" }),
            ),
        ],
        related: ["billing-terms"],
    },
];

export const billing: Article[] = [
    {
        id: "setup-invoicing",
        title: "Setting up invoicing",
        category: "billing",
        who: has(P.BILLING_SETTINGS_MANAGE),
        summary: "Before a business can issue invoices: Settings → Finance → Set up invoicing (prefix, payment terms and bank details).",
        ask: ["set up invoicing", "invoice settings", "invoice prefix", "invoice numbering", "payment terms", "bank details", "iban", "invoice footer"],
        blocks: [
            steps(
                step("Open **Settings → Finance**, then **Set up invoicing**.", "Settings", "Finance"),
                step("Choose the **Invoice prefix** (up to 8 capital letters or digits), the **Default payment terms** and the **Bank details printed on every invoice**."),
            ),
            list(
                "Invoices are numbered PREFIX-YEAR-001, 002… per business and year. Drafts don't use up numbers.",
                "Each business has its own invoicing settings; a prefix can't be used by both.",
                "Terms text and a footer are optional and printed on every invoice.",
            ),
            links(link("Finance settings", { settings: "finance" })),
        ],
        related: ["create-invoice", "reminders"],
    },
    {
        id: "create-invoice",
        title: "Creating an invoice",
        category: "billing",
        who: has(P.INVOICE_CREATE),
        summary: "On the project: More → New invoice (or New invoice on its billing band). It stays a draft until it is sent.",
        ask: ["new invoice", "create invoice", "bill a client", "invoice", "draft invoice", "edit draft"],
        blocks: [
            steps(
                step("Open the project, then **More → New invoice**.", "Projects", "the project", "More"),
                step("Add the lines (up to 100), each above zero, and save it as a draft."),
            ),
            list(
                "Invoices are in US dollars and have no tax.",
                "Only client projects are invoiced; internal projects never are.",
                "A draft can be edited or discarded; once issued, an invoice can only be voided.",
            ),
            note("Nothing stops an invoice going above what was agreed with the client, so check the project's \"left to invoice\" first."),
        ],
        related: ["send-invoice", "auto-invoice", "billing-terms"],
    },
    {
        id: "send-invoice",
        title: "Sending (issuing) an invoice",
        category: "billing",
        who: has(P.INVOICE_SEND),
        summary: "Open the invoice and choose Send invoice…: by email, by WhatsApp, or download the PDF and record that you sent it.",
        ask: ["send invoice", "issue invoice", "email invoice", "whatsapp invoice", "resend invoice", "invoice pdf"],
        blocks: [
            steps(
                step("Open the invoice (from the project's billing band, or **Financials → Billing**) and choose **Send invoice…**.", "Financials", "Billing"),
                step("Pick how it is sent: email, WhatsApp, or download the PDF and send it yourself."),
            ),
            list(
                "Sending a draft issues it: it gets its number, and its due date is the issue date plus the payment terms.",
                "Money the client already paid on account is applied to it straight away, oldest first.",
                "\"Sent\" means issued. Each time it is delivered is recorded in its history.",
                "An invoice can be sent again at any time.",
            ),
        ],
        related: ["invoice-statuses", "auto-invoice"],
    },
    {
        id: "auto-invoice",
        title: "Scheduling invoices to go out on their own",
        category: "billing",
        who: has(P.INVOICE_CREATE, P.INVOICE_SEND),
        summary: "Auto invoice splits what is left to bill into 2 to 24 invoices that are issued and emailed on their own days.",
        ask: ["auto invoice", "schedule invoices", "instalments", "installments", "payment plan", "split invoice", "monthly invoices", "recurring invoice"],
        blocks: [
            steps(
                step("On the project's billing band, choose **Auto invoice**.", "Projects", "the project"),
                step("Set the **Amount to split**, how many invoices, when the first one goes out and how often, and who to **Email them to**."),
            ),
            list(
                "Each one waits as a draft until its day, then goes out from 09:00.",
                "With no email address it isn't issued: you're told on its day to send it yourself.",
                "If the email fails, it is tried again every hour, and you're told once.",
                "If money on account already paid it in full, it is issued but not emailed.",
            ),
        ],
        related: ["send-invoice"],
    },
    {
        id: "void-invoice",
        title: "Voiding an invoice",
        category: "billing",
        who: has(P.INVOICE_VOID),
        summary: "Open the invoice and choose Void invoice, with a reason. It keeps its number, and no longer counts.",
        ask: ["void invoice", "cancel invoice", "wrong invoice", "delete invoice", "credit note"],
        blocks: [
            list(
                "Only an issued invoice can be voided; a draft is simply discarded.",
                "An invoice with a payment against it can't be voided: void the payment first.",
                "Its number is kept, so the numbering has no gaps.",
            ),
        ],
    },
    {
        id: "record-payment",
        title: "Recording a client payment",
        category: "billing",
        who: has(P.PAYMENT_RECORD),
        summary: "On the project: More → Record a client payment. Record it against an invoice, or on account when there is no invoice yet.",
        ask: ["record payment", "client paid", "payment received", "add payment", "cash received", "cheque", "deposit", "advance payment", "on account"],
        blocks: [
            steps(
                step("Open the project, then **More → Record a client payment** (or **Record payment** on an invoice).", "Projects", "the project", "More"),
                step("Enter the **Amount received**, its currency and **Date received**, **How it arrived**, and **Against which invoice?** (or none). If you like, file it under an **Account label**."),
            ),
            list(
                "Payments are in USD or LBP. LBP is converted at the rate you type, or the company rate for the day it was received.",
                "A payment against an invoice can't be more than the invoice's balance.",
                "A payment with no invoice is held **on account**. When an invoice is issued, money on account is applied to it automatically, oldest first, each payment whole while it fits.",
                "Payments are never edited or deleted: a wrong one is voided, with a reason.",
            ),
            only(sees("execution"), note("An Execution site can have one initial payment, recorded when the site is created or later.")),
        ],
        related: ["apply-payment", "payment-labels", "billing-terms", "exchange-rates"],
    },
    {
        id: "payment-labels",
        title: "Filing a payment under an account label",
        category: "billing",
        who: hasAny(P.PAYMENT_RECORD, P.FINANCIAL_VIEW),
        summary: "A payment can be filed under one of the company's account labels (Concrete, Finishing…), when it is recorded or afterwards. The label only decides where it counts in the site's account.",
        ask: ["account label", "payment label", "label a payment", "file payment under", "concrete", "finishing", "permits", "change label", "clear label", "no label"],
        blocks: [
            list(
                "Labels are the company's own short list, kept in Settings by a super admin. The same labels file site expenses.",
                "Pick one in **Account label** when you record a payment, Design or Execution. It is optional.",
                "A label that has been archived can't be picked any more. A payment keeps the one it already has, shown as archived, and can be cleared.",
                "A label changes no amount, invoice, TVA or profit. On an Execution site it decides the row a payment counts in under **Rest in account by label**.",
            ),
            only(has(P.PAYMENT_RECORD, P.FINANCIAL_VIEW), steps(
                step("Open the payment's menu (the dots at the end of its row) and choose **Label…**.", "Projects", "the site", "Financials"),
                step("Choose a label, or **No label** to clear it, and **Save**."),
            )),
            note("A voided payment can't be relabelled. Everything else about a payment stays as it was recorded."),
        ],
        related: ["record-payment", "account-figures"],
    },
    {
        id: "apply-payment",
        title: "Applying or voiding a payment",
        category: "billing",
        who: hasAny(P.PAYMENT_RECORD, P.PAYMENT_VOID),
        summary: "A payment held on account can be applied to an issued invoice; a wrong payment is voided, with a reason.",
        ask: ["apply payment", "void payment", "wrong payment", "cancel payment", "on account", "move payment"],
        blocks: [
            only(has(P.PAYMENT_RECORD), para("**Apply to an invoice…** on a payment held on account puts it against an issued invoice of the same project.")),
            only(has(P.PAYMENT_VOID), para("**Void payment…** takes a payment out of every figure. It stays in the history with your reason.")),
        ],
        related: ["record-payment"],
    },
    {
        id: "reminders",
        title: "Reminding clients about overdue invoices",
        category: "billing",
        who: has(P.BILLING_SETTINGS_MANAGE),
        summary: "Settings → Finance → Remind clients of overdue invoices. Reminders are emailed on a schedule you set.",
        ask: ["overdue reminders", "payment reminder", "chase payment", "remind client", "dunning", "late payment email"],
        blocks: [
            list(
                "The first reminder goes a set number of days after the due date (1 by default), then every few days (7 by default), up to a maximum (3 by default).",
                "They go out from 09:00, to the address the invoice was last emailed to, or the client's email contact.",
                "When there is no email address, whoever sends the business's invoices is told to chase it themselves.",
            ),
            links(link("Finance settings", { settings: "finance" })),
        ],
    },
    {
        id: "financials",
        title: "The Financials page",
        category: "billing",
        who: has(P.FINANCIAL_VIEW),
        summary: "Financials shows the money for a period: revenue received, costs, profit and margin, with tabs for projects, clients, billing and costs.",
        ask: ["financials", "finance page", "money page", "profit and loss", "export financials", "revenue report"],
        blocks: [
            list(
                "Pick the period at the top: a quarter, a year, or all time.",
                "**Overview**, **Projects**, **Clients**, **Billing** and **Costs** tabs.",
                "**Export** downloads the projects and the period's totals as CSV.",
            ),
            links(link("Open financials", { business: "financials" })),
        ],
        related: ["revenue", "expected-revenue", "project-cost", "billing-terms"],
    },
];
