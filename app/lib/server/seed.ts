import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dataDir, database, whenOpened } from "./db";
import { createUser, findUserByEmail, isEmail } from "./auth";
import { legacyRecord, travellersOf, type LegacyArchive } from "./records";
import { insertRecords } from "./flights";
import { linkAccounts } from "./links";

// First-run accounts for a self-hosted archive. Put seed.json in the data
// directory; on start the server creates the accounts, loads each one's
// flights from an archive file and links pairs of them, then deletes seed.json
// (it holds passwords) and leaves seed.log behind.
//
// { "users": [{ "email", "name", "label", "password", "archive": "private.json", "traveller": "B" }],
//   "links": [["a@example.com", "b@example.com"]] }
// A seeded link starts like any other: each side sees the flights both logged.

type Seed = {
  users?: { email: string; name?: string; label?: string; password: string; archive?: string; traveller?: string }[];
  links?: [string, string][];
  // The name earlier releases used.
  companions?: [string, string][];
};

async function apply(path: string) {
  const seed = JSON.parse(readFileSync(path, "utf8")) as Seed;
  const log: string[] = [];
  // Only accounts the seed creates itself get flights or links: an address
  // someone registered first is left alone, so nobody can claim a seeded
  // archive by signing up with its email before the seed runs.
  const created = new Set<string>();
  for (const entry of seed.users ?? []) {
    if (!isEmail(entry.email) || !entry.password) { log.push(`skipped an entry without a valid email and password`); continue; }
    if (findUserByEmail(entry.email)) { log.push(`skipped ${entry.email}: the address is already registered`); continue; }
    const user = await createUser({ email: entry.email, password: entry.password, name: entry.name ?? "", label: entry.label });
    created.add(user.email);
    log.push(`created ${user.email}`);
    if (entry.archive) {
      const archive = JSON.parse(readFileSync(resolve(dataDir(), entry.archive), "utf8")) as LegacyArchive;
      const traveller = entry.traveller ?? "B";
      const records = archive.flights.filter((flight) => travellersOf(flight).includes(traveller)).map(legacyRecord);
      const added = insertRecords(user.id, records, null);
      log.push(`${entry.email}: ${added} of ${records.length} flights added from ${entry.archive}`);
    }
  }
  for (const [a, b] of seed.links ?? seed.companions ?? []) {
    const first = findUserByEmail(a), second = findUserByEmail(b);
    if (first && second && created.has(first.email) && created.has(second.email)) { linkAccounts(first.id, second.id); log.push(`linked ${first.email} and ${second.email}`); }
    else log.push(`did not link ${a} and ${b}: only accounts this seed created are linked`);
  }
  return log;
}

whenOpened(() => {
  const path = join(dataDir(), "seed.json");
  if (!existsSync(path)) return;
  database();
  apply(path).then((log) => {
    rmSync(path);
    writeFileSync(join(dataDir(), "seed.log"), `${new Date().toISOString()}\n${log.join("\n")}\n`);
    console.log(`Seed applied: ${log.length} steps`);
  }, (error) => console.error("Seed failed:", error instanceof Error ? error.message : error));
});
