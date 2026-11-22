// Client side of scripts/build-basemap.mjs: tiles are packed into chunks and
// served to MapLibre through a custom protocol, so missing (ocean) tiles never
// become network requests. Keep the constants in sync with the build script.
export const BASEMAP_PROTOCOL = "flyprint-basemap";
export const BASEMAP_MAX_ZOOM = 7;
const CHUNK_ZOOM = 3;
const VERSION = "ne10m-z7-c3-v5";

type Chunk = { index: Record<string, [number, number]>; body: Uint8Array };
const chunks = new Map<string, Promise<Chunk | null>>();
// MapLibre transfers each response's buffer to its worker, which detaches it,
// so every empty tile needs a buffer of its own.
const empty = () => ({ data: new ArrayBuffer(0) });

function chunkName(z: number, x: number, y: number) {
  return z <= CHUNK_ZOOM ? `${z}` : `${z}-${x >> (z - CHUNK_ZOOM)}-${y >> (z - CHUNK_ZOOM)}`;
}

function loadChunk(name: string): Promise<Chunk | null> {
  let pending = chunks.get(name);
  if (!pending) {
    pending = fetch(`/basemap/${name}.bin?v=${VERSION}`)
      .then(async (response) => {
        // A chunk exists only where there is land; its absence means open ocean.
        if (!response.ok) return null;
        const buffer = new Uint8Array(await response.arrayBuffer());
        const headerLength = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0, true);
        const index = JSON.parse(new TextDecoder().decode(buffer.subarray(4, 4 + headerLength))) as Chunk["index"];
        return { index, body: buffer.subarray(4 + headerLength) };
      })
      .catch(() => { chunks.delete(name); return null; });
    chunks.set(name, pending);
  }
  return pending;
}

let manifest: Promise<Set<string>> | null = null;
function loadManifest() {
  manifest ??= fetch(`/basemap/manifest.json?v=${VERSION}`)
    .then((response) => {
      // A failed manifest (a 502 while the container is replaced) is retried by
      // the next tile instead of leaving the globe blank for the session.
      if (!response.ok) throw new Error(`basemap manifest ${response.status}`);
      return response.json() as Promise<string[]>;
    })
    .then((names) => new Set(names))
    .catch(() => { manifest = null; return new Set<string>(); });
  return manifest;
}

export async function loadBasemapTile(url: string): Promise<{ data: ArrayBuffer }> {
  const match = /^flyprint-basemap:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  if (!match) return empty();
  const [z, x, y] = match.slice(1).map(Number);
  if (z > BASEMAP_MAX_ZOOM) return empty();
  const name = chunkName(z, x, y);
  if (!(await loadManifest()).has(name)) return empty();
  const chunk = await loadChunk(name);
  const entry = chunk?.index[`${x}/${y}`];
  if (!chunk || !entry) return empty();
  const [offset, length] = entry;
  return { data: chunk.body.slice(offset, offset + length).buffer };
}
