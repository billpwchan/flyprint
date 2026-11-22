import { database, now } from "./db";

// Which tagged link (?ref=) brought a reader, kept for 30 days in the reader's
// own browser so a later trial or sign-up can be counted against it. The site keeps
// daily totals per link and nothing that says who anyone is.

export const ARRIVAL_COOKIE = "flyprint_ref";
const REF = /^[a-z0-9][a-z0-9-]{0,39}$/i;
// Made-up tags cannot grow the table without end: past this many in a day,
// new ones are counted together as "other".
const REFS_PER_DAY = 200;

export const validRef = (value: unknown) => typeof value === "string" && REF.test(value) ? value.toLowerCase() : null;

export const arrivalCookie = (ref: string, secure: boolean) =>
  `${ARRIVAL_COOKIE}=${ref}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax; HttpOnly${secure ? "; Secure" : ""}`;

function bump(ref: string, column: "visits" | "trials" | "signups") {
  const db = database();
  const day = new Date(now()).toISOString().slice(0, 10);
  const known = db.prepare("SELECT 1 FROM arrivals WHERE day = ? AND ref = ?").get(day, ref);
  const today = (db.prepare("SELECT COUNT(*) AS n FROM arrivals WHERE day = ?").get(day) as { n: number }).n;
  const key = known || today < REFS_PER_DAY ? ref : "other";
  db.prepare(`INSERT INTO arrivals (day, ref, ${column}) VALUES (?, ?, 1) ON CONFLICT (day, ref) DO UPDATE SET ${column} = ${column} + 1`).run(day, key);
}

export const countVisit = (ref: string) => bump(ref, "visits");
export const countTrial = (ref: string) => bump(ref, "trials");
export const countSignup = (ref: string) => bump(ref, "signups");
