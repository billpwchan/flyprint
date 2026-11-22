import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { bowedTrack, type LngLat, type Vec3 } from "../../lib/geo";

// Flights drawn as arcs that bow sideways over the ground and rise off the
// globe, in their own WebGL pass on MapLibre's globe matrix (which maps a
// unit sphere to clip space). Each flight is one arc, so a route reads as
// often as it was flown; height separates routes out of a hub near the edge.
//
// An arc is light rather than ink: a fine core inside a soft falloff, added
// to what is under it, so a route flown often glows brighter. A pulse runs
// along each flight now and then, at the same speed over the ground for a
// short hop and a long haul.

export type Arc = {
  key: string;
  from: LngLat;
  to: LngLat;
  color: string;
  width: number;
  alpha: number;
  // Sideways bow as a share of the route's length; see bowedTrack.
  bow: number;
  // When the arc draws, as a share of the group's reveal (0–1).
  delay: number;
  span: number;
  // Where the flight is along its arc (0–1): behind it the arc is solid, ahead
  // dashed, as a plan. Flown flights leave it out; 0 is a flight not yet taken off.
  plan?: number;
};

export type GroupName = "base" | "focus" | "hover";

type Group = {
  vao: WebGLVertexArrayObject | null;
  vertices: WebGLBuffer | null;
  indices: WebGLBuffer | null;
  count: number;
  arcs: Arc[];
  paths: Vec3[][];
  alpha: Tween;
  reveal: Tween;
  // Brighter toward where each flight landed.
  directed: boolean;
  // A light running along each arc in turn, for a journey in travel order.
  comet: boolean;
};

type Tween = { from: number; to: number; start: number; duration: number };
const tween = (value: number): Tween => ({ from: value, to: value, start: 0, duration: 0 });
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
function valueOf(state: Tween, now: number) {
  if (!state.duration || now >= state.start + state.duration) return state.to;
  return state.from + (state.to - state.from) * ease((now - state.start) / state.duration);
}
const settled = (state: Tween, now: number) => !state.duration || now >= state.start + state.duration;
function retarget(state: Tween, to: number, duration: number, now: number) {
  state.from = valueOf(state, now);
  state.to = to;
  state.start = now;
  state.duration = duration;
}

const FLOATS = 22;
const COMET_PERIOD = 2800;
// A pulse crosses its arc in this share of its cycle and rests for the rest.
const PULSE_DUTY = 0.3;

const VERTEX = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform vec3 u_camera;
uniform float u_dpr;
uniform float u_width_scale;
uniform float u_limb;
in vec3 a_pos;
in vec3 a_prev;
in vec3 a_next;
in vec2 a_ts;
in vec4 a_color;
in vec3 a_style;
in vec2 a_motion;
in vec2 a_plan;
uniform float u_glow;
out vec4 v_color;
out float v_t;
out float v_edge;
out float v_core;
out float v_vis;
out vec2 v_timing;
out vec2 v_motion;
out vec2 v_plan;

// The camera sees a point unless the sphere sits between them.
float visible(vec3 p) {
  vec3 d = p - u_camera;
  float a = dot(d, d);
  float b = dot(u_camera, d);
  float c = dot(u_camera, u_camera) - 1.0;
  float disc = b * b - a * c;
  if (disc <= 0.0) return 1.0;
  float s = (-b - sqrt(disc)) / a;
  return smoothstep(0.972, 0.998, s);
}

vec2 screen(vec4 clip) { return clip.xy / clip.w * 0.5 * u_viewport; }

