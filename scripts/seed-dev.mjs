// Fills an empty development database with a realistic company, through the API only (so every rule holds).
//
//   SETUP_KEY=<Setup:SuperAdminKey from the API's user secrets> node scripts/seed-dev.mjs
//
// Needs the API running in Development (https://localhost:7187) and Mailpit (http://127.0.0.1:8025), where
// the super admin's temporary password and the invitation links arrive. Every account gets the same generated
// password, written to dev-accounts.local (git-ignored, never printed). It refuses to run twice; if it stops
// halfway, restore the database from a backup and run it again.
//
// Work can only be logged in open months, so the logged hours cover the current month.
//
// Two dates can't be set through the API: a person's join date (the day they accept their invitation) and a
// project's start (the day it is created). The sample company is older than today, so both are moved back in
// the database directly (as the API's own integration tests do), in the container's development database only.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const API = process.env.HOURLINE_API ?? "https://localhost:7187/api";
const MAILPIT = process.env.MAILPIT ?? "http://127.0.0.1:8025";
const ACCOUNTS_FILE = new URL("../dev-accounts.local", import.meta.url);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

if (!process.env.SETUP_KEY) throw new Error("Set SETUP_KEY to the API's Setup:SuperAdminKey.");
if (existsSync(ACCOUNTS_FILE)) throw new Error("dev-accounts.local exists: this database was already seeded.");

const PASSWORD = randomBytes(12).toString("base64url");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { token, body, headers } = {}) {
    for (let attempt = 0; ; attempt++) {
        const res = await fetch(API + path, {
            method,
            headers: {
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        // Sign-in, invitation and reset calls share 10 a minute per IP.
        if (res.status === 429 && attempt < 10) {
            await sleep(12_000);
            continue;
        }
        const text = await res.text();
        if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text.slice(0, 400)}`);
        return text ? JSON.parse(text) : null;
    }
}

async function mailText(to, subject) {
    for (let i = 0; i < 40; i++) {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=10`);
        const found = (await res.json()).messages?.find((m) => m.Subject.includes(subject));
        if (found) return (await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json()).Text;
        await sleep(500);
    }
    throw new Error(`No "${subject}" email reached ${to}.`);
}

/* ---------------- dates: company time is Beirut, UTC+3 in September ---------------- */
const OFFSET_HOURS = 3;
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
function companyTime(day, hour, minute = 0) {
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - OFFSET_HOURS, minute));
}
function addDays(d, n) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const weekdaysThisMonth = [];
for (let d = monthStart; d < today; d = addDays(d, 1)) {
    const w = d.getUTCDay();
    if (w >= 1 && w <= 5) weekdaysThisMonth.push(d);
}
function mondayOf(d) {
    return addDays(d, -((d.getUTCDay() + 6) % 7));
}

// A small, repeatable random source so a reseed looks the same.
let seed = 20260930;
function rand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
}
const pick = (list) => list[Math.floor(rand() * list.length)];

// The API may still be starting.
for (let i = 0; ; i++) {
    try {
        if ((await fetch(`${API}/company/branding`)).ok) break;
    } catch {
        // not listening yet
    }
    if (i > 60) throw new Error(`The API at ${API} isn't answering.`);
    await sleep(1000);
}

/* ---------------- the super admin ---------------- */
console.log("Creating the super admin…");
const superEmail = "rana@id-indetails.test";
await api("POST", "/setup/super-admin", {
    headers: { "X-Setup-Key": process.env.SETUP_KEY },
    body: { email: superEmail, firstName: "Rana", lastName: "Khoury", position: "Managing director" },
});
const temporary = /temporary password:\s+(\S+)/.exec(await mailText(superEmail, "super admin account"))[1];
let auth = await api("POST", "/auth/login", { body: { email: superEmail, password: temporary } });
auth = await api("POST", "/auth/change-password", { token: auth.accessToken, body: { currentPassword: temporary, newPassword: PASSWORD } });
const root = auth.accessToken;
const as = (token) => ({
    get: (path) => api("GET", path, { token }),
    post: (path, body) => api("POST", path, { token, body }),
    put: (path, body) => api("PUT", path, { token, body }),
});
const su = as(root);

