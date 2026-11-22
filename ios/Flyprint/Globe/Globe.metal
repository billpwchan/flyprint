#include <metal_stdlib>
using namespace metal;

// The night globe. The ground is ray-cast per pixel against a unit sphere, so
// it stays round at any zoom; land, shore and borders come from distance
// fields, so their edges stay one pixel wide however close the camera is.
// Flights are bands of light expanded in screen space, ported from the web
// stage (app/components/stage/arcs.ts).

struct Frame {
  float4x4 viewProj;
  float4x4 inverseViewProj;
  float4 camera;    // xyz position, w distance from the centre
  float4 viewport;  // width, height in pixels, pixels per point, seconds
};

struct Ground {
  float4 ocean;
  float4 land;
  float4 shore;     // rgb, alpha
  float4 border;    // rgb, alpha
  float4 rim;       // atmosphere colour, strength
  float4 space;
  float4 spread;    // least smoothing of the coast and border fields (0 on screen), texture width, height
  float4 sun;       // unit vector toward the sun, w: 1 for the photographed Earth, 0 for the night drawing
  float4 photo;     // exposure, night lights, moonlight, twilight
};

struct GroundOut {
  float4 position [[position]];
  float2 ndc;
};

vertex GroundOut groundVertex(uint id [[vertex_id]]) {
  float2 p = float2((id << 1) & 2, id & 2) * 2.0 - 1.0;
  GroundOut out;
  out.position = float4(p, 0.0, 1.0);
  out.ndc = p;
  return out;
}

// Texture coordinates whose derivatives do not jump at the antimeridian, so
// the mip level stays right along the seam.
static float4 seamless(float2 uv) {
  float2 dx = dfdx(uv), dy = dfdy(uv);
  float2 shifted = float2(fract(uv.x + 0.5) - 0.5, uv.y);
  float2 sx = dfdx(shifted), sy = dfdy(shifted);
  if (abs(sx.x) < abs(dx.x)) dx.x = sx.x;
  if (abs(sy.x) < abs(dy.x)) dy.x = sy.x;
  return float4(dx, dy);
}

// The Earth as photographed (NASA Blue Marble by day, Black Marble by night),
// lit by the sun where it really is: day, twilight and night with the cities'
// lights, haze at the edge on the sunlit side, the sun's glint on open water.
// Lighting happens in linear light; the result is encoded back for the screen.
static float3 photographed(float3 n, float3 view, float landShare, float2 uv, float4 grad,
                           constant Ground &look, texture2d<float> day, texture2d<float> night, sampler s) {
  float3 sun = look.sun.xyz;
  float3 albedo = day.sample(s, uv, gradient2d(grad.xy, grad.zw)).rgb;
  float glow = night.sample(s, uv, gradient2d(grad.xy, grad.zw)).r;
  // The night map also holds a faint ground (ice sheets near 0.2, deserts
  // near 0.12); only what is brighter than that is a light.
  glow = pow(saturate((glow - 0.21) / 0.79), 2.0);
  float mu = dot(n, sun);
  // Lambert with a soft terminator; light from a low sun is warmer, as it
  // comes through more air.
  float lit = saturate(mu);
  float dayside = smoothstep(-0.08, 0.10, mu);
  float3 sunlight = mix(float3(1.0, 0.66, 0.42), float3(1.0), smoothstep(0.0, 0.3, mu));
  float3 color = albedo * sunlight * (look.photo.x * pow(lit, 0.8)) * dayside;
  // Open water catches the sun.
  float3 h = normalize(sun + view);
  float nh = saturate(dot(n, h));
  float glint = pow(nh, 120.0) * 0.5 + pow(nh, 14.0) * 0.035;
  color += float3(1.0, 0.95, 0.86) * glint * (1.0 - landShare) * lit;
  // Night: the land faintly by moonlight, the cities by their own light.
  float nightside = 1.0 - smoothstep(-0.12, 0.08, mu);
  color += albedo * look.photo.z * float3(0.6, 0.72, 1.0) * nightside;
  color += float3(1.0, 0.70, 0.40) * glow * look.photo.y * nightside;
  // Just past the terminator the sky still glows a little.
  color += float3(1.0, 0.5, 0.25) * exp(-(mu + 0.03) * (mu + 0.03) / 0.0008) * look.photo.w * 0.04;
  // Haze toward the edge of the disc, blue where the sun reaches it.
  float facing = saturate(dot(n, view));
  float edge = pow(1.0 - facing, 2.8);
  float air = saturate(mu * 1.6 + 0.2);
  color = mix(color, float3(0.25, 0.48, 1.0) * look.photo.x * 0.35 * air, edge * 0.8 * air);
  return color;
}

