import { readZip } from "./zip";

// An uploaded file, read into the form the next step needs: rows of a table,
// a JSON value, plain text, an image or a PDF for the model, or a pass.

export type Source =
  | { kind: "table"; name: string; rows: string[][] }
  | { kind: "json"; name: string; value: unknown }
  | { kind: "text"; name: string; text: string }
  | { kind: "image"; name: string; media: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: Buffer }
  | { kind: "pdf"; name: string; data: Buffer }
  | { kind: "pass"; name: string; message: string; date: string }
  | { kind: "unsupported"; name: string; reason: "format" | "empty" | "damaged" | "big" };

// Nothing past this is read: the model reads at most 30 batches of 60,000
// characters, and a flight table never needs more rows or columns.
const MAX_TEXT = 2_000_000;
const MAX_JSON = 2_000_000;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 256;
const MAX_CELLS = 200_000;
// What the model is sent at most, per image and per PDF.
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_PDF = 8 * 1024 * 1024;

export function decodeText(data: Buffer) {
  const bytes = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? data.subarray(3) : data;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  // Spreadsheets saved by Chinese Excel are often GB18030.
  catch { return new TextDecoder("gb18030").decode(bytes); }
}

export function parseDelimited(text: string): string[][] {
  const newline = text.indexOf("\n");
  const firstLine = text.slice(0, newline < 0 ? text.length : newline);
  const delimiter = [",", "\t", ";"].map((mark) => [mark, firstLine.split(mark).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, cells = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { cell += '"'; index++; } else quoted = false; }
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) { if (row.length < MAX_COLUMNS) row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) { rows.push(row.map((value) => value.trim())); cells += row.length; }
      row = [];
      if (rows.length >= MAX_ROWS || cells >= MAX_CELLS) return rows;
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row.map((value) => value.trim()));
  return rows;
}

const entities = (text: string) => text
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, "&");

// Every stretch between <name ...> and </name>, found with indexOf: a file of
// unclosed tags costs one pass rather than one pass per tag.
export function* elements(xml: string, name: string) {
  const open = `<${name}`, close = `</${name}>`;
  let from = 0;
  for (;;) {
    const start = xml.indexOf(open, from);
    if (start < 0) return;
    const next = xml[start + open.length];
    if (next !== ">" && next !== "/" && next !== " " && next !== "\t" && next !== "\n" && next !== "\r") { from = start + open.length; continue; }
    const tagEnd = xml.indexOf(">", start);
    if (tagEnd < 0) return;
    const attributes = xml.slice(start + open.length, tagEnd);
    if (attributes.endsWith("/")) { yield { attributes, inner: "" }; from = tagEnd + 1; continue; }
    const end = xml.indexOf(close, tagEnd);
    if (end < 0) return;
    yield { attributes, inner: xml.slice(tagEnd + 1, end) };
    from = end + close.length;
  }
}

const BREAKS = new Set(["br", "/p", "/div", "/tr", "/li", "/h1", "/h2", "/h3", "/h4", "/h5", "/h6"]);
const SKIPPED = new Set(["script", "style", "head"]);

// Readable text of an HTML page, in one pass over its tags.
export function htmlText(html: string) {
  const source = html.slice(0, MAX_TEXT * 2);
  const lower = source.toLowerCase();
  let out = "", index = 0;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open < 0) { out += source.slice(index); break; }
    out += source.slice(index, open);
    const close = source.indexOf(">", open + 1);
    if (close < 0) { out += source.slice(open); break; }
    const tag = lower.slice(open + 1, Math.min(close, open + 12)).match(/^\/?[a-z0-9]+/)?.[0] ?? "";
    index = close + 1;
    if (SKIPPED.has(tag)) {
      const end = lower.indexOf(`</${tag}`, index);
      const endClose = end < 0 ? -1 : source.indexOf(">", end);
      index = endClose < 0 ? source.length : endClose + 1;
      out += " ";
    } else out += BREAKS.has(tag) ? "\n" : tag === "/td" || tag === "/th" ? "\t" : " ";
  }
  return entities(out).split("\n").map((line) => line.trimEnd()).join("\n")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \u00a0]{2,}/g, " ").trim().slice(0, MAX_TEXT);
}