/* ---------------- company ---------------- */
console.log("Company settings, rates, billing and teams…");
await su.put("/company/settings", {
    name: "ID-Indetails",
    address: "Beirut, Lebanon",
    website: "id-indetails.test",
    weekStart: 1,
    use24HourTime: false,
    defaultCurrency: "USD",
});
await su.post("/exchange-rates", { currency: "LBP", ratePerUsd: 89500, effectiveFrom: `${now.getUTCFullYear()}-01-01` });
const domainSettings = {
    editWindow: "unlimited", allowOverlap: false, allowFutureEntries: false, requireDescription: true, timerEnabled: true,
    logReminder: true, notifyEntry: "off", notifyProject: true, notifyIdle: true, weeklySummary: true, holdLogging: false, autoArchive: false,
};
await su.put("/domain-settings/design", domainSettings);
await su.put("/domain-settings/execution", domainSettings);
const bank = { bankAccount: "ID-Indetails SAL", bankName: "Bank Audi", iban: "LB62 0999 0000 0001 0019 0122 9114", swift: "AUDBLBBX" };
await su.put("/billing-settings/design", { invoicePrefix: "ID", defaultTermsDays: 30, ...bank, termsText: "Bank transfer, cheque or cash are all accepted.", footer: "Thank you for working with ID-Indetails." });
await su.put("/billing-settings/execution", { invoicePrefix: "EX", defaultTermsDays: 15, ...bank, termsText: "Bank transfer, cheque or cash are all accepted.", footer: "Thank you for building with ID-Indetails." });

// The database comes with some default teams; reuse any that already exist.
const teams = Object.fromEntries((await su.get("/teams")).map((t) => [`${t.domain ?? t.domainCode}:${t.name}`, t.id]));
for (const [domainCode, names] of [["design", ["Architecture", "Interiors", "Visualisation"]], ["execution", ["Site", "Procurement"]]]) {
    for (const name of names) {
        teams[name] = teams[`${domainCode}:${name}`] ?? (await su.post("/teams", { name, domainCode })).id;
    }
}

/* ---------------- people ---------------- */
const PEOPLE = [
    { key: "nadia", first: "Nadia", last: "Karam", role: "admin", domain: "design", position: "Design director", pay: ["monthly", 3200] },
    { key: "sarah", first: "Sarah", last: "Haddad", role: "employee", domain: "design", team: "Interiors", position: "Senior interior designer", pay: ["monthly", 1800] },
    { key: "omar", first: "Omar", last: "Fares", role: "employee", domain: "design", team: "Architecture", position: "Architect", pay: ["monthly", 2000] },
    { key: "lina", first: "Lina", last: "Saad", role: "employee", domain: "design", team: "Interiors", position: "Interior designer", pay: ["hourly", 12] },
    { key: "rami", first: "Rami", last: "Aoun", role: "employee", domain: "design", team: "Visualisation", position: "3D visualiser", pay: ["hourly", 14] },
    { key: "maya", first: "Maya", last: "Nassar", role: "employee", domain: "design", team: "Architecture", position: "Junior architect", pay: ["hourly", 9] },
    { key: "elie", first: "Elie", last: "Khalil", role: "employee", domain: "design", team: "Architecture", position: "Draughtsman", pay: ["hourly", 8] },
    { key: "yara", first: "Yara", last: "Mansour", role: "employee", domain: "design", team: "Visualisation", position: "Visualisation lead", pay: ["monthly", 1600] },
    { key: "karim", first: "Karim", last: "Jaber", role: "admin", domain: "execution", position: "Operations manager", pay: ["monthly", 2800] },
    { key: "tarek", first: "Tarek", last: "Salem", role: "employee", domain: "execution", team: "Site", position: "Site engineer", pay: ["monthly", 1500] },
    { key: "joe", first: "Joe", last: "Hanna", role: "employee", domain: "execution", team: "Site", position: "Foreman", pay: ["monthly", 1100] },
    { key: "nour", first: "Nour", last: "Aziz", role: "employee", domain: "execution", team: "Procurement", position: "Procurement officer", pay: ["monthly", 1200] },
    { key: "walid", first: "Walid", last: "Chami", role: "employee", domain: "execution", team: "Site", position: "Site supervisor", pay: ["monthly", 1300] },
];