// Highlights roll off instead of clipping, so snow and cloud keep their
// shape, while shadows pass through untouched; then encoded for the screen.
static float3 toScreen(float3 x) {
  float3 mapped = 1.0 - exp(-max(x, 0.0));
  return pow(mapped, float3(1.0 / 2.2));
}

fragment float4 groundFragment(GroundOut in [[stage_in]],
                               constant Frame &frame [[buffer(0)]],
                               constant Ground &look [[buffer(1)]],
                               texture2d<float> fields [[texture(0)]],
                               texture2d<float> day [[texture(1)]],
                               texture2d<float> night [[texture(2)]],
                               sampler fieldSampler [[sampler(0)]]) {
  float4 near = frame.inverseViewProj * float4(in.ndc, 0.0, 1.0);
  float4 far = frame.inverseViewProj * float4(in.ndc, 1.0, 1.0);
  float3 origin = near.xyz / near.w;
  float3 dir = normalize(far.xyz / far.w - origin);
  float b = dot(origin, dir);
  float c = dot(origin, origin) - 1.0;
  float disc = b * b - c;
  // Closest the line of sight comes to the centre, in globe radii.
  float closest = length(origin - dir * b);
  if (disc < 0.0 || -b - sqrt(max(disc, 0.0)) < 0.0) {
    // Air around the globe: a thin glow that thins out with height.
    float h = max(closest - 1.0, 0.0);
    if (look.sun.w > 0.5) {
      // Lit like the air it is: bright over the day side, gone over the night.
      float3 limb = normalize(origin - dir * b);
      float air = saturate(dot(limb, look.sun.xyz) * 1.5 + 0.15);
      float glow = (exp(-h * 28.0) * 0.7 + exp(-h * 12.0) * 0.04) * air;
      float3 space = pow(look.space.rgb, float3(2.2));
      return float4(toScreen(space + float3(0.25, 0.48, 1.0) * glow * look.photo.x * 0.35), 1.0);
    }
    float glow = exp(-h * 16.0) * look.rim.w + exp(-h * 4.0) * look.rim.w * 0.25;
    return float4(mix(look.space.rgb, look.rim.rgb, saturate(glow)), 1.0);
  }
  float3 n = normalize(origin + dir * (-b - sqrt(disc)));
  float lng = atan2(n.x, n.z), lat = asin(clamp(n.y, -1.0, 1.0));
  float2 uv = float2(lng / (2.0 * M_PI_F) + 0.5, 0.5 - lat / M_PI_F);
  float4 grad = seamless(uv);
  float2 field = fields.sample(fieldSampler, uv, gradient2d(grad.xy, grad.zw)).rg;

  // Shore at 0.5 in the coast field; one screen pixel wide whatever the zoom.
  float coast = field.r - 0.5;
  // A still printed close in can magnify the field past its texels, where its
  // contours turn to steps: the land's edge is then smoothed over a texel and
  // the drawn lines fade, so the coast reads soft instead of stepped.
  float px = max(fwidth(field.r), 1e-4);
  float aa = max(px, look.spread.x);
  float crisp = look.spread.x > 0.0 ? saturate(px / look.spread.x) : 1.0;
  float landShare = smoothstep(-aa, aa, coast);
  if (look.sun.w > 0.5) {
    float3 view = normalize(frame.camera.xyz - n);
    float3 color = toScreen(photographed(n, view, landShare, uv, grad, look, day, night, fieldSampler));
    // By night the land is gone but for its lights; the coast stays as a
    // faint trace, so the dark side still reads as a map.
    float dark = 1.0 - smoothstep(-0.10, 0.04, dot(n, look.sun.xyz));
    float shoreLine = 1.0 - smoothstep(0.0, px * 1.4, abs(coast));
    color += float3(0.55, 0.66, 0.9) * 0.16 * shoreLine * dark;
    // Borders as the faintest hairline, so a country still has its shape up close.
    float borderAA = max(fwidth(field.g), 1e-4);
    float borderLine = (1.0 - smoothstep(0.0, borderAA * 1.6, field.g)) * landShare;
    color += float3(1.0) * look.border.a * borderLine;
    return float4(color, 1.0);
  }
  float3 color = mix(look.ocean.rgb, look.land.rgb, landShare);
  float shoreLine = (1.0 - smoothstep(0.0, max(px * 1.4, look.spread.x * 0.6), abs(coast))) * mix(0.55, 1.0, crisp);
  // A faint wash of light just off the shore, like shallow water.
  float shallow = (1.0 - landShare) * exp(-abs(coast) * 18.0) * 0.35;
  color += look.shore.rgb * look.shore.a * (shoreLine + shallow);

  float borderAA = max(fwidth(field.g), 1e-4);
  float borderLine = (1.0 - smoothstep(0.0, borderAA * 1.6, field.g)) * landShare * (look.spread.y > 0.0 ? saturate(borderAA / look.spread.y) : 1.0);
  color += look.border.rgb * look.border.a * borderLine;

  // Lit from the camera: full at the centre of the disc, quieter toward the edge.
  float facing = saturate(dot(n, normalize(frame.camera.xyz - n)));
  color *= mix(0.42, 1.0, pow(facing, 0.6));
  // The edge of the disc catches the air.
  float edge = pow(1.0 - facing, 3.0);
  color = mix(color, look.rim.rgb, edge * look.rim.w * 0.8);
  return float4(color, 1.0);
}

