import { cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, relative, resolve, isAbsolute } from "node:path";
import { isPublicPath } from "./public-files.mjs";

const root = resolve(import.meta.dirname, "..");
const destination = resolve(process.argv[2] || "");
const isWithin = (base, target) => {
  const path = relative(base, target);
  return path === "" || path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(path);
};
if (!process.argv[2] || isWithin(root, destination) || isWithin(destination, root)) throw new Error("Pass a new destination outside the project tree; parent directories are also refused.");

async function allowed(source) {
  const path = relative(root, source).replaceAll("\\", "/");
  if (!isPublicPath(path)) return false;
  if ((await lstat(source)).isSymbolicLink()) throw new Error("Open-source export refuses symbolic links.");
  return true;
}

// mkdir without recursive intentionally refuses existing destinations.
await mkdir(destination, { recursive: false });
for (const entry of await readdir(root, { withFileTypes: true })) {
  const source = join(root, entry.name);
  if (!(await allowed(source))) continue;
  await cp(source, join(destination, entry.name), { recursive: true, filter: allowed, preserveTimestamps: true });
}
const dockerfile = join(destination, "deploy/lightsail/Dockerfile");
await writeFile(dockerfile, (await readFile(dockerfile, "utf8")).replace(/org\.opencontainers\.image\.version="[^"]+"/, 'org.opencontainers.image.version="development"'));

execFileSync(process.execPath, [join(root, "scripts/privacy-check.mjs"), "--directory", destination], { stdio: "inherit" });
console.log("Open-source tree exported and privacy-checked. Review the result and initialize fresh Git history before publishing.");