const textRuns = (xml: string) => [...elements(xml, "t")].map((part) => part.inner).join("");

function xlsxRows(data: Buffer): string[][] | null {
  const entries = readZip(data);
  if (!entries) return null;
  const file = (name: string) => entries.find((entry) => entry.name === name)?.read().toString("utf8") ?? null;
  const shared = [...elements(file("xl/sharedStrings.xml") ?? "", "si")].map((item) => entities(textRuns(item.inner)));
  const sheetName = entries.map((entry) => entry.name).filter((name) => /^xl\/worksheets\/sheet\d{1,4}\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  const sheet = sheetName ? file(sheetName) : null;
  if (!sheet) return null;
  const column = (letters: string) => [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  let cells = 0;
  for (const { inner: rowXml } of elements(sheet, "row")) {
    const row: string[] = [];
    for (const { attributes, inner } of elements(rowXml, "c")) {
      if (attributes.length > 200) continue;
      const letters = attributes.match(/r="([A-Z]{1,3})\d+"/)?.[1];
      const index = letters ? column(letters) : row.length;
      if (index >= MAX_COLUMNS) continue;
      const type = attributes.match(/t="(\w+)"/)?.[1];
      const value = elements(inner, "v").next().value?.inner ?? "";
      const text = type === "s" ? shared[Number(value)] ?? "" : type === "inlineStr" ? entities(textRuns(inner)) : entities(value);
      row[index] = text.trim();
    }
    const filled = Array.from(row, (value) => value ?? "");
    if (filled.some(Boolean)) { rows.push(filled); cells += filled.length; }
    if (rows.length >= MAX_ROWS || cells >= MAX_CELLS) break;
  }
  return rows;
}

// OFD (the format of Chinese e-invoices and itineraries) is a zip of XML pages.
function ofdText(data: Buffer): string | null {
  const entries = readZip(data);
  if (!entries) return null;
  const pages = entries.filter((entry) => /Pages\/Page_?\d+\/Content\.xml$/i.test(entry.name)).sort((a, b) => Number(a.name.match(/Page_?(\d+)/i)![1]) - Number(b.name.match(/Page_?(\d+)/i)![1]));
  const parts = pages.map((page) => [...elements(page.read().toString("utf8"), "ofd:TextCode")].map((item) => entities(item.inner)).join(" "));
  for (const entry of entries.filter((item) => /Attachs?\/.*\.xml$/i.test(item.name))) parts.push(htmlText(entry.read().toString("utf8")));
  const text = parts.join("\n\n").trim().slice(0, MAX_TEXT);
  return text || null;
}

function passSource(name: string, data: Buffer): Source {
  const pass = readZip(data)?.find((entry) => entry.name === "pass.json");
  if (!pass) return { kind: "unsupported", name, reason: "damaged" };
  try {
    const value = JSON.parse(decodeText(pass.read())) as { barcodes?: { message?: string }[]; barcode?: { message?: string }; semantics?: Record<string, unknown>; relevantDate?: string };
    const message = value.barcodes?.find((code) => code.message)?.message ?? value.barcode?.message ?? "";
    const semantics = value.semantics ?? {};
    const date = [semantics.originalDepartureDate, semantics.currentDepartureDate, value.relevantDate].find((item) => typeof item === "string") as string | undefined;
    return { kind: "pass", name, message, date: date ?? "" };
  } catch { return { kind: "unsupported", name, reason: "damaged" }; }
}

// Mail as saved by a mail app: the readable parts of a MIME message.
function mailText(raw: string, depth = 0): string {
  if (depth > 4) return "";
  const boundary = raw.match(/boundary="?([^";\r\n]+)"?/i)?.[1];
  const parts = boundary ? raw.split(`--${boundary}`).slice(1) : [raw];
  const texts: string[] = [];
  for (const part of parts) {
    const split = part.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const head = part.slice(0, split), content = part.slice(split).trim();
    if (/boundary=/i.test(head) && part !== raw) { texts.push(mailText(part, depth + 1)); continue; }
    const type = head.match(/content-type:\s*([^;\r\n]+)/i)?.[1]?.toLowerCase() ?? "text/plain";
    if (!type.startsWith("text/")) continue;
    const charset = head.match(/charset="?([\w-]+)"?/i)?.[1] ?? "utf-8";
    const encoding = head.match(/content-transfer-encoding:\s*([\w-]+)/i)?.[1]?.toLowerCase();
    let bytes: Buffer;
    if (encoding === "base64") bytes = Buffer.from(content.replace(/\s+/g, ""), "base64");
    else if (encoding === "quoted-printable") bytes = Buffer.from(content.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), "latin1");
    else bytes = Buffer.from(content, "utf8");
    let decoded: string;
    try { decoded = new TextDecoder(charset).decode(bytes); } catch { decoded = bytes.toString("utf8"); }
    texts.push(type === "text/html" ? htmlText(decoded) : decoded);
  }
  return texts.join("\n\n").slice(0, MAX_TEXT);
}