// MARK: Flights

struct ArcVertex {
  float3 position;
  float3 previous;
  float3 next;
  float2 ts;        // place along the arc 0…1, side −1…1
  float4 color;     // rgb, alpha
  float4 style;     // core width (points), pulse phase, pulse period (s), unused
  float4 timing;    // reveal delay, reveal span, plan (share flown; 1 = flown), dashes
};

struct ArcLook {
  float alpha;
  float glow;       // halo reach in points
  float glowGain;
  float additive;
  float pulse;
  float reveal;     // 0…1 across the reveal
  float limb;
  float widthScale;
  float directed;
  float clock;      // seconds, for pulses and the aircraft's point
  float shade;      // share of the halo that darkens what is under it instead of lighting it
  float padding;
};

struct ArcOut {
  float4 position [[position]];
  float4 color;
  float t;
  float edge;
  float core;
  float visible;
  float2 motion;
  float4 timing;
};

// The camera sees a point unless the sphere sits between them.
static float visibleFrom(float3 camera, float3 p) {
  float3 d = p - camera;
  float a = dot(d, d);
  float b = dot(camera, d);
  float c = dot(camera, camera) - 1.0;
  float disc = b * b - a * c;
  if (disc <= 0.0) return 1.0;
  float s = (-b - sqrt(disc)) / a;
  return smoothstep(0.972, 0.998, s);
}

static float2 toScreen(float4 clip, float2 viewport) { return clip.xy / clip.w * 0.5 * viewport; }

