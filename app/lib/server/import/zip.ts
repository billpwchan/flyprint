import { inflateRawSync } from "node:zlib";

// Enough of the zip format to read .pkpass, .xlsx and .ofd files: the central
// directory, stored and deflated entries. What one archive may expand to is
// capped in total, not only per entry, and entries may not share their data,
// so a small crafted file cannot inflate into gigabytes.

export type ZipEntry = { name: string; read: () => Buffer };

const MAX_ENTRY = 24 * 1024 * 1024;
const MAX_TOTAL = 48 * 1024 * 1024;
const MAX_ENTRIES = 4000;

export function readZip(data: Buffer): ZipEntry[] | null {
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) return null;
  let end = -1;
  for (let index = data.length - 22; index >= Math.max(0, data.length - 65_557); index--) {
    if (data.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) return null;
  const count = data.readUInt16LE(end + 10);
  if (count > MAX_ENTRIES) return null;
  let offset = data.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  const locals = new Set<number>();
  let spent = 0;
  for (let index = 0; index < count && offset + 46 <= data.length; index++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) break;
    const method = data.readUInt16LE(offset + 10);
    const compressed = data.readUInt32LE(offset + 20);
    const size = data.readUInt32LE(offset + 24);
    const nameLength = data.readUInt16LE(offset + 28), extraLength = data.readUInt16LE(offset + 30), commentLength = data.readUInt16LE(offset + 32);
    const local = data.readUInt32LE(offset + 42);
    if (locals.has(local) || local + 30 > data.length) return null;
    locals.add(local);
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
    entries.push({
      name,
      read: () => {
        if (size > MAX_ENTRY || spent + size > MAX_TOTAL || data.readUInt32LE(local) !== 0x04034b50) throw new Error("zip entry");
        const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
        const raw = data.subarray(start, start + compressed);
        let out: Buffer;
        if (method === 0) out = Buffer.from(raw);
        else if (method === 8) out = inflateRawSync(raw, { maxOutputLength: Math.min(MAX_ENTRY, MAX_TOTAL - spent) });
        else throw new Error("zip method");
        spent += out.length;
        return out;
      },
    });
  }
  return entries;
}