const startsWith = (data: Buffer, bytes: number[]) => bytes.every((byte, index) => data[index] === byte);

export function readSource(name: string, data: Buffer): Source {
  try { return sourceOf(name, data); } catch { return { kind: "unsupported", name, reason: "damaged" }; }
}

function sourceOf(name: string, data: Buffer): Source {
  if (!data.length) return { kind: "unsupported", name, reason: "empty" };
  const big = (limit: number) => data.length > limit ? { kind: "unsupported" as const, name, reason: "big" as const } : null;
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47])) return big(MAX_IMAGE) ?? { kind: "image", name, media: "image/png", data };
  if (startsWith(data, [0xff, 0xd8, 0xff])) return big(MAX_IMAGE) ?? { kind: "image", name, media: "image/jpeg", data };
  if (startsWith(data, [0x47, 0x49, 0x46, 0x38])) return big(MAX_IMAGE) ?? { kind: "image", name, media: "image/gif", data };
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return big(MAX_IMAGE) ?? { kind: "image", name, media: "image/webp", data };
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return big(MAX_PDF) ?? { kind: "pdf", name, data };
  if (data.subarray(4, 12).toString("latin1").startsWith("ftyp")) return { kind: "unsupported", name, reason: "format" };
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    if (extension === "pkpass") return passSource(name, data);
    if (extension === "ofd") { const text = ofdText(data); return text ? { kind: "text", name, text } : { kind: "unsupported", name, reason: "damaged" }; }
    const rows = xlsxRows(data);
    if (rows?.length) return { kind: "table", name, rows };
    const names = readZip(data)?.map((entry) => entry.name) ?? [];
    if (names.includes("pass.json")) return passSource(name, data);
    const text = names.some((entry) => /Content\.xml$/i.test(entry)) ? ofdText(data) : null;
    return text ? { kind: "text", name, text } : { kind: "unsupported", name, reason: "format" };
  }
  if (data.includes(0) && !(data[0] === 0xff || data[0] === 0xfe)) return { kind: "unsupported", name, reason: "format" };
  const text = decodeText(data);
  if (text.length <= MAX_JSON && (extension === "json" || /^\s*[[{]/.test(text))) {
    try { return { kind: "json", name, value: JSON.parse(text) }; } catch { /* read as text below */ }
  }
  if (extension === "csv" || extension === "tsv") return { kind: "table", name, rows: parseDelimited(text) };
  if (extension === "eml" || /^(received|from|mime-version|return-path):/im.test(text.slice(0, 2000))) return { kind: "text", name, text: mailText(text) };
  if (extension === "html" || extension === "htm" || /^\s*<(!doctype|html)/i.test(text)) return { kind: "text", name, text: htmlText(text) };
  if (extension === "xml") return { kind: "text", name, text: htmlText(text) };
  // A plain text file that is really a table.
  const rows = parseDelimited(text);
  if (rows.length > 2 && rows[0].length > 3 && rows.every((row) => Math.abs(row.length - rows[0].length) <= 1)) return { kind: "table", name, rows };
  return { kind: "text", name, text: text.slice(0, MAX_TEXT) };
}