void main() {
  vec4 clip = u_matrix * vec4(a_pos, 1.0);
  vec2 here = screen(clip);
  vec2 d0 = here - screen(u_matrix * vec4(a_prev, 1.0));
  vec2 d1 = screen(u_matrix * vec4(a_next, 1.0)) - here;
  vec2 dir = vec2(0.0);
  if (dot(d0, d0) > 1e-6) dir += normalize(d0);
  if (dot(d1, d1) > 1e-6) dir += normalize(d1);
  dir = dot(dir, dir) > 1e-8 ? normalize(dir) : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float core = a_style.x * u_width_scale * 0.5 * u_dpr;
  float half_width = core + (u_glow + 1.0) * u_dpr;
  clip.xy += normal * (a_ts.y * half_width) / (0.5 * u_viewport) * clip.w;
  clip.z = 0.0;
  gl_Position = clip;
  v_color = a_color;
  v_t = a_ts.x;
  v_edge = a_ts.y * half_width;
  v_core = core;
  v_motion = a_motion;
  v_plan = a_plan;
  // Where the point falls on screen relative to the globe's outline: 1 on
  // the outline. The camera looks at the globe's centre, so distance on
  // screen grows with the tangent of the angle off that line of sight.
  vec3 sight = normalize(-u_camera);
  float along = dot(a_pos - u_camera, sight);
  float across = length((a_pos - u_camera) - along * sight);
  float outline = (across / along) * sqrt(dot(u_camera, u_camera) - 1.0);
  // Paths quieten toward the edge, as if seen through more air, and a raised
  // path that would stand out past the outline fades instead of hanging in space.
  float limb = (1.0 - smoothstep(0.97, 1.03, outline)) * mix(1.0 - 0.55 * u_limb, 1.0, 1.0 - smoothstep(0.7, 0.97, outline));
  v_vis = visible(a_pos) * limb;
  v_timing = a_style.yz;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform float u_alpha;
uniform float u_reveal;
uniform float u_time;
uniform float u_comet;
uniform float u_directed;
uniform float u_dpr;
uniform float u_glow;
uniform float u_glow_gain;
uniform float u_clock;
uniform float u_pulse;
uniform float u_additive;
in vec4 v_color;
in float v_t;
in float v_edge;
in float v_core;
in float v_vis;
in vec2 v_timing;
in vec2 v_motion;
in vec2 v_plan;
out vec4 fragColor;

void main() {
  float local = clamp((u_reveal - v_timing.x) / max(v_timing.y, 1e-4), 0.0, 1.0);
  if (v_t > local) discard;
  float d = abs(v_edge);
  // A core a pixel or two wide with a soft edge, inside a gaussian glow.
  float core = 1.0 - smoothstep(v_core - 0.5 * u_dpr, v_core + 0.7 * u_dpr, d);
  float sigma = max(u_glow * u_dpr * 0.42, 1e-3);
  float halo = exp(-(d * d) / (2.0 * sigma * sigma)) * u_glow_gain;
  float strength = u_alpha * v_color.a * v_vis;
  // Faint where it leaves, full where it lands.
  if (u_directed > 0.5) strength *= mix(0.38, 1.0, v_t);
  // Quieter right at the airports, where every arc from a hub meets.
  strength *= mix(0.22, 1.0, smoothstep(0.0, 0.1, min(v_t, 1.0 - v_t)));
  // Ahead of the aircraft the route is still a plan: dashed, and a little quieter.
  float dash = 1.0;
  if (v_plan.x < 0.999 && v_t > v_plan.x) {
    float along = (v_t - v_plan.x) * v_plan.y;
    float f = fract(along);
    float aa = max(fwidth(along) * 1.2, 1e-3);
    dash = smoothstep(0.0, aa, f) * (1.0 - smoothstep(0.52 - aa, 0.52, f));
    strength *= 0.82 * dash;
  }
  // A flight in the air: a point of light where it is now.
  float here = 0.0;
  if (v_plan.x > 0.0 && v_plan.x < 0.999) {
    float d = (v_t - v_plan.x) * v_plan.y * 2.4;
    here = exp(-d * d) * (0.85 + 0.15 * sin(u_clock * 2.4));
  }
  float flash = local < 1.0 ? exp(-(local - v_t) * 36.0) : 0.0;
  if (u_comet > 0.5) {
    float head = (u_time - v_timing.x) / max(v_timing.y, 1e-4);
    float behind = head - v_t;
    if (behind >= 0.0 && head < 1.12) flash = max(flash, exp(-behind * 11.0));
  }
  float pulse = 0.0;
  if (u_pulse > 0.0) {
    float head = fract(u_clock / v_motion.y + v_motion.x) / ${PULSE_DUTY.toFixed(2)};
    float behind = head - v_t;
    if (behind >= 0.0 && head < 1.2) pulse = exp(-behind * 26.0) * (1.0 - smoothstep(1.0, 1.2, head)) * smoothstep(0.0, 0.08, head) * u_pulse;
  }
  float light = max(max(flash, pulse) * dash, here);
  float alpha = strength * (core + halo) + light * v_vis * min(u_alpha * 1.6, 1.0) * (core + halo * 2.2);
  alpha = clamp(alpha, 0.0, 1.0);
  // The pulse keeps its traveller's colour, whitening only at its head.
  float whiten = max(flash * 0.6, pulse * pulse * 0.55);
  vec3 color = mix(v_color.rgb * (1.0 + 0.35 * pulse), vec3(1.0), clamp(whiten, 0.0, 1.0));
  // Mostly added to what is under it, like light, so overlaps brighten.
  fragColor = vec4(color * alpha, alpha * (1.0 - u_additive));
}`;

const ATTRIBUTES: [string, number, number][] = [
  ["a_pos", 3, 0], ["a_prev", 3, 3], ["a_next", 3, 6], ["a_ts", 2, 9], ["a_color", 4, 11], ["a_style", 3, 15], ["a_motion", 2, 18], ["a_plan", 2, 20],
];
const UNIFORMS = ["u_matrix", "u_viewport", "u_camera", "u_dpr", "u_width_scale", "u_limb", "u_alpha", "u_reveal", "u_time", "u_comet", "u_directed", "u_glow", "u_glow_gain", "u_clock", "u_pulse", "u_additive"] as const;

// How each group looks: glow radius (CSS px) and strength, how much of it is
// added rather than laid over, and how bright its pulses run.
const LOOK: Record<GroupName, { glow: number; gain: number; additive: number; pulse: number }> = {
  base: { glow: 3.2, gain: 0.16, additive: 0.6, pulse: 0.8 },
  focus: { glow: 7, gain: 0.24, additive: 0.55, pulse: 1 },
  hover: { glow: 9, gain: 0.32, additive: 0.4, pulse: 0 },
};

function hash(key: string) {
  let value = 2166136261;
  for (let index = 0; index < key.length; index++) value = Math.imul(value ^ key.charCodeAt(index), 16777619);
  return ((value >>> 0) % 10007) / 10007;
}

// A pulse's start in its cycle, and the cycle's length in seconds: the time
// to cross the arc grows with its length, so every pulse moves at one speed.
function motionOf(arc: Arc, path: Vec3[]): [number, number] {
  const [a, b] = [path[0], path.at(-1)!];
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  const angle = Math.acos(Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb))));
  const travel = 1.1 + 2.6 * Math.sqrt(angle / Math.PI);
  return [hash(arc.key), travel / PULSE_DUTY * (0.85 + 0.3 * hash(`${arc.key}~`))];
}

// Dashes on a planned arc: more on a long haul, never so few a hop reads as solid.
function dashesOf(path: Vec3[]) {
  const [a, b] = [path[0], path.at(-1)!];
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  const angle = Math.acos(Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb))));
  return 11 + 30 * Math.sqrt(angle / Math.PI);
}

function rgb(hex: string): Vec3 {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

// Height at the middle of an arc, as a share of the globe's radius: long hauls
// rise higher than short hops, but low enough not to hook over the horizon.
export const liftOf = (angle: number) => (0.16 * angle) / (1 + 0.7 * angle);

export function arcPath(from: LngLat, to: LngLat, bow: number): Vec3[] {
  const track = bowedTrack(from, to, bow);
  const [a, b] = [track[0], track.at(-1)!];
  const lift = liftOf(Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))));
  return track.map((point, index) => {
    const scale = 1 + lift * Math.sin((Math.PI * index) / (track.length - 1));
    return [point[0] * scale, point[1] * scale, point[2] * scale];
  });
}

const pathCache = new Map<string, Vec3[]>();
function cachedPath(arc: Arc) {
  const key = `${arc.from[0]},${arc.from[1]}>${arc.to[0]},${arc.to[1]}~${arc.bow.toFixed(4)}`;
  let path = pathCache.get(key);
  if (!path) { path = arcPath(arc.from, arc.to, arc.bow); pathCache.set(key, path); }
  return path;
}

export type Projection = { matrix: Float64Array; camera: Vec3; width: number; height: number };

function isOccluded(point: Vec3, camera: Vec3) {
  const d: Vec3 = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const b = camera[0] * d[0] + camera[1] * d[1] + camera[2] * d[2];
  const c = camera[0] * camera[0] + camera[1] * camera[1] + camera[2] * camera[2] - 1;
  const disc = b * b - a * c;
  if (disc <= 0) return false;
  return (-b - Math.sqrt(disc)) / a < 0.99;
}

export function project(point: Vec3, view: Projection): [number, number] | null {
  const m = view.matrix;
  const [x, y, z] = point;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (w <= 0) return null;
  const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  return [((cx + 1) / 2) * view.width, ((1 - cy) / 2) * view.height];
}

export class ArcLayer implements CustomLayerInterface {
  readonly id = "arcs";
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;
  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uniforms = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private groups: Record<GroupName, Group>;
  private view: Projection | null = null;
  private reduced = false;
  private started = performance.now();

  constructor() {
    const empty = (): Group => ({ vao: null, vertices: null, indices: null, count: 0, arcs: [], paths: [], alpha: tween(1), reveal: tween(1), directed: false, comet: false });
    this.groups = { base: empty(), focus: empty(), hover: empty() };
    if (typeof window !== "undefined") this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext) {
    if (!(typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext)) return;
    const gl = context;
    this.map = map;
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "arc shader");
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    ATTRIBUTES.forEach(([name], index) => gl.bindAttribLocation(program, index, name));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "arc program");
    this.program = program;
    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);
    for (const name of Object.keys(this.groups) as GroupName[]) this.upload(name);
  }

  onRemove() {
    const gl = this.gl;
    if (!gl) return;
    for (const group of Object.values(this.groups)) {
      gl.deleteBuffer(group.vertices);
      gl.deleteBuffer(group.indices);
      gl.deleteVertexArray(group.vao);
    }
    gl.deleteProgram(this.program);
    this.gl = null;
    this.map = null;
  }

  // Replace a group's arcs. `reveal` draws them in from their origins.
  set(name: GroupName, arcs: Arc[], options: { directed?: boolean; comet?: boolean; reveal?: number } = {}) {
    const group = this.groups[name];
    group.arcs = arcs;
    group.paths = arcs.map(cachedPath);
    group.directed = !!options.directed;
    group.comet = !!options.comet;
    const now = performance.now();
    if (options.reveal && !this.reduced && arcs.length) {
      group.reveal = { from: 0, to: 1, start: now, duration: options.reveal };
    } else {
      group.reveal = tween(1);
    }
    this.upload(name);
    this.map?.triggerRepaint();
  }

  fade(name: GroupName, alpha: number, duration = 320) {
    retarget(this.groups[name].alpha, alpha, this.reduced ? 0 : duration, performance.now());
    this.map?.triggerRepaint();
  }

  // The arc under a screen point, if one is within reach.
  pick(x: number, y: number, reach: number): { group: GroupName; arc: Arc } | null {
    const view = this.view;
    if (!view) return null;
    let best: { group: GroupName; arc: Arc; distance: number } | null = null;
    for (const name of ["hover", "focus", "base"] as GroupName[]) {
      const group = this.groups[name];
      if (valueOf(group.alpha, performance.now()) < 0.3) continue;
      group.paths.forEach((path, index) => {
        let previous: [number, number] | null = null;
        for (let step = 0; step < path.length; step += 2) {
          const point = path[step];
          const here = isOccluded(point, view.camera) ? null : project(point, view);
          if (here && previous) {
            const distance = segmentDistance(x, y, previous, here);
            if (distance <= reach && (!best || distance < best.distance)) best = { group: name, arc: group.arcs[index], distance };
          }
          previous = here;
        }
      });
      if (best) break;
    }
    return best ? { group: (best as { group: GroupName }).group, arc: (best as { arc: Arc }).arc } : null;
  }

  // The arcs of a group with these keys, as drawn.
  find(name: GroupName, keys: Set<string>) {
    return this.groups[name].arcs.filter((arc) => keys.has(arc.key));
  }

  projection() {
    return this.view;
  }

  // Where a share of a drawn arc's length falls on screen; null when the globe hides it.
  pointOn(name: GroupName, key: string, share: number): [number, number] | null {
    const view = this.view, group = this.groups[name];
    const index = group.arcs.findIndex((arc) => arc.key === key);
    if (!view || index < 0) return null;
    const path = group.paths[index];
    const along = Math.min(1, Math.max(0, share)) * (path.length - 1);
    const step = Math.min(path.length - 2, Math.floor(along)), rest = along - step;
    const [a, b] = [path[step], path[step + 1]];
    const point: Vec3 = [a[0] + (b[0] - a[0]) * rest, a[1] + (b[1] - a[1]) * rest, a[2] + (b[2] - a[2]) * rest];
    return isOccluded(point, view.camera) ? null : project(point, view);
  }

  private upload(name: GroupName) {
    const gl = this.gl, group = this.groups[name];
    if (!gl) return;
    const vertexCount = group.paths.reduce((sum, path) => sum + path.length * 2, 0);
    const indexCount = group.paths.reduce((sum, path) => sum + (path.length - 1) * 6, 0);
    const data = new Float32Array(vertexCount * FLOATS);
    const indices = new Uint32Array(indexCount);
    let v = 0, i = 0;
    group.paths.forEach((path, arcIndex) => {
      const arc = group.arcs[arcIndex];
      const [r, g, b] = rgb(arc.color);
      const [phase, cycle] = motionOf(arc, path);
      const plan = arc.plan ?? 1, dashes = dashesOf(path);
      const first = v;
      for (let step = 0; step < path.length; step++) {
        const point = path[step], prev = path[Math.max(0, step - 1)], next = path[Math.min(path.length - 1, step + 1)];
        const t = step / (path.length - 1);
        for (const side of [-1, 1]) {
          const offset = v * FLOATS;
          data.set(point, offset);
          data.set(prev, offset + 3);
          data.set(next, offset + 6);
          data[offset + 9] = t;
          data[offset + 10] = side;
          data[offset + 11] = r; data[offset + 12] = g; data[offset + 13] = b; data[offset + 14] = arc.alpha;
          data[offset + 15] = arc.width; data[offset + 16] = arc.delay; data[offset + 17] = arc.span;
          data[offset + 18] = phase; data[offset + 19] = cycle;
          data[offset + 20] = plan; data[offset + 21] = dashes;
          v++;
        }
      }
      for (let step = 0; step < path.length - 1; step++) {
        const a = first + step * 2;
        indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i);
        i += 6;
      }
    });
    if (!group.vao) {
      group.vao = gl.createVertexArray();
      group.vertices = gl.createBuffer();
      group.indices = gl.createBuffer();
      gl.bindVertexArray(group.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, group.vertices);
      ATTRIBUTES.forEach(([, size, offset], index) => {
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, size, gl.FLOAT, false, FLOATS * 4, offset * 4);
      });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, group.indices);
      gl.bindVertexArray(null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, group.vertices);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindVertexArray(group.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, group.indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    group.count = indexCount;
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput) {
    const gl = this.gl, program = this.program, map = this.map;
    if (!gl || !program || !map || context !== gl) return;
    const data = options.defaultProjectionData;
    const plane = data.clippingPlane;
    // A globe in transition to mercator has no single sphere to draw on.
    if (data.projectionTransition < 0.999 || !plane) return;
    const distance = plane[3] < 0 ? -1 / plane[3] : 1e6;
    const camera: Vec3 = [plane[0] * distance, plane[1] * distance, plane[2] * distance];
    const canvas = map.getCanvas();
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const matrix = data.mainMatrix as unknown as ArrayLike<number>;
    this.view = { matrix: Float64Array.from(matrix), camera, width: canvas.clientWidth, height: canvas.clientHeight };

    gl.useProgram(program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    gl.uniformMatrix4fv(this.uniforms.u_matrix, false, Float32Array.from(matrix));
    gl.uniform2f(this.uniforms.u_viewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform3f(this.uniforms.u_camera, camera[0], camera[1], camera[2]);
    gl.uniform1f(this.uniforms.u_dpr, dpr);

    const now = performance.now();
    let animating = false, pulsing = false;
    gl.uniform1f(this.uniforms.u_clock, ((now - this.started) / 1000) % 3600);
    const draw = (name: GroupName, widthScale: number, alphaScale: number, comet: boolean) => {
      const group = this.groups[name];
      if (!group.count || !group.vao) return;
      const alpha = valueOf(group.alpha, now) * alphaScale;
      if (alpha <= 0.002) return;
      const look = LOOK[name];
      // Pulses wait until the network has drawn in, and stay off for a trip,
      // whose own light runs its legs in order.
      const pulse = this.reduced || comet || !settled(group.reveal, now) ? 0 : look.pulse;
      if (pulse > 0 && alpha > 0.05) pulsing = true;
      gl.uniform1f(this.uniforms.u_glow, look.glow);
      gl.uniform1f(this.uniforms.u_glow_gain, look.gain);
      gl.uniform1f(this.uniforms.u_additive, look.additive);
      gl.uniform1f(this.uniforms.u_pulse, pulse);
      gl.uniform1f(this.uniforms.u_width_scale, widthScale);
      // The background network quietens most at the edge; what is lit, least.
      gl.uniform1f(this.uniforms.u_limb, name === "base" ? 1 : 0.35);
      gl.uniform1f(this.uniforms.u_alpha, alpha);
      gl.uniform1f(this.uniforms.u_reveal, valueOf(group.reveal, now) * 1.0001);
      gl.uniform1f(this.uniforms.u_comet, comet ? 1 : 0);
      gl.uniform1f(this.uniforms.u_time, ((now - this.started) % COMET_PERIOD) / COMET_PERIOD);
      gl.uniform1f(this.uniforms.u_directed, group.directed ? 1 : 0);
      gl.bindVertexArray(group.vao);
      gl.drawElements(gl.TRIANGLES, group.count, gl.UNSIGNED_INT, 0);
      if (!settled(group.alpha, now) || !settled(group.reveal, now)) animating = true;
    };
    const focus = this.groups.focus;
    const cometOn = focus.comet && !this.reduced && focus.count > 0;
    // Arcs add up, so a small globe (a phone, or zoomed out) packs the same
    // light into fewer pixels; the network dims with the globe's size on screen.
    const radius = (512 * Math.pow(2, map.getZoom())) / (2 * Math.PI);
    draw("base", 1, Math.min(1, Math.max(0.45, radius / 420)), false);
    draw("focus", 1, 1, cometOn);
    draw("hover", 1, 1, false);
    gl.bindVertexArray(null);
    if (animating || cometOn || pulsing) map.triggerRepaint();
  }
}

function segmentDistance(x: number, y: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
  const px = a[0] + t * dx - x, py = a[1] + t * dy - y;
  return Math.sqrt(px * px + py * py);
}