console.log(`Inviting ${PEOPLE.length} people (sign-up calls are rate limited, so this takes a couple of minutes)…`);
const people = {};
for (const person of PEOPLE) {
    const email = `${person.key}@id-indetails.test`;
    const invite = await su.post("/invitations", {
        email,
        role: person.role,
        domainCode: person.domain,
        teamId: person.team ? teams[person.team] : null,
        position: person.position,
        pay: { basis: person.pay[0], amount: person.pay[1], currency: "USD", effectiveFrom: `${now.getUTCFullYear()}-01-01` },
    });
    const text = await mailText(email, "invited");
    const token = decodeURIComponent(/[?&]token=([^\s&]+)/.exec(text)[1]);
    const accepted = await api("POST", "/invitations/accept", {
        body: { token, firstName: person.first, lastName: person.last, phone: "+961 3 555 " + String(100 + PEOPLE.indexOf(person)), password: PASSWORD },
    });
    people[person.key] = { ...person, email, id: invite.userId, token: accepted.accessToken, api: as(accepted.accessToken) };
}
const nadia = people.nadia.api, karim = people.karim.api;

function sql(statements) {
    execFileSync("docker", ["exec", "id-indetails-mysql", "sh", "-c", `mysql -uroot -p"$MYSQL_ROOT_PASSWORD" id_indetails -e "${statements}" 2>/dev/null`]);
}

console.log("Moving the staff's join dates back…");
const joined = `UPDATE users SET joined_on = '${now.getUTCFullYear() - 3}-03-01' WHERE email = '${superEmail}'; ` + PEOPLE.map((person, i) => `UPDATE users SET joined_on = '${now.getUTCFullYear() - 1 - (i % 3)}-0${1 + (i % 9)}-15' WHERE email = '${person.key}@id-indetails.test';`).join(" ");
const periods = "UPDATE employment_periods ep JOIN users u ON u.id = ep.user_id SET ep.started_on = u.joined_on WHERE u.email LIKE '%@id-indetails.test';";
sql(`${joined} ${periods}`);

/* ---------------- clients ---------------- */
console.log("Clients and projects…");
async function client(api, domainCode, name, organisation, label, email, phone) {
    return (await api.post("/clients", {
        name, organisation, label, domainCode, note: null,
        contacts: [
            { kind: "email", value: email, label: "Work", isWhatsapp: false, isPrimary: true },
            { kind: "phone", value: phone, label: "Mobile", isWhatsapp: true, isPrimary: false },
        ],
    })).id;
}
const clients = {
    haddad: await client(nadia, "design", "Georges Haddad", "Haddad Holdings", "Corporate", "georges@haddad-holdings.test", "+961 3 111 222"),
    mounir: await client(nadia, "design", "Mounir Aoun", null, "Residential", "mounir.aoun@mail.test", "+961 71 222 333"),
    cedar: await client(nadia, "design", "Rita Frem", "Cedar Bank SAL", "Commercial", "rita.frem@cedarbank.test", "+961 1 333 444"),
    misk: await client(nadia, "design", "Hala Rizk", "Beit Misk Residences", "Residential", "hala@beitmisk.test", "+961 76 444 555"),
    nourStudio: await client(nadia, "design", "Nour Daher", "Studio Nour", "Hospitality", "nour@studionour.test", "+961 70 555 666"),
    towers: await client(karim, "execution", "Fadi Saliba", "Achrafieh Towers SAL", "Commercial", "fadi@achrafiehtowers.test", "+961 3 666 777"),
    lofts: await client(karim, "execution", "Joanna Karam", "Mar Mikhael Lofts", "Residential", "joanna@mmlofts.test", "+961 71 777 888"),
    marina: await client(karim, "execution", "Samir Ghosn", null, "Residential", "samir.ghosn@mail.test", "+961 3 888 999"),
};