vertex ArcOut arcVertex(uint id [[vertex_id]],
                        const device ArcVertex *vertices [[buffer(0)]],
                        constant Frame &frame [[buffer(1)]],
                        constant ArcLook &look [[buffer(2)]]) {
  ArcVertex v = vertices[id];
  float2 viewport = frame.viewport.xy;
  float scale = frame.viewport.z;
  float4 clip = frame.viewProj * float4(v.position, 1.0);
  float2 here = toScreen(clip, viewport);
  float2 d0 = here - toScreen(frame.viewProj * float4(v.previous, 1.0), viewport);
  float2 d1 = toScreen(frame.viewProj * float4(v.next, 1.0), viewport) - here;
  float2 dir = float2(0.0);
  if (dot(d0, d0) > 1e-6) dir += normalize(d0);
  if (dot(d1, d1) > 1e-6) dir += normalize(d1);
  dir = dot(dir, dir) > 1e-8 ? normalize(dir) : float2(1.0, 0.0);
  float2 normal = float2(-dir.y, dir.x);
  float core = v.style.x * look.widthScale * 0.5 * scale;
  float halfWidth = core + (look.glow + 1.0) * scale;
  clip.xy += normal * (v.ts.y * halfWidth) / (0.5 * viewport) * clip.w;
  clip.z = 0.0;

  float3 camera = frame.camera.xyz;
  float3 sight = normalize(-camera);
  float along = dot(v.position - camera, sight);
  float across = length((v.position - camera) - along * sight);
  float outline = (across / along) * sqrt(max(dot(camera, camera) - 1.0, 1e-4));
  float limb = (1.0 - smoothstep(0.97, 1.03, outline)) * mix(1.0 - 0.55 * look.limb, 1.0, 1.0 - smoothstep(0.7, 0.97, outline));

  ArcOut out;
  out.position = clip;
  out.color = v.color;
  out.t = v.ts.x;
  out.edge = v.ts.y * halfWidth;
  out.core = core;
  out.visible = visibleFrom(camera, v.position) * limb;
  out.motion = v.style.yz;
  out.timing = v.timing;
  return out;
}

constant float PULSE_DUTY = 0.3;

fragment float4 arcFragment(ArcOut in [[stage_in]],
                            constant Frame &frame [[buffer(1)]],
                            constant ArcLook &look [[buffer(2)]]) {
  float scale = frame.viewport.z;
  float local = clamp((look.reveal - in.timing.x) / max(in.timing.y, 1e-4), 0.0, 1.0);
  if (in.t > local) discard_fragment();
  float d = abs(in.edge);
  float core = 1.0 - smoothstep(in.core - 0.5 * scale, in.core + 0.7 * scale, d);
  float sigma = max(look.glow * scale * 0.42, 1e-3);
  float halo = exp(-(d * d) / (2.0 * sigma * sigma)) * look.glowGain;
  float strength = look.alpha * in.color.a * in.visible;
  if (look.directed > 0.5) strength *= mix(0.38, 1.0, in.t);
  // Quieter right at the airports, where every arc from a hub meets.
  strength *= mix(0.22, 1.0, smoothstep(0.0, 0.1, min(in.t, 1.0 - in.t)));

  // Ahead of the aircraft the route is still a plan: dashed, a little quieter.
  float plan = in.timing.z, dashes = in.timing.w;
  float dash = 1.0;
  if (plan < 0.999 && in.t > plan) {
    float along = (in.t - plan) * dashes;
    float f = fract(along);
    float daa = max(fwidth(along) * 1.2, 1e-3);
    dash = smoothstep(0.0, daa, f) * (1.0 - smoothstep(0.52 - daa, 0.52, f));
    strength *= 0.82 * dash;
  }
  // A flight in the air: a point of light where it is now.
  float here = 0.0;
  if (plan > 0.0 && plan < 0.999) {
    float k = (in.t - plan) * dashes * 2.4;
    here = exp(-k * k) * (0.85 + 0.15 * sin(look.clock * 2.4));
  }
  float flash = local < 1.0 ? exp(-(local - in.t) * 36.0) : 0.0;
  float pulse = 0.0;
  if (look.pulse > 0.0 && in.motion.y > 0.0) {
    float head = fract(look.clock / in.motion.y + in.motion.x) / PULSE_DUTY;
    float behind = head - in.t;
    if (behind >= 0.0 && head < 1.2) pulse = exp(-behind * 26.0) * (1.0 - smoothstep(1.0, 1.2, head)) * smoothstep(0.0, 0.08, head) * look.pulse;
  }
  float light = max(max(flash, pulse) * dash, here);
  float alpha = strength * (core + halo) + light * in.visible * min(look.alpha * 1.6, 1.0) * (core + halo * 2.2);
  alpha = clamp(alpha, 0.0, 1.0);
  float whiten = max(flash * 0.6, pulse * pulse * 0.55);
  float3 color = mix(in.color.rgb * (1.0 + 0.35 * pulse), float3(1.0), clamp(whiten, 0.0, 1.0));
  // Mostly added to what is under it, like light, so overlaps brighten. On a
  // sunlit photograph part of the halo darkens instead, a casing that keeps
  // the line apart from bright ground.
  float shaded = clamp(strength * halo, 0.0, 1.0) * look.shade;
  return float4(color * (alpha - shaded), alpha * (1.0 - look.additive) + shaded * look.additive);
}

