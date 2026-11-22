import { spawn } from "node:child_process";
import { resolve } from "node:path";

const commands = new Set(["dev", "build", "test:product", "verify:demo"]);
const command = process.argv[2];
if (!commands.has(command)) throw new Error("Expected a supported demo command.");
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", command, ...process.argv.slice(3)], {
  cwd: resolve(import.meta.dirname, ".."),
  stdio: "inherit",
  env: { ...process.env, FLIGHT_DATA_PATH: "app/data/flights.example.json" },
  shell: process.platform === "win32",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Unable to start npm."); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