/* ---------------- projects ---------------- */
async function project(api, body) {
    return (await api.post("/projects", body)).id;
}
const DESIGN = [
    { key: "hq", title: "Haddad Holdings HQ fit-out", client: "haddad", revenue: 48000, icon: "building", tint: "#0C6B69", team: ["sarah", "omar", "rami", "elie"], words: ["Space planning for level 3", "Reception joinery details", "Lighting layout revisions", "Material board for the boardroom", "Coordination with the MEP engineer", "Ceiling plan drawings"] },
    { key: "villa", title: "Villa Mounir interiors", client: "mounir", revenue: 26000, icon: "palette", tint: "#8A5A2B", team: ["sarah", "lina", "yara"], words: ["Living room concept", "Kitchen elevations", "Master bedroom mood board", "Furniture schedule", "Client revisions to the lounge", "Bathroom tiling layout"] },
    { key: "bank", title: "Cedar Bank branch refresh", client: "cedar", revenue: 35000, icon: "briefcase", tint: "#3F4B63", team: ["omar", "maya", "rami", "elie"], words: ["Branch survey drawings", "Teller counter design", "Signage and wayfinding", "Accessibility review", "Render of the banking hall", "Tender drawings"] },
    { key: "misk", title: "Beit Misk show apartment", client: "misk", revenue: 18000, icon: "target", tint: "#6C5CE7", team: ["lina", "yara", "maya"], words: ["Show apartment layout", "Styling list", "Soft furnishings selection", "Photo-ready renders", "Lighting scenes"] },
    { key: "studio", title: "Studio Nour brand space", client: "nourStudio", revenue: 9500, icon: "flag", tint: "#C58200", team: ["rami", "lina"], words: ["Brand space concept", "Counter and display design", "Material samples"] },
    { key: "portfolio", title: "Portfolio and competition entries", client: null, revenue: null, icon: "folder", tint: "#697572", team: ["yara", "maya", "omar"], words: ["Competition boards", "Portfolio photography edit", "Award submission text"] },
];
const projects = {};
for (const p of DESIGN) {
    projects[p.key] = await project(nadia, {
        title: p.title,
        description: `${p.title} for ${p.client ? "the client" : "the studio"}, from concept to handover drawings.`,
        icon: p.icon,
        tint: p.tint,
        domainCode: "design",
        billingType: p.client ? "client" : "internal",
        clientId: p.client ? clients[p.client] : null,
        revenue: p.revenue,
        ownerId: people.nadia.id,
        targetDate: dayKey(addDays(today, 30 + Math.floor(rand() * 90))),
    });
}
const SITES = [
    { key: "lobby", title: "Achrafieh Towers lobby", client: "towers", fee: 12000, markup: 0.15, initial: 10000, icon: "building", tint: "#0C6B69" },
    { key: "loft", title: "Mar Mikhael loft renovation", client: "lofts", fee: 8000, markup: 0.2, initial: 5000, icon: "grid", tint: "#8A5A2B" },
    { key: "marina", title: "Dbayeh marina villa", client: "marina", fee: 20000, markup: 0.12, initial: 15000, icon: "compass", tint: "#3F4B63" },
];
for (const s of SITES) {
    projects[s.key] = await project(karim, {
        title: s.title,
        description: `${s.title}: site works, materials and ground labour.`,
        icon: s.icon,
        tint: s.tint,
        domainCode: "execution",
        billingType: "client",
        clientId: clients[s.client],
        projectFee: s.fee,
        materialMarkup: s.markup,
        ownerId: people.karim.id,
        targetDate: dayKey(addDays(today, 60 + Math.floor(rand() * 120))),
        initialPayment: { amount: s.initial, currency: "USD", method: "bank", receivedOn: dayKey(monthStart), reference: "Advance", note: null },
        labourDefaults: { workers: 6, dailyPay: 25 },
    });
}

