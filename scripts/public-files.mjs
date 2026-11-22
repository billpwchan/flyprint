import { basename } from "node:path";

const excluded = new Set([
  ".git", ".ssh", ".venv", ".next", ".openai", ".vinext", ".wrangler", ".agents", ".claude", ".codex", ".aws", ".vercel",
  "AGENTS.md", "data", "dist", "node_modules", "outputs", "work", "coverage",
  "app/data/flights.generated.json", "app/data/flights.json", "deploy/lightsail/Caddyfile", "public/og.png",
  "scripts/reconcile_immigration.py", "scripts/temporal.py", "scripts/import_flights.py", "scripts/merge_partner_export.py",
  // The shared production host's runbook and service file: no use to anyone else.
  "deploy/lightsail/README.md", "deploy/lightsail/compose.yml",
]);

const SYNTHETIC_FIXTURES = new Set(["tests/fixtures/flighty.csv"]);

export function isSensitivePath(path) {
  const name = basename(path);
  return /(?:^|\/)data\/private(?:\/|$)/.test(path)
    || ["app/data/flights.generated.json", "app/data/flights.json", "deploy/lightsail/Caddyfile"].includes(path)
    || name.startsWith(".env") && name !== ".env.example"
    // Named synthetic import fixtures only; any other file of these kinds stays private.
    || !SYNTHETIC_FIXTURES.has(path) && /\.(?:pem|key|p12|pfx|xlsx?|pdf|csv|tsv|db|sqlite3?|tgz|zip|tsbuildinfo)$/i.test(name)
    || /^id_(?:rsa|ed25519|ecdsa)(?:\.pub)?$/.test(name)
    || /(?:^|\/)\.aws(?:\/|$)/.test(path)
    || /(?:^|\/)docs\/RELEASE_\d+\.md$/.test(path);
}

export function isPublicPath(path) {
  path = path.replaceAll("\\", "/");
  if (!path) return true;
  if (path.split("/").some((segment) => [".git", "node_modules", ".venv", ".ssh", ".aws", ".codex", ".agents"].includes(segment))) return false;
  if (basename(path) === ".DS_Store" || isSensitivePath(path) || /(?:^|\/)__pycache__(?:\/|$)/.test(path)
    || /\.(?:pyc|log)$/.test(path)) return false;
  return ![...excluded].some((item) => path === item || path.startsWith(`${item}/`));
}

// Keep detection patterns here so scan output never echoes the matched value.
const fingerprints = [
  /generatedFrom"\s*:\s*"航旅纵横/u,
  /\/Users\/[^/]+\//u,
  /52[.-]198[.-]144[.-]26/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:ghp|github_pat|sk_live)_[A-Za-z0-9_]{20,}\b/u,
  /\bAKIA[A-Z0-9]{16}\b/u,
];

export function hasPrivateFingerprint(content) {
  return fingerprints.some((pattern) => pattern.test(content));
}
