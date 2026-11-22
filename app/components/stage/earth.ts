import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { toVector, type Vec3 } from "../../lib/geo";
import { subsolar } from "../../lib/daylight";

// The Earth as photographed, as the app draws it: NASA's Blue Marble by day,
// Black Marble by night, lit by the sun where it really is (or was, at a
// flight's take-off), with a warm low sun at the terminator, the sun's glint
// on open water and blue haze at the sunlit edge. One pass over a sphere
// mesh on MapLibre's globe matrix, under the borders, airports and arcs.
// The shading is the app's (Globe.metal, `photographed`), constant for constant.

const SEGMENTS_LON = 256, SEGMENTS_LAT = 128;
// Exposure, city lights, moonlight and twilight glow, as the app sets them.
const PHOTO = [1.9, 2.2, 0.004, 0.1] as const;
const FADE_MS = 900;
// The sun swings to a flight's take-off rather than jumping there.
const SWING_MS = 1400;

const VERTEX = `#version 300 es
in vec3 a_pos;
in vec2 a_uv;
uniform mat4 u_matrix;
out vec3 v_n;
out vec2 v_uv;
void main() {
  v_n = a_pos;
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_n;
in vec2 v_uv;
uniform sampler2D u_day;
uniform sampler2D u_night;
uniform vec3 u_sun;
uniform vec3 u_camera;
uniform vec4 u_photo;
uniform float u_fade;
out vec4 fragColor;

vec3 toScreen(vec3 x) {
  vec3 mapped = 1.0 - exp(-max(x, 0.0));
  return pow(mapped, vec3(1.0 / 2.2));
}

void main() {
  vec3 n = normalize(v_n);
  vec3 view = normalize(u_camera - n);
  float facing = dot(n, view);
  if (facing < 0.0) discard;
  vec3 albedo = pow(texture(u_day, v_uv).rgb, vec3(2.2));
  float glow = texture(u_night, v_uv).r;
  // The night map also holds a faint ground (ice near 0.2, deserts near 0.12);
  // only what is brighter than that is a light.
  glow = pow(clamp((glow - 0.21) / 0.79, 0.0, 1.0), 2.0);
  // Close in, the lights' map is enlarged past its texels and a city turns
  // into a lit blot; it glows less the more it is enlarged.
  float enlarged = 1.0 / max(fwidth(v_uv.x) * float(textureSize(u_night, 0).x), 1e-4);
  glow *= mix(1.0, 0.2, smoothstep(1.5, 10.0, enlarged));
  float mu = dot(n, u_sun);
  float lit = clamp(mu, 0.0, 1.0);
  float dayside = smoothstep(-0.08, 0.10, mu);
  vec3 sunlight = mix(vec3(1.0, 0.66, 0.42), vec3(1.0), smoothstep(0.0, 0.3, mu));
  vec3 color = albedo * sunlight * (u_photo.x * pow(lit, 0.8)) * dayside;
  // Open water catches the sun; the map's sea is the blue of its depth.
  float water = smoothstep(0.004, 0.03, albedo.b - albedo.r);
  vec3 h = normalize(u_sun + view);
  float nh = clamp(dot(n, h), 0.0, 1.0);
  float glint = pow(nh, 120.0) * 0.5 + pow(nh, 14.0) * 0.035;
  color += vec3(1.0, 0.95, 0.86) * glint * water * lit;
  // Night: the land faintly by moonlight, the cities by their own light.
  float nightside = 1.0 - smoothstep(-0.12, 0.08, mu);
  color += albedo * u_photo.z * vec3(0.6, 0.72, 1.0) * nightside;
  color += vec3(1.0, 0.70, 0.40) * glow * u_photo.y * nightside;
  // Just past the terminator the sky still glows a little.
  color += vec3(1.0, 0.5, 0.25) * exp(-(mu + 0.03) * (mu + 0.03) / 0.0008) * u_photo.w * 0.04;
  // Haze toward the edge of the disc, blue where the sun reaches it.
  float edge = pow(1.0 - clamp(facing, 0.0, 1.0), 2.8);
  float air = clamp(mu * 1.6 + 0.2, 0.0, 1.0);
  color = mix(color, vec3(0.25, 0.48, 1.0) * u_photo.x * 0.35 * air, edge * 0.8 * air);
  fragColor = vec4(toScreen(color) * u_fade, u_fade);
}`;

function sphere() {
  const vertices = new Float32Array((SEGMENTS_LON + 1) * (SEGMENTS_LAT + 1) * 5);
  let at = 0;
  for (let row = 0; row <= SEGMENTS_LAT; row++) {
    const lat = 90 - (180 * row) / SEGMENTS_LAT;
    for (let column = 0; column <= SEGMENTS_LON; column++) {
      const lon = -180 + (360 * column) / SEGMENTS_LON;
      const [x, y, z] = toVector([lon, lat]);
      vertices.set([x, y, z, column / SEGMENTS_LON, row / SEGMENTS_LAT], at);
      at += 5;
    }
  }
  const indices = new Uint32Array(SEGMENTS_LON * SEGMENTS_LAT * 6);
  at = 0;
  for (let row = 0; row < SEGMENTS_LAT; row++) {
    for (let column = 0; column < SEGMENTS_LON; column++) {
      const a = row * (SEGMENTS_LON + 1) + column, b = a + SEGMENTS_LON + 1;
      indices.set([a, b, a + 1, a + 1, b, b + 1], at);
      at += 6;
    }
  }
  return { vertices, indices };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(url));
    image.src = url;
  });
}