console.log("Moving the projects' start dates back…");
sql(Object.values(projects).map((id, i) => {
    const started = dayKey(addDays(monthStart, -12 - i * 9));
    return `UPDATE projects SET start_date = '${started}', created_at = '${started} 08:00:00' WHERE id = ${id};`;
}).join(" "));

/* ---------------- this month's Design work ---------------- */
console.log("Logging this month's Design work…");
const assignments = {};
for (const p of DESIGN) for (const who of p.team) (assignments[who] ??= []).push(p);
let entries = 0;
for (const [who, list] of Object.entries(assignments)) {
    const person = people[who];
    for (const day of weekdaysThisMonth) {
        if (rand() < 0.07) continue;                      // a day off now and then
        let minute = 9 * 60 + Math.floor(rand() * 3) * 10; // starts between 9:00 and 9:20
        const end = rand() < 0.15 ? 18 * 60 + 30 : 17 * 60; // some long days
        while (minute < end - 45) {
            const length = Math.min(end - minute, 60 + Math.floor(rand() * 5) * 30);
            const p = pick(list);
            await person.api.post("/work-entries", {
                projectId: projects[p.key],
                description: pick(p.words),
                startedAt: companyTime(day, 0, minute).toISOString(),
                endedAt: companyTime(day, 0, minute + length).toISOString(),
                moves: [],
            });
            entries++;
            minute += length + (rand() < 0.3 ? 30 : 0);
        }
    }
}
console.log(`  ${entries} work entries`);

/* ---------------- requirements, meetings, expenses ---------------- */
console.log("Requirements, meetings and expenses…");
for (const p of [...DESIGN, ...SITES]) {
    const api = DESIGN.includes(p) ? nadia : karim;
    const team = DESIGN.includes(p) ? p.team : ["tarek", "joe", "walid"];
    const texts = DESIGN.includes(p)
        ? ["Client sign-off on the concept", "Issue the construction drawings", "Final material schedule", "Handover package"]
        : ["Order the lobby stone", "Electrical first fix inspection", "Snag list walk-through"];
    for (const [i, text] of texts.entries()) {
        const req = await api.post(`/projects/${projects[p.key]}/requirements`, {
            text,
            deadline: dayKey(addDays(today, -10 + i * 9)),
            assigneeIds: [people[team[i % team.length]].id],
        });
        if (i === 0) await api.post(`/projects/${projects[p.key]}/requirements/${req.id}/done`);
    }
    for (const [i, offset] of [-12, -4, 3].entries()) {
        const day = addDays(today, offset);
        await api.post(`/projects/${projects[p.key]}/meetings`, {
            startsAt: companyTime(day, 11 + i).toISOString(),
            endsAt: companyTime(day, 12 + i).toISOString(),
            topic: ["Kick-off review", "Progress meeting", "Client presentation"][i],
            description: null,
        });
    }
}
for (const [key, items] of Object.entries({
    hq: [["Printing of drawing sets", 180, "services"], ["Material samples", 420, "assets"]],
    villa: [["Site visit transport", 60, "travel"], ["Fabric swatches", 95, "assets"]],
    bank: [["Survey equipment rental", 250, "hardware"]],
    misk: [["Styling props", 640, "assets"]],
})) {
    for (const [label, amount, category] of items) {
        await nadia.post(`/projects/${projects[key]}/expenses`, { label, amount, currency: "USD", category, spentOn: dayKey(addDays(today, -Math.floor(rand() * 20))), note: null });
    }
}