// MARK: Light

// Arcs add their light into a float buffer; here it is laid over the ground.
// The brightest channel is eased toward one and the others follow in
// proportion, so where dozens of arcs meet the light saturates in the arcs'
// own colour instead of burning white.
fragment float4 composeFragment(GroundOut in [[stage_in]], texture2d<float> light [[texture(0)]]) {
  float4 a = light.read(uint2(in.position.xy));
  float peak = max(max(a.r, a.g), a.b);
  float3 rgb = peak > 1e-5 ? a.rgb * ((1.0 - exp(-peak * 1.3)) / peak) : float3(0.0);
  return float4(rgb, 1.0 - exp(-a.a));
}

// MARK: Airports

struct DotVertex {
  float3 position;
  float4 color;
  float4 style;     // radius in points, softness (0 a disc, 1 a glow), unused, unused
};

struct DotOut {
  float4 position [[position]];
  float4 color;
  float2 corner;
  float radius;
  float visible;
  float soft;
};

vertex DotOut dotVertex(uint id [[vertex_id]], uint instance [[instance_id]],
                        const device DotVertex *dots [[buffer(0)]],
                        constant Frame &frame [[buffer(1)]]) {
  DotVertex dot = dots[instance];
  float2 corner = float2((id & 1) ? 1.0 : -1.0, (id & 2) ? 1.0 : -1.0);
  float4 clip = frame.viewProj * float4(dot.position, 1.0);
  float radius = (dot.style.x * (1.0 + 2.0 * dot.style.y) + 1.5) * frame.viewport.z;
  clip.xy += corner * radius / (0.5 * frame.viewport.xy) * clip.w;
  clip.z = 0.0;
  DotOut out;
  out.position = clip;
  out.color = dot.color;
  out.corner = corner * radius;
  out.radius = dot.style.x * frame.viewport.z;
  out.visible = visibleFrom(frame.camera.xyz, dot.position * 1.001);
  out.soft = dot.style.y;
  return out;
}

fragment float4 dotFragment(DotOut in [[stage_in]]) {
  float d = length(in.corner);
  float fill = 1.0 - smoothstep(in.radius - 0.75, in.radius + 0.75, d);
  // A light: a bright core and a falloff three times as wide.
  float glow = exp(-d * d / max(in.radius * in.radius * 2.2, 0.5));
  float alpha = mix(fill, glow, in.soft) * in.color.a * in.visible;
  return float4(in.color.rgb * alpha, alpha);
}
