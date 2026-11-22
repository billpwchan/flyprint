import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { after, before } from "node:test";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { startProdServer } from "vinext/server/prod-server";

// Accounts and importing against the production server, with an empty
// database of its own. Only files read without the model are imported here.
let origin = "";
let server;
before(async () => {
  process.env.FLYPRINT_DATA_DIR = await mkdtemp(join(tmpdir(), "flyprint-accounts-"));
  delete process.env.ANTHROPIC_API_KEY;
  const started = await startProdServer({ port: 0, host: "127.0.0.1", outDir: fileURLToPath(new URL("../dist", import.meta.url)), silent: true });
  server = started.server;
  origin = `http://127.0.0.1:${started.port}`;
});
after(() => server?.close());

const fixture = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url));
const cookieOf = (response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

async function api(path, { method, body, form, cookie = "", from = origin, network, reader } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: method ?? (body || form ? "POST" : "GET"),
    headers: { origin: from, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...(network ? { "x-forwarded-for": network } : {}), ...(reader ? { "cf-connecting-ip": reader } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
    redirect: "manual",
  });
  const data = (response.headers.get("content-type") ?? "").includes("json") ? await response.json() : null;
  return { response, status: response.status, data };
}

// network: sign up from another address, so the suite stays under the hourly limit of one.
async function signUp(email, name, password = "a-long-password", network) {
  const result = await api("/api/auth/signup", { body: { email, password, name }, network });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return cookieOf(result.response);
}

async function importFiles(cookie, files) {
  const form = new FormData();
  for (const [name, type] of files) form.append("files", new Blob([await fixture(name)], { type }), name);
  const started = await api("/api/imports", { form, cookie });
  assert.equal(started.status, 202, JSON.stringify(started.data));
  for (let attempt = 0; attempt < 60; attempt++) {
    const { data } = await api(`/api/imports/${started.data.id}`, { cookie });
    if (data.status !== "reading") return data;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("import did not finish");
}

// A visitor's import: the upload itself starts the trial and hands back its cookie.
async function tryImport(files, { cookie = "", network, ref } = {}) {
  const form = new FormData();
  for (const [name, type] of files) form.append("files", new Blob([await fixture(name)], { type }), name);
  const started = await api("/api/imports", { form, cookie: [cookie, ref ? `flyprint_ref=${ref}` : ""].filter(Boolean).join("; "), network });
  assert.equal(started.status, 202, JSON.stringify(started.data));
  const trial = cookie || cookieOf(started.response);
  assert.match(trial, /^waypoint_session=/);
  for (let attempt = 0; attempt < 60; attempt++) {
    const { data } = await api(`/api/imports/${started.data.id}`, { cookie: trial });
    if (data.status !== "reading") return { cookie: trial, draft: data, header: started.response.headers.get("set-cookie") };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("import did not finish");
}
const saveAll = (cookie, draft) => api(`/api/imports/${draft.id}`, { cookie, body: { action: "save", edits: draft.rows.map((row) => ({ key: row.key, include: row.include, fields: {} })) } });
const usersTable = () => new DatabaseSync(join(process.env.FLYPRINT_DATA_DIR, "waypoint.db"));

const page = async (path, cookie) => (await fetch(`${origin}${path}`, { headers: { cookie, "accept-language": "zh-CN" }, redirect: "manual" })).text();

// First in the file: names learned in one reader's import are cached once the
// server first reads them, so this row has to be in place before that.
test("airport search never shows a name learned from someone's import", async () => {
  await api("/api/auth/logout", { method: "POST" });
  const db = usersTable();
  db.prepare("INSERT INTO names (kind, code, value) VALUES ('place', 'ACK', ?)").run(JSON.stringify({ city: ["学来的城", "學來的城", "Learned City"], name: ["学来的机场", "學來的機場", "Learned Airport"] }));
  db.close();
  const found = await api("/api/airports?q=ACK");
  const ack = found.data.airports.find((match) => match.code === "ACK");
  assert.ok(ack, "the airport is still found by its code");
  assert.doesNotMatch(JSON.stringify(ack), /学来的|學來的|Learned/);
});

test("settings ask a visitor to sign in first; importing does not", async () => {
  const response = await fetch(`${origin}/settings`, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
  assert.match(await page("/import", ""), /不用注册/);
  assert.match(await page("/", ""), /href="\/import"[^>]*>开始记录/, "the first step on the home page is importing");
  assert.equal((await api("/api/account")).status, 401);
  const home = await page("/", "");
  assert.match(home, /示例旅客/);
});

test("signing up, in and out, and what is refused", async () => {
  assert.equal((await api("/api/auth/signup", { body: { email: "x@example.com", password: "a-long-password", name: "X" }, from: "https://elsewhere.example" })).status, 403);
  assert.equal((await api("/api/auth/signup", { body: { email: "x@example.com", password: "short", name: "X" } })).data.error, "password_short");
  assert.equal((await api("/api/auth/signup", { body: { email: "not-an-email", password: "a-long-password", name: "X" } })).data.error, "email");

  const signup = await api("/api/auth/signup", { body: { email: "Pilot@Example.com", password: "a-long-password", name: "Pilot" } });
  assert.equal(signup.status, 201);
  const header = signup.response.headers.get("set-cookie");
  assert.match(header, /waypoint_session=/);
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  assert.equal((await api("/api/auth/signup", { body: { email: "pilot@example.com", password: "a-long-password", name: "Again" } })).status, 409);

  assert.equal((await api("/api/auth/login", { body: { email: "pilot@example.com", password: "wrong-password" } })).data.error, "credentials");
  const login = await api("/api/auth/login", { body: { email: "PILOT@example.com", password: "a-long-password" } });
  assert.equal(login.status, 200);
  const cookie = cookieOf(login.response);
  const account = await api("/api/account", { cookie });
  assert.equal(account.data.user.email, "pilot@example.com");
  assert.equal(account.data.user.flights, 0);
  assert.match(await page("/", cookie), /还没有航班/, "a new account starts at importing");

  await api("/api/auth/logout", { method: "POST", cookie });
  assert.equal((await api("/api/account", { cookie })).status, 401, "the session ends on sign-out");
});

test("an import is read, checked, saved, exported and undone", async () => {
  const cookie = await signUp("importer@example.com", "Importer");
  const draft = await importFiles(cookie, [["flighty.csv", "text/csv"], ["trip.ics", "text/calendar"]]);
  assert.equal(draft.status, "ready", JSON.stringify(draft.error));
  const byFlight = Object.fromEntries(draft.rows.map((row) => [row.fields.flight, row]));
  assert.deepEqual(Object.keys(byFlight).sort(), ["BA27", "CX255", "CX900", "SQ231"]);
  assert.equal(byFlight.CX900.state, "cancelled");
  assert.equal(byFlight.CX900.include, false);
  assert.equal(byFlight.CX255.fields.depart, "23:45", "Flighty rows use scheduled gate times");
  assert.equal(byFlight.CX255.fields.seat, "62K");
  assert.equal(byFlight.SQ231.fields.depart, "23:05", "calendar times become the airport's local time");
  assert.equal(byFlight.SQ231.fields.date, "2024-03-10");
  assert.ok(draft.atlas.places.LHR && draft.atlas.places.SYD, "the draft brings names for its airports");

  const edits = draft.rows.map((row) => ({ key: row.key, include: row.include, fields: {} }));
  const checked = await api(`/api/imports/${draft.id}`, { cookie, body: { action: "check", edits: edits.map((edit) => edit.key === byFlight.BA27.key ? { ...edit, fields: { seat: "1a" } } : edit) } });
  assert.equal(checked.data.rows.find((row) => row.key === byFlight.BA27.key).fields.seat, "1A");

  const saved = await api(`/api/imports/${draft.id}`, { cookie, body: { action: "save", edits } });
  assert.equal(saved.data.added, 3);
  assert.match(await page("/", cookie), /<b>3<\/b><span>次飞行<\/span>/);

  const exported = await fetch(`${origin}/api/export`, { headers: { cookie } });
  assert.match(exported.headers.get("content-disposition"), /attachment; filename="flyprint-flights-\d{4}-\d{2}-\d{2}\.json"/);
  const archive = await exported.json();
  assert.equal(archive.format, "flyprint");
  assert.equal(archive.flights.length, 3);

  const again = await importFiles(cookie, [["flighty.csv", "text/csv"]]);
  assert.equal(again.rows.filter((row) => row.state === "duplicate").length, 2, "flights already logged are recognised");
  assert.equal(again.rows.some((row) => row.include), false);
  assert.equal((await api(`/api/imports/${again.id}`, { method: "DELETE", cookie })).data.status, "discarded");

  const undone = await api(`/api/imports/${draft.id}`, { method: "DELETE", cookie });
  assert.equal(undone.data.status, "undone");
  assert.equal((await api("/api/account", { cookie })).data.user.flights, 0);
});

test("uploading the whole history again never writes a flight twice", async () => {
  const cookie = await signUp("again@example.com", "Again");
  const first = await importFiles(cookie, [["flighty.csv", "text/csv"], ["trip.ics", "text/calendar"]]);
  const tickAll = (draft, include = (row) => row.include) => draft.rows.map((row) => ({ key: row.key, include: include(row), fields: {} }));
  assert.equal((await api(`/api/imports/${first.id}`, { cookie, body: { action: "save", edits: tickAll(first) } })).data.added, 3);

  // The same history from another app, spelled its way, with one new flight.
  const history = [
    "Date,Flight,From,To",
    "2025-04-20,BA27,LHR,HKG", // logged
    "2025-04-02,CX 0255,HKG,LHR", // logged, spelled differently
    "2025-04-02,BA7090,HKG,LHR", // the same day and route under a partner's number
    "2025-04-20,BA27,LHR,MAN", // the same number on another route
    "2024-03-11,SQ231,SIN,SYD", // the same flight dated a day later
    "2025-06-01,QF128,HKG,SYD", // new
  ].join("\n");
  const upload = async () => {
    const form = new FormData();
    form.append("files", new Blob([history], { type: "text/csv" }), "history.csv");
    const started = await api("/api/imports", { form, cookie });
    for (;;) {
      const { data } = await api(`/api/imports/${started.data.id}`, { cookie });
      if (data.status !== "reading") return data;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };
  const draft = await upload();
  const state = Object.fromEntries(draft.rows.map((row) => [`${row.fields.flight} ${row.fields.destination} ${row.fields.date}`, [row.state, !!row.likely, row.include]]));
  assert.deepEqual(state["BA27 HKG 2025-04-20"], ["duplicate", false, false]);
  assert.deepEqual(state["CX255 LHR 2025-04-02"], ["duplicate", false, false]);
  assert.deepEqual(state["BA7090 LHR 2025-04-02"], ["duplicate", true, false]);
  assert.deepEqual(state["BA27 MAN 2025-04-20"], ["duplicate", true, false]);
  assert.deepEqual(state["SQ231 SYD 2024-03-11"], ["duplicate", true, false]);
  assert.deepEqual(state["QF128 SYD 2025-06-01"], ["new", false, true]);

  // A second upload of the same file, read before the first is saved.
  const stale = await upload();
  // Everything ticked: the sure duplicates are still not written; the likely ones are the reader's call.
  assert.equal((await api(`/api/imports/${draft.id}`, { cookie, body: { action: "save", edits: tickAll(draft, () => true) } })).data.added, 4);
  const late = await api(`/api/imports/${stale.id}`, { cookie, body: { action: "save", edits: tickAll(stale, () => true) } });
  assert.equal(late.data.added, 0, "a draft read before another save cannot add what that save added");
  assert.equal((await api("/api/account", { cookie })).data.user.flights, 7);
});

test("a booking still ahead waits to count, and a changed or cancelled one updates in place", async () => {
  const cookie = await signUp("booked@example.com", "Booked", undefined, "192.0.2.20");
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const header = "Date,Airline,Flight,From,To,Canceled,Gate Departure (Scheduled),Gate Arrival (Scheduled),Seat";
  const row = (date, airline, number, from, to, cancelled, out, into, seat = "") => `${date},${airline},${number},${from},${to},${cancelled},${date}T${out},${date}T${into},${seat}`;
  const upload = async (lines) => {
    const form = new FormData();
    form.append("files", new Blob([[header, ...lines].join("\n")], { type: "text/csv" }), "flighty.csv");
    const started = await api("/api/imports", { form, cookie });
    for (;;) {
      const { data } = await api(`/api/imports/${started.data.id}`, { cookie });
      if (data.status !== "reading") return data;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };
  const save = (draft) => api(`/api/imports/${draft.id}`, { cookie, body: { action: "save", edits: draft.rows.map((item) => ({ key: item.key, include: item.include, fields: {}, seen: item.state })) } });
  const undo = async (draft) => (await api(`/api/imports/${draft.id}`, { method: "DELETE", cookie })).data;
  const flights = async () => Object.fromEntries((await (await fetch(`${origin}/api/export`, { headers: { cookie } })).json()).flights.map((flight) => [flight.flight, flight]));

  const booked = await upload([
    row("2025-05-01", "CX", "255", "HKG", "LHR", "false", "23:45", "06:20"),
    row(day(30), "DY", "370", "OSL", "TOS", "false", "07:40", "09:30"),
    row(day(37), "DY", "371", "TOS", "OSL", "false", "18:20", "20:10"),
  ]);
  assert.equal((await save(booked)).data.added, 3);
  const home = await page("/", cookie);
  assert.match(home, /<b>1<\/b><span>次飞行<\/span>/, "flights still ahead are not counted as flown");
  assert.match(home, /下一程/);
  assert.match(home, /还有 30 天/);

  // The airline moved one flight and cancelled the other; the second was rebooked onto a later one.
  const changed = await upload([
    row(day(30), "DY", "370", "OSL", "TOS", "false", "08:25", "10:15", "12A"),
    row(day(37), "DY", "371", "TOS", "OSL", "true", "18:20", "20:10"),
    row(day(37), "DY", "373", "TOS", "OSL", "false", "19:55", "21:45"),
  ]);
  const state = Object.fromEntries(changed.rows.map((item) => [item.fields.flight, [item.state, item.include]]));
  assert.deepEqual(state, { DY370: ["update", true], DY371: ["remove", true], DY373: ["new", true] });
  const update = changed.rows.find((item) => item.fields.flight === "DY370");
  assert.deepEqual(update.changes.map((change) => [change.field, change.from, change.to]), [["depart", "07:40", "08:25"], ["arrive", "09:30", "10:15"], ["seat", "", "12A"]]);
  assert.deepEqual((await save(changed)).data, { added: 1, updated: 1, removed: 1 });
  let now = await flights();
  assert.deepEqual(Object.keys(now).sort(), ["CX255", "DY370", "DY373"]);
  assert.deepEqual([now.DY370.depart, now.DY370.arrive, now.DY370.seat], ["08:25", "10:15", "12A"]);

  // Saving the same changes again finds nothing left to change.
  const again = await upload([row(day(30), "DY", "370", "OSL", "TOS", "false", "08:25", "10:15", "12A")]);
  assert.deepEqual(again.rows.map((item) => [item.state, item.include]), [["duplicate", false]]);
  assert.equal((await api(`/api/imports/${again.id}`, { method: "DELETE", cookie })).data.status, "discarded");

  // A cancelled booking of a flight already flown is history, not something to remove.
  const past = await upload([row("2025-05-01", "CX", "255", "HKG", "LHR", "true", "23:45", "06:20")]);
  assert.deepEqual(past.rows.map((item) => [item.state, item.include]), [["cancelled", false]]);
  assert.equal((await api(`/api/imports/${past.id}`, { method: "DELETE", cookie })).data.status, "discarded");

  // Undoing puts back exactly what was there.
  const undone = await api(`/api/imports/${changed.id}`, { method: "DELETE", cookie });
  assert.deepEqual(undone.data, { status: "undone", removed: 1, restored: 1, reverted: 1 });
  now = await flights();
  assert.deepEqual(Object.keys(now).sort(), ["CX255", "DY370", "DY371"]);
  assert.deepEqual([now.DY370.depart, now.DY370.arrive, now.DY370.seat ?? ""], ["07:40", "09:30", ""]);

  // Two later changes to one flight: undoing the first leaves what the second wrote.
  const seat = await upload([row(day(30), "DY", "370", "OSL", "TOS", "false", "07:40", "09:30", "14C")]);
  assert.equal((await save(seat)).data.updated, 1);
  const times = await upload([row(day(30), "DY", "370", "OSL", "TOS", "false", "08:25", "10:15", "14C")]);
  assert.equal((await save(times)).data.updated, 1);
  assert.equal((await undo(seat)).reverted, 1);
  now = await flights();
  assert.deepEqual([now.DY370.depart, now.DY370.seat ?? ""], ["08:25", ""], "the later times stay, the seat goes back");
  await undo(times);
  now = await flights();
  assert.deepEqual([now.DY370.depart, now.DY370.seat ?? ""], ["07:40", ""]);

  // Both changed the times: undoing the earlier one leaves the later times whole, with their own flight time.
  const early = await upload([row(day(30), "DY", "370", "OSL", "TOS", "false", "08:10", "10:00")]);
  await save(early);
  const later = await upload([row(day(30), "DY", "370", "OSL", "TOS", "false", "09:00", "11:20")]);
  await save(later);
  await undo(early);
  now = await flights();
  assert.deepEqual([now.DY370.depart, now.DY370.arrive, now.DY370.durationMinutes], ["09:00", "11:20", 140]);
  await undo(later);
  now = await flights();
  assert.deepEqual([now.DY370.depart, now.DY370.arrive, now.DY370.durationMinutes], ["07:40", "09:30", 110], "undone in either order, the flight goes back to how it was");

  // A cancellation read twice: once one is saved, the other no longer acts, and the reader is shown why.
  const first = await upload([row(day(37), "DY", "371", "TOS", "OSL", "true", "18:20", "20:10")]);
  const second = await upload([row(day(37), "DY", "371", "TOS", "OSL", "true", "18:20", "20:10")]);
  assert.equal((await save(second)).data.removed, 1);
  const stale = await save(first);
  assert.equal(stale.data.changed, true);
  assert.deepEqual(stale.data.rows.map((item) => [item.state, item.include]), [["cancelled", false]]);
  assert.equal((await api(`/api/imports/${first.id}`, { cookie, body: { action: "save", edits: stale.data.rows.map((item) => ({ key: item.key, include: item.include, fields: {}, seen: item.state })) } })).data.added, 0);
  assert.equal("DY371" in (await flights()), false, "a cancelled booking is never written as a flight");
  assert.equal((await undo(second)).restored, 1);
  assert.equal("DY371" in (await flights()), true);

  // A flight whose own import was undone stays gone when the removal is undone too.
  const added = await upload([row(day(40), "TP", "1271", "LIS", "VIE", "false", "08:00", "12:15")]);
  assert.equal((await save(added)).data.added, 1);
  const dropped = await upload([row(day(40), "TP", "1271", "LIS", "VIE", "true", "08:00", "12:15")]);
  assert.equal((await save(dropped)).data.removed, 1);
  assert.equal((await undo(added)).removed, 0);
  assert.equal((await undo(dropped)).restored, 0);
  assert.equal("TP1271" in (await flights()), false);
});

test("linked accounts keep their own flights and meet on a page of the ones both logged", async () => {
  const a = await signUp("first@example.com", "First");
  const b = await signUp("second@example.com", "Second");
  const link = (cookie, body) => api("/api/links", { cookie, body });
  const save = (cookie) => importFiles(cookie, [["trip.ics", "text/calendar"]])
    .then((draft) => api(`/api/imports/${draft.id}`, { cookie, body: { action: "save", edits: draft.rows.map((row) => ({ key: row.key, include: row.include, fields: {} })) } }));
  assert.equal((await link(a, { action: "invite", email: "first@example.com" })).data.error, "self");
  assert.equal((await link(a, { action: "invite", email: "second@example.com" })).data.result, "invited");
  const received = (await api("/api/account", { cookie: b })).data.received;
  assert.equal(received.length, 1);
  assert.equal((await link(b, { action: "accept", from: received[0].id })).status, 200);
  const links = (await api("/api/account", { cookie: a })).data.links;
  assert.deepEqual(links.map((entry) => [entry.email, entry.mine, entry.theirs]), [["second@example.com", "together", "together"]]);
  const second = links[0].id;
  const first = (await api("/api/account", { cookie: b })).data.links[0].id;

  await save(b);
  assert.doesNotMatch(await page("/log", a), /SQ231/, "a linked account's flights stay in that account");
  assert.match(await page(`/with/${second}`, a), /还没有和 Second 都记下的航班/);
  await save(a);
  assert.match(await page(`/with/${second}`, a), /和 Second 一起飞了 1 次/, "the same flight in both accounts counts once, for both");
  assert.match(await page(`/with/${first}`, b), /和 First 一起飞了 1 次/);

  // Each side decides about the rest of its routes; laying them over each other needs both.
  assert.equal((await link(a, { action: "share", with: second, shares: "all" })).status, 200);
  assert.doesNotMatch(await page(`/with/${second}`, a), /加上各自的/);
  assert.equal((await link(b, { action: "share", with: first, shares: "all" })).status, 200);
  assert.match(await page(`/with/${second}`, a), /加上各自的/);
  assert.equal((await link(a, { action: "share", with: second, shares: "everything" })).data.error, "action");

  // Unlinking ends the page for both and leaves every flight where it was.
  assert.equal((await link(b, { action: "unlink", with: first })).status, 200);
  assert.deepEqual((await api("/api/account", { cookie: a })).data.links, []);
  assert.match(await page(`/with/${second}`, a), /没有这个联动/, "only linked accounts open the page");
  assert.equal((await api(`/with/${second}`)).status, 307, "a visitor is sent to sign in");
  assert.equal((await api("/api/account", { cookie: b })).data.user.flights, 1);

  // An invite link links once, and sharing starts over at the flights both logged.
  const { token } = (await link(a, { action: "token" })).data;
  assert.match(await page(`/join/${token}`, b), /First 邀请你联动/);
  assert.equal((await link(b, { action: "join", token })).data.result, "linked");
  assert.equal((await link(b, { action: "join", token })).data.error, "gone");
  assert.deepEqual((await api("/api/account", { cookie: a })).data.links.map((entry) => [entry.name, entry.mine, entry.theirs]), [["Second", "together", "together"]]);
});

// A zip written by hand, so a test can make one no real tool would.
function zip(files, { shareData = false } = {}) {
  const locals = [], central = [];
  let offset = 0;
  for (const [index, [name, text]] of files.entries()) {
    const raw = Buffer.from(text), packed = deflateRawSync(raw), nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(8, 10); head.writeUInt32LE(packed.length, 20); head.writeUInt32LE(raw.length, 24); head.writeUInt16LE(nameBytes.length, 28);
    head.writeUInt32LE(shareData && index > 0 ? 0 : offset, 42);
    locals.push(local, nameBytes, packed); central.push(head, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

async function importBuffers(cookie, files) {
  const form = new FormData();
  for (const [name, data] of files) form.append("files", new Blob([data]), name);
  const started = await api("/api/imports", { form, cookie });
  assert.equal(started.status, 202, JSON.stringify(started.data));
  for (let attempt = 0; attempt < 40; attempt++) {
    const { data } = await api(`/api/imports/${started.data.id}`, { cookie });
    if (data.status !== "reading") return data;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("import did not finish");
}

test("crafted files are read in bounded time and memory, or refused", async () => {
  const cookie = await signUp("hostile@example.com", "Hostile");
  const sheet = `<worksheet><sheetData>${'<row r="1"><c r="ZZZ1" t="inlineStr"><is><t>x</t></is></c></row>'.repeat(50)}</sheetData></worksheet>`;
  const padded = zip([["xl/worksheets/sheet1.xml", `<worksheet><sheetData>${'<row><c r="IV1" t="inlineStr"><is><t>x</t></is></c></row>'.repeat(20_000)}</sheetData></worksheet>`]]);
  const started = Date.now();
  const draft = await importBuffers(cookie, [
    ...Array.from({ length: 8 }, (_, index) => [`padded-${index}.xlsx`, padded]),
    ["wide.xlsx", zip([["xl/worksheets/sheet1.xml", sheet]])],
    ["tags.html", "<html>" + "<br".repeat(300_000) + "<script".repeat(300_000)],
    ["shared.ofd", zip([["Doc_0/Pages/Page_0/Content.xml", "<ofd:TextCode>x</ofd:TextCode>"], ["Doc_0/Pages/Page_1/Content.xml", "x"]], { shareData: true })],
  ]);
  assert.ok(Date.now() - started < 8000, "hostile files are read quickly");
  assert.ok(["ready", "failed"].includes(draft.status));
  const reports = Object.fromEntries(draft.sources.map((source) => [source.name, source]));
  assert.equal(reports["shared.ofd"].error, "damaged", "entries that share data are refused");
  assert.equal((await api("/api/account", { cookie })).status, 200, "the server is still answering");

  const chunked = await fetch(`${origin}/api/imports`, { method: "POST", headers: { origin, cookie, "content-type": "multipart/form-data; boundary=x" }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("--x--")); controller.close(); } }), duplex: "half" });
  assert.equal(chunked.status, 411, "an upload without a declared length is refused");
});

test("sign-in only ever sends a reader on to this site", async () => {
  const cookie = await signUp("redirect@example.com", "Redirect");
  for (const next of ["/\t/evil.example", "/.//evil.example", "//evil.example", "/\\evil.example", "https://evil.example"]) {
    const response = await fetch(`${origin}/login?next=${encodeURIComponent(next)}`, { headers: { cookie }, redirect: "manual" });
    const location = new URL(response.headers.get("location"), origin);
    assert.equal(location.origin, origin, next);
  }
});

test("parallel wrong passwords are all counted", async () => {
  await signUp("guarded@example.com", "Guarded");
  const statuses = await Promise.all(Array.from({ length: 16 }, () => api("/api/auth/login", { body: { email: "guarded@example.com", password: "wrong-password" } }).then((result) => result.status)));
  assert.equal(statuses.filter((status) => status === 401).length, 8);
  assert.equal(statuses.filter((status) => status === 429).length, 8);
});

test("a password change and closing an account", async () => {
  const cookie = await signUp("closer@example.com", "Closer");
  assert.equal((await api("/api/account/password", { cookie, body: { current: "wrong-password", next: "another-long-password" } })).status, 401);
  assert.equal((await api("/api/account/password", { cookie, body: { current: "a-long-password", next: "another-long-password" } })).status, 200);
  assert.equal((await api("/api/auth/login", { body: { email: "closer@example.com", password: "a-long-password" } })).status, 401);
  assert.equal((await api("/api/account", { method: "DELETE", cookie, body: { password: "a-long-password" } })).status, 401);
  assert.equal((await api("/api/account", { method: "DELETE", cookie, body: { password: "another-long-password" } })).status, 200);
  assert.equal((await api("/api/auth/login", { body: { email: "closer@example.com", password: "another-long-password" } })).status, 401);
});

test("a public page shows only flown routes, to anyone with its link, until it is turned off", async () => {
  const cookie = await signUp("public@example.com", "Mei", undefined, "192.0.2.40");
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const form = new FormData();
  form.append("files", new Blob([[
    "Date,Airline,Flight,From,To,Canceled,Gate Departure (Scheduled),Gate Arrival (Scheduled),Seat,Cabin Class",
    "2025-03-01,CX,255,HKG,LHR,false,2025-03-01T23:45,2025-03-02T06:20,47K,Business",
    `${day(20)},DY,9917,OSL,BGO,false,${day(20)}T13:10,${day(20)}T14:05,12A,Economy`,
    `${day(-1)},TP,9918,LIS,VIE,false,${day(-1)}T08:00,${day(-1)}T12:15,,`,
  ].join("\n")], { type: "text/csv" }), "flighty.csv");
  const started = await api("/api/imports", { form, cookie });
  let draft;
  for (;;) {
    draft = (await api(`/api/imports/${started.data.id}`, { cookie })).data;
    if (draft.status !== "reading") break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await api(`/api/imports/${draft.id}`, { cookie, body: { action: "save", edits: draft.rows.map((item) => ({ key: item.key, include: item.include, fields: {}, seen: item.state })) } });

  assert.equal((await api("/api/account/share", { cookie })).data.share, null, "off until turned on");
  assert.equal((await api("/api/account/share", { body: { on: true } })).status, 401);
  assert.equal((await api("/api/account/share", { cookie, body: { on: true }, from: "https://elsewhere.example" })).status, 403);
  const slug = (await api("/api/account/share", { cookie, body: { on: true } })).data.share;
  assert.match(slug, /^[a-z0-9]{16}$/);
  assert.equal((await api("/api/account/share", { cookie, body: { on: true } })).data.share, slug, "turning it on again keeps the address");

  const shared = await page(`/s/${slug}`, "");
  assert.match(shared, /<title>Mei 的飞行地图 — 航迹<\/title>/);
  assert.match(shared, /1 次飞行/, "the preview counts what was flown");
  assert.doesNotMatch(shared, /最近的旅程|单程/, "a one-way trip may say where its owner is now, so only round trips are listed");
  assert.doesNotMatch(shared, /href="\/(trips|places|flights)\//, "a visitor is never sent into the owner's own pages");
  assert.match(shared, /og:image" content="[^"]+\/api\/share\/[a-z0-9]+\/image/);
  const own = await page("/", cookie);
  for (const probe of ["47K", "9917", "9918"]) assert.match(own, new RegExp(probe), `the owner's own page carries ${probe}, so its absence below means something`);
  assert.doesNotMatch(shared, /47K|Business|商务舱|9917/, "no seat, cabin or flight still ahead reaches the page");
  assert.doesNotMatch(shared, /9918/, "a flight that landed yesterday does not say where its owner is now");
  const image = await fetch(`${origin}/api/share/${slug}/image`);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.ok((await image.arrayBuffer()).byteLength > 10_000);

  await api("/api/account/share", { cookie, body: { on: false } });
  assert.equal((await fetch(`${origin}/s/${slug}`)).status, 404);
  assert.equal((await fetch(`${origin}/api/share/${slug}/image`)).status, 404);
  const again = (await api("/api/account/share", { cookie, body: { on: true } })).data.share;
  assert.notEqual(again, slug, "an old link stays dead");
});

test("a forgotten password is not offered without mail", async () => {
  assert.equal((await api("/api/auth/reset", { body: { email: "public@example.com" } })).data.error, "unavailable");
  assert.equal((await fetch(`${origin}/reset`)).status, 404);
  assert.doesNotMatch(await page("/login", ""), /忘记密码/);
  assert.equal((await api("/api/auth/reset/confirm", { body: { token: "not-a-token", password: "a-new-long-password" } })).data.error, "expired");
});

test("the iOS app signs in with a token and reads its archive, trips and homes in one answer", async () => {
  const app = (path, { token, body, network, cookie } = {}) => fetch(`${origin}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-flyprint-client": "ios", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...(network ? { "x-forwarded-for": network } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({ status: response.status, cookie: response.headers.get("set-cookie"), cache: response.headers.get("cache-control"), data: await response.json() }));

  const sample = await app("/api/app/archive");
  assert.equal(sample.status, 200);
  assert.equal(sample.data.sample, true);
  assert.equal(sample.data.viewer, null);
  const ids = new Set(sample.data.archive.flights.map((flight) => flight.id));
  assert.ok(ids.size > 100 && sample.data.trips.length > 20 && sample.data.homes.length >= 1);
  assert.ok(sample.data.trips.every((trip) => trip.flightIds.length > 0 && trip.flightIds.every((id) => ids.has(id)) && !("flights" in trip)));

  const joined = await app("/api/auth/signup", { body: { email: "phone@example.com", password: "a-long-password", name: "Phone" }, network: "203.0.113.90" });
  assert.equal(joined.status, 201);
  assert.equal(joined.cookie, null, "the app gets a token, never a cookie");
  assert.match(joined.data.token, /^[\w-]{20,}$/);
  assert.match(joined.cache ?? "", /no-store/, "a token is never kept by a cache");

  const mine = await app("/api/app/archive", { token: joined.data.token });
  assert.equal(mine.data.sample, false);
  assert.equal(mine.data.viewer.email, "phone@example.com");
  assert.deepEqual(mine.data.archive.flights, []);
  assert.match(mine.cache ?? "", /no-store/, "a signed-in archive is never kept by a cache");

  // A bearer token counts only from the app, and a request that carries this
  // site's cookie is a page's request whatever it claims to be.
  const plain = await fetch(`${origin}/api/app/archive`, { headers: { authorization: `Bearer ${joined.data.token}` } }).then((response) => response.json());
  assert.equal(plain.sample, true);
  const withCookie = await app("/api/auth/login", { body: { email: "phone@example.com", password: "a-long-password" }, cookie: "waypoint-zone=Asia%2FHong_Kong" });
  assert.equal(withCookie.status, 403);
  // A browser always says where a request comes from; claiming to be the app does not change that.
  const fromPage = await fetch(`${origin}/api/app/archive`, { headers: { "x-flyprint-client": "ios", authorization: `Bearer ${joined.data.token}`, "sec-fetch-site": "cross-site" } }).then((response) => response.json());
  assert.equal(fromPage.sample, true);
  const fromOrigin = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "x-flyprint-client": "ios", "content-type": "application/json", origin: "https://elsewhere.example" }, body: JSON.stringify({ email: "phone@example.com", password: "a-long-password" }) });
  assert.equal(fromOrigin.status, 403);
  assert.equal((await fetch(`${origin}/api/app/archive`, { headers: { "x-flyprint-client": "ios", authorization: `bearer ${joined.data.token}` } }).then((response) => response.json())).sample, false, "the scheme name is case-insensitive");

  const again = await app("/api/auth/login", { body: { email: "phone@example.com", password: "a-long-password" } });
  assert.equal(again.status, 200);
  assert.notEqual(again.data.token, joined.data.token);
  assert.equal((await app("/api/auth/logout", { token: again.data.token, body: {} })).status, 200);
  assert.equal((await app("/api/app/archive", { token: again.data.token })).data.sample, true, "a signed-out token reads nothing of the account");
  assert.equal((await app("/api/app/archive", { token: joined.data.token })).data.sample, false, "signing out one device leaves the other signed in");
});

test("a flight typed in by hand is read like an imported one, can be put right, and only by its owner", async () => {
  const cookie = await signUp("hand@example.com", "Hand", "a-long-password", "203.0.113.91");
  const exported = async () => (await (await fetch(`${origin}/api/export`, { headers: { cookie } })).json()).flights;

  const added = await api("/api/flights", { cookie, body: { date: "2025-03-02", flight: "cx 255", origin: "hkg", destination: "希思罗", depart: "23:55", arrive: "06:15", seat: "61k", cabin: "公务舱" } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  let [flight] = await exported();
  assert.equal(flight.id, added.data.id);
  assert.deepEqual([flight.flight, flight.airline, flight.origin, flight.destination, flight.seat, flight.cabin], ["CX255", "CX", "HKG", "LHR", "61K", "business"]);
  assert.equal(flight.timeSource, "recorded");
  assert.equal(flight.arrivalDayOffset, 1);
  assert.ok(flight.km > 9500 && flight.km < 9700, String(flight.km));
  assert.equal(flight.durationMinutes, 14 * 60 + 20, "23:55 in Hong Kong to 06:15 in London is 14 h 20 min");

  // The same flight again is refused and points at the one logged.
  const twice = await api("/api/flights", { cookie, body: { date: "2025-03-02", flight: "CX255", origin: "HKG", destination: "LHR" } });
  assert.equal(twice.status, 409);
  assert.deepEqual(twice.data, { error: "duplicate", id: added.data.id });
  for (const [body, error] of [
    [{ date: "2025-03-02", origin: "HKG", destination: "HKG" }, "same_airport"],
    [{ date: "2025-03-02", origin: "Nowhere", destination: "LHR" }, "origin"],
    [{ date: "someday", origin: "HKG", destination: "LHR" }, "date"],
    [{ date: "2025-03-02", origin: "HKG", destination: "TPE", flight: "CX400", depart: "10:00", arrive: "10:05" }, "time"],
    [{ date: "2025-03-02", origin: "HKG", destination: "LHR", flight: "HELLO!" }, "flight"],
    [{ date: "2025-03-02", origin: "HKG", destination: "Santiago" }, "destination_ambiguous"],
    [{ date: "2025-03-02", origin: "HKG", destination: "伦敦" }, "destination_ambiguous"],
    [{ date: "2025-03-02", origin: "Madrid", destination: "HKG" }, "origin_ambiguous"],
    [{ date: "2025-03-02", origin: "nan", destination: "HKG" }, "origin_ambiguous"],
    [{ date: "2025-03-02", origin: "HKG", destination: "LHR", registration: "B-KPA" }, "registration_type"],
    [{ date: "2025-03-02", origin: "HKG", destination: "LHR", aircraft: "Concorde 2" }, "aircraft"],
  ]) assert.equal((await api("/api/flights", { cookie, body })).data.error, error, JSON.stringify(body));

  // Put right: new times, seat and aircraft. The form sends the aircraft as logged, so its
  // model with a new registration keeps the type, and an empty field removes it.
  const edited = await api(`/api/flights/${added.data.id}`, { method: "PATCH", cookie, body: { date: "2025-03-02", flight: "CX255", origin: "HKG", destination: "LHR", depart: "00:15", arrive: "06:40", seat: "11A", cabin: "first", aircraft: "777-300ER" } });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  [flight] = await exported();
  assert.deepEqual([flight.depart, flight.arrive, flight.seat, flight.cabin, flight.aircraft?.icao], ["00:15", "06:40", "11A", "first", "B77W"]);
  const same = { date: "2025-03-02", flight: "CX255", origin: "HKG", destination: "LHR", depart: "00:15", arrive: "06:40", cabin: "first" };
  await api(`/api/flights/${added.data.id}`, { method: "PATCH", cookie, body: { ...same, seat: "12A", aircraft: flight.aircraft.model, registration: "b-kpa" } });
  [flight] = await exported();
  assert.deepEqual([flight.seat, flight.aircraft?.icao, flight.aircraft?.registration, flight.aircraft?.source], ["12A", "B77W", "B-KPA", "operated"]);
  assert.equal((await api(`/api/flights/${added.data.id}`, { method: "PATCH", cookie, body: { ...same, seat: "12A", aircraft: flight.aircraft.model, registration: "not a tail" } })).data.error, "registration");
  await api(`/api/flights/${added.data.id}`, { method: "PATCH", cookie, body: { ...same, seat: "12A" } });
  [flight] = await exported();
  assert.equal(flight.aircraft, undefined);

  // Editing a flight into another logged one is refused; editing into itself is not a duplicate.
  const other = await api("/api/flights", { cookie, body: { date: "2025-03-09", flight: "CX254", origin: "LHR", destination: "HKG" } });
  assert.equal(other.status, 201);
  const clash = await api(`/api/flights/${other.data.id}`, { method: "PATCH", cookie, body: { date: "2025-03-02", flight: "CX255", origin: "HKG", destination: "LHR" } });
  assert.equal(clash.status, 409);

  // Another reader can neither change nor delete it, and an unknown id is not found.
  const stranger = await signUp("stranger@example.com", "Stranger", "a-long-password", "203.0.113.92");
  assert.equal((await api(`/api/flights/${added.data.id}`, { method: "PATCH", cookie: stranger, body: { date: "2025-03-02", origin: "HKG", destination: "NRT" } })).status, 404);
  assert.equal((await api(`/api/flights/${added.data.id}`, { method: "DELETE", cookie: stranger })).status, 404);
  // A visitor's typed flight starts a trial of their own and touches nobody else's log.
  const visitor = await api("/api/flights", { body: { date: "2025-03-02", origin: "HKG", destination: "NRT" }, network: "203.0.113.93" });
  assert.equal(visitor.status, 201);
  assert.match(visitor.response.headers.get("set-cookie"), /waypoint_session=/);
  assert.equal((await exported()).length, 2);
  assert.equal((await api(`/api/flights/${other.data.id}`, { method: "DELETE", cookie })).status, 200);
  assert.deepEqual((await exported()).map((item) => item.id), [added.data.id]);
});

test("a tagged link is counted per source, and a sign-up after it counts for the first source", async () => {
  const visit = await api("/api/arrive", { body: { ref: "zh-fp1" }, network: "198.51.100.40" });
  assert.equal(visit.status, 204);
  const cookie = cookieOf(visit.response);
  assert.equal(cookie, "flyprint_ref=zh-fp1");
  // A second tagged link later does not replace the first.
  const again = await api("/api/arrive", { body: { ref: "x-clip" }, cookie, network: "198.51.100.40" });
  assert.equal(again.status, 204);
  assert.equal(again.response.headers.get("set-cookie"), null);
  assert.equal((await api("/api/arrive", { body: { ref: "<script>" } })).status, 400);
  assert.equal((await api("/api/arrive", { body: { ref: "zh-fp1" }, from: "https://elsewhere.example" })).status, 403);
  const signup = await api("/api/auth/signup", { body: { email: "came@example.com", password: "a-long-password", name: "Came" }, cookie, network: "198.51.100.41" });
  assert.equal(signup.status, 201);
  const db = new DatabaseSync(join(process.env.FLYPRINT_DATA_DIR, "waypoint.db"), { readOnly: true });
  const rows = Object.fromEntries(db.prepare("SELECT ref, SUM(visits) AS visits, SUM(signups) AS signups FROM arrivals GROUP BY ref").all().map((row) => [row.ref, [row.visits, row.signups]]));
  db.close();
  assert.deepEqual(rows, { "zh-fp1": [1, 1], "x-clip": [1, 0] });
});

test("behind Cloudflare each reader has their own sign-up limit, and the header is ignored from anywhere else", async () => {
  const signUpVia = (n, network, reader) => api("/api/auth/signup", { body: { email: `edge${n}@example.com`, password: "a-long-password", name: `Edge ${n}` }, network, reader });
  // Eleven readers through one Cloudflare data centre, over the limit of ten per network.
  for (let n = 1; n <= 11; n++) assert.equal((await signUpVia(n, `192.0.2.60, 173.245.48.${n}`, `203.0.113.${100 + n}`)).status, 201, `reader ${n}`);
  for (let n = 1; n <= 10; n++) assert.equal((await signUpVia(20 + n, "192.0.2.61", `203.0.113.${120 + n}`)).status, 201);
  assert.equal((await signUpVia(31, "192.0.2.61", "203.0.113.131")).status, 429);
});

test("a visitor imports without an account, sees their own map, and keeps it by signing up", async () => {
  const network = "198.51.100.70";
  const before = usersTable();
  const count = () => before.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const users = count();
  const empty = await api("/api/imports", { form: new FormData(), network });
  assert.equal(empty.data.error, "empty");
  assert.equal(empty.response.headers.get("set-cookie"), null, "a write that fails starts nothing");
  assert.equal(count(), users);

  const { cookie, draft, header } = await tryImport([["flighty.csv", "text/csv"]], { network, ref: "xhs-trial" });
  assert.match(header, /Max-Age=604800/, "a trial's session lasts its week");
  assert.equal(draft.status, "ready");
  const saved = await saveAll(cookie, draft);
  assert.ok(saved.data.added >= 1);
  const home = await page("/", cookie);
  assert.match(home, new RegExp(`<b>${saved.data.added}</b><span>次飞行</span>`), "the trial's own flights, not the sample");
  assert.match(home, /试用的地图会在 7 天后删除/);
  assert.doesNotMatch(home, /示例旅客/);
  const trialId = (await api("/api/account", { cookie })).data.user.id;

  assert.equal((await api("/api/account/share", { cookie, body: { on: true } })).data.error, "guest", "a trial has no public page");
  assert.equal((await api("/api/links", { cookie, body: { action: "token" } })).data.error, "guest", "nor links");
  const settings = await fetch(`${origin}/settings`, { headers: { cookie }, redirect: "manual" });
  assert.equal(new URL(settings.headers.get("location"), origin).pathname, "/signup");
  assert.match(await page("/signup", cookie), /保存你的地图/);
  assert.equal((await api("/api/auth/login", { body: { email: `${trialId}@guest.invalid`, password: "" } })).data.error, "credentials", "nobody signs in to a trial");

  // The source's cookie stays in the browser alongside the trial's.
  const kept = await api("/api/auth/signup", { cookie: `${cookie}; flyprint_ref=xhs-trial`, body: { email: "kept@example.com", password: "a-long-password", name: "Kept" }, network });
  assert.equal(kept.status, 201, JSON.stringify(kept.data));
  const account = cookieOf(kept.response);
  assert.match(kept.response.headers.get("set-cookie"), /Max-Age=15552000/);
  const after = (await api("/api/account", { cookie: account })).data.user;
  assert.equal(after.id, trialId, "signing up keeps the same account");
  assert.equal(after.flights, saved.data.added);
  assert.equal(after.email, "kept@example.com");
  assert.equal((await api("/api/account", { cookie })).status, 401, "the trial's session gives way");
  assert.doesNotMatch(await page("/", account), /试用的地图/);
  const rows = before.prepare("SELECT SUM(visits) AS visits, SUM(trials) AS trials, SUM(signups) AS signups FROM arrivals WHERE ref = 'xhs-trial'").get();
  assert.deepEqual({ ...rows }, { visits: 0, trials: 1, signups: 1 });
  before.close();
});

test("signing in from a trial brings its flights without doubles; an ended or unkept trial is deleted", async () => {
  const owner = await signUp("merge@example.com", "Merge", "a-long-password", "198.51.100.80");
  const own = await importFiles(owner, [["flighty.csv", "text/csv"]]);
  const logged = (await saveAll(owner, own)).data.added;

  const network = "198.51.100.81";
  const first = await tryImport([["flighty.csv", "text/csv"], ["trip.ics", "text/calendar"]], { network });
  const tried = (await saveAll(first.cookie, first.draft)).data.added;
  assert.equal(tried, logged + 1);
  const trialId = (await api("/api/account", { cookie: first.cookie })).data.user.id;
  assert.match(await page("/login", first.cookie), new RegExp(`试用里的 ${tried} 段航班会并入你的账户`));
  const login = await api("/api/auth/login", { cookie: first.cookie, body: { email: "merge@example.com", password: "a-long-password" }, network });
  assert.equal(login.status, 200);
  assert.equal((await api("/api/account", { cookie: owner })).data.user.flights, logged + 1, "only the flight the account lacked joins it");
  const db = usersTable();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(trialId).n, 0, "the trial is gone");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM flights WHERE user_id = ?").get(trialId).n, 0);

  const second = await tryImport([["trip.ics", "text/calendar"]], { network });
  await saveAll(second.cookie, second.draft);
  const secondId = (await api("/api/account", { cookie: second.cookie })).data.user.id;
  await api("/api/auth/logout", { method: "POST", cookie: second.cookie });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(secondId).n, 0, "ending a trial deletes it");

  const third = await tryImport([["trip.ics", "text/calendar"]], { network });
  await saveAll(third.cookie, third.draft);
  const thirdId = (await api("/api/account", { cookie: third.cookie })).data.user.id;
  db.prepare("UPDATE users SET created_at = created_at - 8 * 86400000 WHERE id = ?").run(thirdId);
  await tryImport([["trip.ics", "text/calendar"]], { network });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(thirdId).n, 0, "a trial not kept within the week is deleted");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM flights WHERE user_id = ?").get(thirdId).n, 0);
  db.close();

  // Ten trials an hour from one network; this one has started four.
  for (let n = 0; n < 6; n++) assert.equal((await api("/api/imports", { form: new FormData(), network })).status, 400);
  assert.equal((await api("/api/imports", { form: new FormData(), network })).status, 429);
});
