import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { yearFilm, type CardContext } from "./cards";
import { CARD } from "./globe";
import { FPS } from "./timeline";

// The year card as a short silent film, made on this device: drawn frame by
// frame at exact times and encoded as H.264 in an MP4, the one video every
// phone, chat app and feed takes. 1080 × 1440 is the card at three times.

const SCALE = 3;
const WIDTH = CARD.width * SCALE, HEIGHT = CARD.height * SCALE;
// A still card with fine lines moving on it; chat apps encode it again anyway.
const BITRATE = 6_000_000;
const KEY_EVERY = FPS * 2;

// High, then Main, then Baseline profile, all at level 4.0.
const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.420028"];

let support: Promise<VideoEncoderConfig | null> | null = null;

// Where this browser can't encode H.264 the film isn't offered at all.
export function filmSupport() {
  support ??= (async () => {
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
    for (const codec of CODECS) {
      const config: VideoEncoderConfig = { codec, width: WIDTH, height: HEIGHT, bitrate: BITRATE, framerate: FPS, avc: { format: "avc" } };
      const answer = await VideoEncoder.isConfigSupported(config).catch(() => null);
      if (answer?.supported) return config;
    }
    return null;
  })();
  return support;
}

// Gives the page a moment between frames, so the sheet stays responsive and
// shows progress; a message, unlike a timer, isn't held back to once a second.
const breathe = () => new Promise<void>((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
  channel.port2.postMessage(null);
});

// Until the encoder takes a frame off its queue; a timer and the signal see to
// it that a missed event or a closed sheet can't leave the film waiting.
const drained = (encoder: VideoEncoder, signal: AbortSignal) => new Promise<void>((resolve) => {
  const done = () => {
    window.clearTimeout(timer);
    encoder.removeEventListener("dequeue", done);
    signal.removeEventListener("abort", done);
    resolve();
  };
  const timer = window.setTimeout(done, 50);
  encoder.addEventListener("dequeue", done);
  signal.addEventListener("abort", done);
});

export async function printFilm(request: { year: number | null }, context: CardContext, progress: (share: number) => void, signal: AbortSignal): Promise<Blob> {
  const config = await filmSupport();
  if (!config) throw new Error("film");
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  let film: Awaited<ReturnType<typeof yearFilm>> | null = null;
  let encoder: VideoEncoder | null = null;
  try {
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    film = await yearFilm(ctx, request, context);
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: WIDTH, height: HEIGHT, frameRate: FPS }, fastStart: "in-memory" });
    let failure: unknown = null;
    encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (error) => { failure = error; } });
    encoder.configure(config);
    const step = 1_000_000 / FPS;
    for (let index = 0; index < film.frames; index++) {
      if (signal.aborted) throw signal.reason;
      if (failure) throw failure;
      film.draw(index);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(index * step), duration: Math.round(step) });
      encoder.encode(frame, { keyFrame: index % KEY_EVERY === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 4 && !signal.aborted && !failure) await drained(encoder, signal);
      progress((index + 1) / film.frames);
      await breathe();
    }
    if (signal.aborted) throw signal.reason;
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    if (encoder && encoder.state !== "closed") encoder.close();
    film?.release();
    canvas.width = canvas.height = 0;
  }
}
