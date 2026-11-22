// Where to go after signing in: a path on this site, never another site.
// Browsers drop tabs and newlines from URLs and read a backslash as "/", so
// "/\t/evil.example" would otherwise leave the site; "/.//evil.example"
// resolves to "//evil.example".
export function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || [...value].some((char) => char <= " " && char !== " " || char === "\u007f" || char === "\\")) return "/";
  try {
    const url = new URL(value, "https://flyprint.invalid");
    const path = `${url.pathname}${url.search}${url.hash}`;
    return url.origin === "https://flyprint.invalid" && !path.startsWith("//") ? path : "/";
  } catch { return "/"; }
}