export class EarthLayer implements CustomLayerInterface {
  readonly id = "earth";
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;
  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffers: WebGLBuffer[] = [];
  private count = 0;
  private textures: { day: WebGLTexture | null; night: WebGLTexture | null } = { day: null, night: null };
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private shownAt = 0;
  private sunInstant: number | null = null;
  private swing: { from: Vec3; start: number } | null = null;
  private onShown: () => void;

  constructor(onShown: () => void) {
    this.onShown = onShown;
  }

  // The sun at an instant in ms, or null for now.
  setSun(instant: number | null) {
    if (instant === this.sunInstant) return;
    this.swing = this.shown ? { from: this.sunNow(performance.now()), start: performance.now() } : null;
    this.sunInstant = instant;
    this.map?.triggerRepaint();
  }

  private sunNow(now: number): Vec3 {
    const target = toVector(subsolar(this.sunInstant ?? Date.now()));
    if (!this.swing) return target;
    const t = Math.min(1, (now - this.swing.start) / SWING_MS);
    if (t >= 1) {
      this.swing = null;
      return target;
    }
    const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const mixed = this.swing.from.map((value, index) => value + (target[index] - value) * k) as Vec3;
    const length = Math.hypot(...mixed) || 1;
    return mixed.map((value) => value / length) as Vec3;
  }

  get shown() {
    return this.shownAt > 0;
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext) {
    if (!(typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext)) return;
    try {
      this.setUp(map, context);
    } catch {
      // A shader that will not build, or a lost context: the drawn globe stays.
      this.onRemove();
      this.program = null;
    }
  }

  private setUp(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "earth shader");
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.bindAttribLocation(program, 1, "a_uv");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "earth program");
    this.program = program;
    for (const name of ["u_matrix", "u_day", "u_night", "u_sun", "u_camera", "u_photo", "u_fade"]) this.uniforms[name] = gl.getUniformLocation(program, name);

    const { vertices, indices } = sphere();
    // MapLibre keeps its own record of what is bound; leave it as found.
    const boundArray = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    const boundBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vertexBuffer = gl.createBuffer()!, indexBuffer = gl.createBuffer()!;
    this.buffers = [vertexBuffer, indexBuffer];
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(boundArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, boundBuffer);
    this.count = indices.length;

    // The maps at 4096 for every screen; a large one, where the GPU can hold
    // them, swaps in the 8192 pair once the first has shown.
    const canvas = map.getCanvas();
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const large = Math.max(canvas.width, canvas.height) >= 1800 && memory >= 4 && (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) >= 8192;
    Promise.all([loadImage("/earth/day-4096.webp"), loadImage("/earth/night-4096.webp")]).then(([day, night]) => {
      if (this.gl !== gl) return;
      this.textures.day = this.upload(day, false);
      this.textures.night = this.upload(night, true);
      this.shownAt = performance.now();
      this.onShown();
      map.triggerRepaint();
      if (large) Promise.all([loadImage("/earth/day-8192.webp"), loadImage("/earth/night-8192.webp")]).then(([sharpDay, sharpNight]) => {
        if (this.gl !== gl) return;
        const old = [this.textures.day, this.textures.night];
        this.textures.day = this.upload(sharpDay, false);
        this.textures.night = this.upload(sharpNight, true);
        for (const texture of old) gl.deleteTexture(texture);
        map.triggerRepaint();
      }).catch(() => {});
    }).catch(() => {});
  }

  // The night map is grey, so one channel holds it.
  private upload(image: HTMLImageElement, grey: boolean) {
    const gl = this.gl!;
    // Uploads land between MapLibre's frames, outside the state it resets
    // after a custom layer draws, so what they change is put back.
    const saved = {
      texture: gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
      align: gl.getParameter(gl.UNPACK_ALIGNMENT) as number,
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean,
      premultiply: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean,
    };
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (grey) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Near the edge of the disc the ground is seen at a slant.
    const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
    if (anisotropic) gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number));
    gl.bindTexture(gl.TEXTURE_2D, saved.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, saved.align);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, saved.flip);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, saved.premultiply);
    return texture;
  }

  onRemove() {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    gl.deleteTexture(this.textures.day);
    gl.deleteTexture(this.textures.night);
    this.gl = null;
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput) {
    const gl = this.gl, program = this.program;
    if (!gl || !program || context !== gl || !this.textures.day || !this.textures.night) return;
    const data = options.defaultProjectionData;
    const plane = data.clippingPlane;
    if (data.projectionTransition < 0.999 || !plane) return;
    const distance = plane[3] < 0 ? -1 / plane[3] : 1e6;
    const now = performance.now();
    const fade = Math.min(1, (now - this.shownAt) / FADE_MS);
    const sun = this.sunNow(now);

    gl.useProgram(program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    gl.uniformMatrix4fv(this.uniforms.u_matrix, false, Float32Array.from(data.mainMatrix as unknown as ArrayLike<number>));
    gl.uniform3f(this.uniforms.u_camera, plane[0] * distance, plane[1] * distance, plane[2] * distance);
    gl.uniform3f(this.uniforms.u_sun, sun[0], sun[1], sun[2]);
    gl.uniform4f(this.uniforms.u_photo, PHOTO[0], PHOTO[1], PHOTO[2], PHOTO[3]);
    gl.uniform1f(this.uniforms.u_fade, 1 - Math.pow(1 - fade, 3));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.day);
    gl.uniform1i(this.uniforms.u_day, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.night);
    gl.uniform1i(this.uniforms.u_night, 1);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (fade < 1 || this.swing) this.map?.triggerRepaint();
  }
}