/* ---------------- Execution: materials, labour, statement ---------------- */
console.log("Site materials, labour weeks and a statement…");
const MATERIALS = [
    ["Cement", 40, "bag", 7.5, "Holcim"], ["Rebar 12mm", 1.2, "ton", 780, "Steel Co"], ["Porcelain tiles", 180, "m²", 22, "Tile House"],
    ["Paint", 30, "gallon", 28, "Sipes"], ["Plasterboard", 90, "sheet", 11, "Gypsum Lb"], ["Electrical cable", 400, "m", 1.4, "Cables SAL"],
];
for (const [i, s] of SITES.entries()) {
    const recorder = [people.tarek, people.nour, people.walid][i];
    await recorder.api.post(`/projects/${projects[s.key]}/materials`, {
        items: MATERIALS.slice(i, i + 4).map(([name, quantity, unit, unitCost, supplier]) => ({ name, quantity, unit, unitCost, supplier, note: null })),
    });
    for (let week = mondayOf(monthStart); week < mondayOf(today); week = addDays(week, 7)) {
        const days = [];
        for (let d = 0; d < 6; d++) {
            const date = addDays(week, d);
            if (date >= monthStart && date < today) days.push({ date: dayKey(date), workers: 4 + Math.floor(rand() * 4), dailyPay: 25 });
        }
        if (days.length) await people.joe.api.put(`/projects/${projects[s.key]}/labour-weeks/${dayKey(week)}`, { days, note: null });
    }
}
await karim.post(`/projects/${projects.lobby}/statements`, { mode: "detail", includeEarlier: false, excludedMaterialIds: [], unlistedTypeKeys: [] });

/* ---------------- invoices and payments ---------------- */
console.log("Invoices and payments…");
async function invoice(api, projectKey, lines, issue) {
    const draft = await api.post(`/projects/${projects[projectKey]}/invoices`, { lines: lines.map(([description, amount]) => ({ description, amount })), termsDays: 30, notes: null });
    if (issue) await api.post(`/invoices/${draft.id}/issue`, { issuedOn: dayKey(addDays(today, -issue)) });
    return draft.id;
}
const hq1 = await invoice(nadia, "hq", [["Deposit - 30% of the agreed fee", 14400]], 25);
const hq2 = await invoice(nadia, "hq", [["Concept design milestone", 9600]], 6);
const villa1 = await invoice(nadia, "villa", [["Deposit", 7800]], 40);
await invoice(nadia, "bank", [["Survey and concept", 10500]], null);
await nadia.post(`/projects/${projects.hq}/payments`, { amount: 14400, currency: "USD", method: "bank", receivedOn: dayKey(addDays(today, -18)), reference: "TRF-2231", invoiceId: hq1, isInitial: false });
await nadia.post(`/projects/${projects.hq}/payments`, { amount: 4000, currency: "USD", method: "cheque", receivedOn: dayKey(addDays(today, -2)), reference: "CHQ 55120", invoiceId: hq2, isInitial: false });
void villa1;
await invoice(karim, "lobby", [["Materials and works to date", 6500]], 9);

/* ---------------- done ---------------- */
const lines = [
    "# Development accounts (created by scripts/seed-dev.mjs)",
    "",
    `Every account's password: ${PASSWORD}`,
    "",
    `- ${superEmail} (super admin)`,
    ...PEOPLE.map((p) => `- ${p.key}@id-indetails.test (${p.role}, ${p.domain}${p.team ? `, ${p.team}` : ""})`),
    "",
];
writeFileSync(ACCOUNTS_FILE, lines.join("\n"));
console.log(`Done. Accounts are listed in dev-accounts.local (${PEOPLE.length + 1} of them).`);
