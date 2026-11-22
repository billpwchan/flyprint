import { readFile, readdir, access } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { isPublicPath } from "./public-files.mjs";

const root = resolve(import.meta.dirname, "..");
const files = [];
async function visit(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (!isPublicPath(relative(root, path).replaceAll("\\", "/"))) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await visit(path);
    else if (entry.name.endsWith(".md")) files.push(path);
  }
}
await visit(root);
const failures = [];
const documents = new Map();
const withoutFences = (source) => source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
async function anchors(path) {
  if (documents.has(path)) return documents.get(path);
  const source = withoutFences(await readFile(path, "utf8"));
  const result = new Set([...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const occurrences = new Map();
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1].toLowerCase().replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const count = occurrences.get(slug) || 0;
    result.add(count ? `${slug}-${count}` : slug);
    occurrences.set(slug, count + 1);
  }
  documents.set(path, result);
  return result;
}
let checked = 0;
for (const file of files) {
  const source = withoutFences(await readFile(file, "utf8"));
  const links = [...source.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
  links.push(...[...source.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map((match) => match[1]));
  for (const raw of links) {
    if (/^(?:https?:|mailto:|data:|\/\/)/i.test(raw)) continue;
    let href;
    try { href = decodeURIComponent(raw.replaceAll("&amp;", "&")); } catch { failures.push(`${relative(root, file)}: invalid encoded link`); continue; }
    const [target, fragment] = href.split("#", 2);
    const path = target ? resolve(dirname(file), target.split("?", 1)[0]) : file;
    if (!path.startsWith(`${root}/`) || !isPublicPath(relative(root, path))) { failures.push(`${relative(root, file)}: non-public target ${href}`); continue; }
    try {
      await access(path);
      if (fragment && path.endsWith(".md") && !(await anchors(path)).has(fragment)) throw new Error("missing anchor");
      checked++;
    } catch { failures.push(`${relative(root, file)}: missing target ${href}`); }
  }
}
if (failures.length) throw new Error(`Documentation check failed:\n${failures.join("\n")}`);
console.log(`Documentation check passed (${files.length} Markdown files, ${checked} local links). External URLs are not checked.`);
