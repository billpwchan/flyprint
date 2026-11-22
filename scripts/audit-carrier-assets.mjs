import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const assetDirectory = path.join(root, "public/airlines");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

// Every airline named by hand has a mark, every listed mark exists as a
// transparent square big enough for the largest place it is drawn, and no
// file sits there unlisted.
const curated = Object.keys(read("app/lib/server/names.json").carriers);
const marks = read("app/lib/carrier-marks.json");
const named = read("app/lib/server/carriers.json").names;
const listed = new Set(marks);
const errors = [];

for (const code of curated) if (!listed.has(code)) errors.push(`${code} is named by hand but has no mark`);
for (const code of marks) {
  if (!named[code]) errors.push(`${code} has a mark but no names`);
  const file = path.join(assetDirectory, `${code}.webp`);
  if (!fs.existsSync(file)) { errors.push(`${code}.webp is missing`); continue; }
  const meta = await sharp(file).metadata();
  if (meta.format !== "webp") errors.push(`${code}.webp is ${meta.format}`);
  if (meta.width !== meta.height || meta.width < 96) errors.push(`${code}.webp is ${meta.width}×${meta.height}`);
  if (!meta.hasAlpha) errors.push(`${code}.webp has no alpha channel`);
}
for (const file of fs.readdirSync(assetDirectory)) {
  if (!listed.has(file.replace(/\.webp$/, ""))) errors.push(`${file} is not listed in carrier-marks.json`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Verified ${marks.length} transparent carrier marks, ${curated.length} of them for hand-named airlines; ${Object.keys(named).length} airlines named.`);
