"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, LngLat as MapLngLat, Map as MapLibreMap, PointLike, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Minus, Plus, Globe2 } from "lucide-react";
import { useStage, type Camera, type Inset } from "./StageContext";
import { swap } from "../shell/navigation";
import { ArcLayer, liftOf, type Arc } from "./arcs";
import { EarthLayer } from "./earth";
import { useLocale } from "../LocaleProvider";
import { formatDay, formatNumber, ui } from "../../lib/copy";
import { BASEMAP_MAX_ZOOM, BASEMAP_PROTOCOL, loadBasemapTile } from "../../lib/basemap";
import { airportFeatures, bowsOf, sideOf } from "../../lib/network";
import { palette, toneColor } from "../../lib/palette";
import { angularDistance, centroid, enclosingCap, type LngLat } from "../../lib/geo";
import { airportsIn, cityOf, coordinatesOf, metroOf } from "../../lib/places";
import type { Flight } from "../../lib/data";
import { useArchive, useClock } from "../ArchiveProvider";
import { hasLanded, isAirborne, progressOf } from "../../lib/plan";
import styles from "./MapStage.module.css";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Parallels and meridians every 15°, drawn in short steps so they follow the sphere.
function graticule(): GeoJSON.FeatureCollection {
  const lines: GeoJSON.Position[][] = [];
  for (let lon = -180; lon < 180; lon += 15) lines.push(Array.from({ length: 77 }, (_, step) => [lon, -76 + step * 2]));
  for (let lat = -75; lat <= 75; lat += 15) lines.push(Array.from({ length: 181 }, (_, step) => [-180 + step * 2, lat]));
  return { type: "FeatureCollection", features: lines.map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } })) };
}

let protocolRegistered = false;

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.34, 4, 0.2, 6, 0] },
    light: { anchor: "viewport", position: [1.5, 0, 0], intensity: 0.15 },
    sources: {
      basemap: { type: "vector", tiles: [`${BASEMAP_PROTOCOL}://{z}/{x}/{y}`], minzoom: 0, maxzoom: BASEMAP_MAX_ZOOM },
      graticule: { type: "geojson", data: graticule() },
      airports: { type: "geojson", data: EMPTY },
      "focus-airports": { type: "geojson", data: EMPTY },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": palette.ocean } },
      // The outline is the coastline, a hairline drawn with the fill itself.
      { id: "land", type: "fill", source: "basemap", "source-layer": "land", paint: { "fill-color": palette.land, "fill-antialias": true, "fill-outline-color": palette.coast } },
      { id: "graticule", type: "line", source: "graticule", paint: { "line-color": palette.graticule, "line-width": 0.6 } },
      // Over the photographed Earth the coast is a faint trace, so the night side still reads as a map.
      { id: "coast", type: "line", source: "basemap", "source-layer": "land", layout: { visibility: "none" }, paint: { "line-color": palette.photoCoast, "line-width": 0.6 } },
      { id: "boundary", type: "line", source: "basemap", "source-layer": "boundary", paint: { "line-color": palette.border, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 6, 1] } },
      // A soft light around each airport, under its point.
      {
        id: "airports-glow", type: "circle", source: "airports",
        paint: {
          "circle-color": palette.airport,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["match", ["get", "tier"], 1, 5, 2, 7, 10], 6, ["match", ["get", "tier"], 1, 9, 2, 12, 16]],
          "circle-blur": 1,
          "circle-opacity": 0.1,
          "circle-opacity-transition": { duration: 320, delay: 0 },
          "circle-pitch-alignment": "map",
        },
      },
      {
        id: "airports", type: "circle", source: "airports",
        paint: {
          "circle-color": palette.airport,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["match", ["get", "tier"], 1, 1.6, 2, 2.2, 3.2], 6, ["match", ["get", "tier"], 1, 3, 2, 4, 5.5]],
          "circle-stroke-color": palette.airportStroke,
          "circle-stroke-width": 1,
          "circle-opacity": 0.92,
          "circle-stroke-opacity": 0.92,
          "circle-opacity-transition": { duration: 320, delay: 0 },
          "circle-stroke-opacity-transition": { duration: 320, delay: 0 },
          "circle-pitch-alignment": "map",
        },
      },
      {
        id: "focus-airports", type: "circle", source: "focus-airports",
        paint: {
          "circle-color": palette.airport,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["match", ["get", "tier"], 1, 2.2, 2, 2.8, 3.8], 6, ["match", ["get", "tier"], 1, 3.8, 2, 4.8, 6.2]],
          "circle-stroke-color": palette.airportStroke,
          "circle-stroke-width": 1.4,
          "circle-pitch-alignment": "map",
        },
      },
    ],
  };
}

// A stable pseudo-random share per key, so the network draws in the same way every time.
function scatter(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

const chronological = (a: Flight, b: Flight) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.depart < b.depart ? -1 : a.depart > b.depart ? 1 : 0;

// One arc per flight, fanned by route (see bowsOf); later flights draw on top.
// The network is fine and translucent, so a route grows brighter and wider the
// more it was flown; a lit set is drawn solid over it.
type PlanOf = (flight: Flight) => number;

function flightArcs(list: Flight[], lit: boolean, colorOf: (flight: Flight) => string, planOf?: PlanOf): Arc[] {
  const bows = bowsOf(list);
  // Arcs add up like light; a route flown dozens of times would burn white,
  // so each of its arcs is a little dimmer and the route still reads brightest.
  const routes = new Map<string, number>();
  const routeOf = (flight: Flight) => [metroOf(flight.origin), metroOf(flight.destination)].sort().join("|");
  for (const flight of list) routes.set(routeOf(flight), (routes.get(routeOf(flight)) ?? 0) + 1);
  return [...list].sort(chronological).map((flight) => {
    const key = `flight:${flight.id}`;
    const damp = Math.pow(routes.get(routeOf(flight)) ?? 1, lit ? -0.25 : -0.42);
    return {
      key,
      from: coordinatesOf(flight.origin),
      to: coordinatesOf(flight.destination),
      bow: bows.get(flight.id)!,
      color: colorOf(flight),
      width: lit ? 1.25 : 0.7,
      alpha: (lit ? 0.95 : 0.62) * damp,
      delay: scatter(key) * (lit ? 0.25 : 0.55),
      span: lit ? 0.75 : 0.45,
      plan: planOf?.(flight),
    };
  });
}

// Halfway to white: one arc lifted out of a fan of its own colour.
function lighten(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * 0.5).toString(16).padStart(2, "0");
  return `#${mix(value >> 16)}${mix((value >> 8) & 255)}${mix(value & 255)}`;
}

// A trip or a flight: each leg in its own direction, drawn in travel order.
function legArcs(list: Flight[], colorOf: (flight: Flight) => string, planOf?: PlanOf, width = 2.3): Arc[] {
  const ordered = [...list].sort(chronological);
  const bows = bowsOf(ordered);
  return ordered.map((flight, index) => ({
    key: `flight:${flight.id}`,
    from: coordinatesOf(flight.origin),
    to: coordinatesOf(flight.destination),
    bow: bows.get(flight.id)!,
    color: colorOf(flight),
    width,
    alpha: 1,
    delay: index / ordered.length,
    span: 1 / ordered.length,
    plan: planOf?.(flight),
  }));
}

// MapLibre's camera stands 1.5 screen heights from the point it looks at (a
// 36.87° field of view), so the globe's outline is smaller than its radius and
// places away from the centre are drawn smaller. Sizes here are what is seen.
const cameraDistance = (height: number) => 1.5 * height;
const zoomFor = (radius: number, latitude: number) => Math.log2((radius * 2 * Math.PI * Math.cos((latitude * Math.PI) / 180)) / 512);

function visibleFrame(width: number, height: number, inset: Inset) {
  return { w: Math.max(160, width - inset.left - inset.right), h: Math.max(160, height - inset.top - inset.bottom) };
}

// The zoom at which the globe's outline is a circle of the given radius.
function outlineZoom(outline: number, height: number, latitude: number) {
  const d = cameraDistance(height);
  return zoomFor((outline * outline + outline * Math.hypot(outline, d)) / d, latitude);
}

function worldZoom(width: number, height: number, inset: Inset, latitude: number) {
  const { w, h } = visibleFrame(width, height, inset);
  return outlineZoom(Math.max(110, Math.min(w, h) * (width < 600 ? 0.47 : 0.45)), height, latitude);
}

// The zoom at which everything within `angle` of the centre lies within
// `reach` pixels of it, or null when no zoom brings that much into view. A
// wide cap's edge can pass behind the horizon, where the formula still has a
// solution but the globe's outline, not the edge, is what reaches out.
function capZoom(angle: number, reach: number, height: number, latitude: number) {
  const d = cameraDistance(height);
  const room = d * Math.sin(angle) - reach * (1 - Math.cos(angle));
  if (room <= 0) return null;
  const radius = (reach * d) / room;
  return Math.cos(angle) > radius / (radius + d) ? zoomFor(radius, latitude) : null;
}

function weightedCenter(list: Flight[]): LngLat {
  const points: LngLat[] = [];
  for (const flight of list) { points.push(coordinatesOf(flight.origin), coordinatesOf(flight.destination)); }
  const [lng, lat] = centroid(points);
  // Keep the globe upright and readable: no pole-on views.
  return [lng, Math.max(-25, Math.min(38, lat))];
}

type LabelState = { element: HTMLSpanElement; code: string; lngLat: LngLat; narrow: number; wide: number; priority: number };
type Box = [number, number, number, number];
type Target = { kind: "airport"; code: string } | { kind: "arc"; arc: Arc };

// Right of the dot first, as on a printed chart; then left, above, below.
const LABEL_H = 18, LABEL_GAP = 7;
const candidates = (x: number, y: number, w: number): { box: Box; side: string }[] => [
  { side: "right", box: [x + LABEL_GAP, y - LABEL_H / 2, x + LABEL_GAP + w, y + LABEL_H / 2] },
  { side: "left", box: [x - LABEL_GAP - w, y - LABEL_H / 2, x - LABEL_GAP, y + LABEL_H / 2] },
  { side: "above", box: [x - w / 2, y - LABEL_H - 4, x + w / 2, y - 4] },
  { side: "below", box: [x - w / 2, y + 4, x + w / 2, y + LABEL_H + 4] },
];

export default function MapStage() {
  const { scene, preview, inset } = useStage();
  const { locale } = useLocale();
  const text = ui[locale].stage;
  const mapText = ui[locale].map;
  const host = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const arcsRef = useRef<ArcLayer | null>(null);
  const earthRef = useRef<EarthLayer | null>(null);
  const labels = useRef(new Map<string, LabelState>());
  const placeLabels = useRef<() => void>(() => {});
  const lastCameraKey = useRef<string | null>(null);
  // Whether the reader has turned or zoomed the globe since the scene last framed it.
  const userMoved = useRef(false);
  const insetRef = useRef(inset);
  const sceneRef = useRef(scene);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  const tooltip = useRef<HTMLDivElement>(null);
  // Map handlers are bound once; they read the current scene through this ref.
  const interact = useRef<{ hover: (target: Target | null, point?: { x: number; y: number }) => void; open: (target: Target) => void }>({ hover: () => {}, open: () => {} });

  const base = scene?.flights ?? null;
  // The flight arc under the pointer, lit over the rest.
  const [pointed, setPointed] = useState<Arc | null>(null);
  const [pointedScene, setPointedScene] = useState(scene);
  if (pointedScene !== scene) { setPointedScene(scene); setPointed(null); }
  const directed = !!scene?.directed;
  // The reader's routes in their own tone; a page about two people names the rest.
  const { owner, all: archive, ahead, landedBy } = useArchive();
  // Flights still ahead draw as plans. Only one in the air moves with the
  // clock; otherwise the drawing changes when a flight lands.
  const clock = useClock();
  const live = ahead.some((flight) => isAirborne(flight, clock.now));
  const planNow = live ? clock.now : null;
  const planOf = useCallback((flight: Flight) => planNow === null ? (hasLanded(flight, landedBy) ? 1 : 0) : progressOf(flight, planNow), [planNow, landedBy]);
  const sceneColors = scene?.colors;
  const colorOf = useCallback((flight: Flight) => {
    const side = sideOf(flight);
    return sceneColors?.[side] ?? (side === "both" ? palette.together : toneColor(owner.tone));
  }, [sceneColors, owner.tone]);
  // In a directed scene (a trip) a previewed leg is lit inside the whole trip, not alone.
  const focus = directed && scene?.focus ? scene.focus : preview ?? scene?.focus ?? null;
  const highlight = directed && preview ? preview : null;
  // Earlier pinned codes win label space: a trip lists its destination first.
  const pinned = useMemo(() => new Map((scene?.pinned ?? []).map((code, index, all) => [code, all.length - index])), [scene?.pinned]);
  const focusAirports = useMemo(() => focus ? new Set(airportsIn(focus).keys()) : null, [focus]);
  useEffect(() => { insetRef.current = inset; sceneRef.current = scene; });

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [maplibre, worker] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?url")]);
        if (disposed || !host.current) return;
        maplibre.setWorkerUrl(worker.default);
        if (!protocolRegistered) {
          maplibre.addProtocol(BASEMAP_PROTOCOL, (params) => loadBasemapTile(params.url));
          protocolRegistered = true;
        }
        const { clientWidth, clientHeight } = host.current;
        const map = new maplibre.Map({
          container: host.current,
          style: buildStyle(),
          center: [112, 24],
          zoom: worldZoom(clientWidth, clientHeight, insetRef.current, 24),
          minZoom: 0.6,
          maxZoom: 9,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxPitch: 0,
          fadeDuration: 0,
          canvasContextAttributes: { antialias: true },
        });
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.setPadding(insetRef.current);
        mapRef.current = map;
        map.on("load", () => {
          if (disposed) return;
          const layer = new ArcLayer();
          map.addLayer(layer, "airports");
          arcsRef.current = layer;
          setReady(true);
          // The photographed Earth replaces the drawn one once its maps have
          // loaded; until then, without WebGL 2, or if it fails, the drawn globe stays.
          try {
            const earth = new EarthLayer(() => {
              if (disposed) return;
              map.setLayoutProperty("graticule", "visibility", "none");
              map.setLayoutProperty("coast", "visibility", "visible");
            });
            map.addLayer(earth, "graticule");
            earthRef.current = earth;
          } catch {
            earthRef.current = null;
          }
        });
        map.on("move", () => placeLabels.current());
        map.on("resize", () => placeLabels.current());
        const pick = (point: { x: number; y: number }, pad: number): Target | null => {
          const box: [PointLike, PointLike] = [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]];
          const airport = map.queryRenderedFeatures(box, { layers: ["focus-airports", "airports"] })[0];
          if (airport) return { kind: "airport", code: String(airport.properties.code) };
          const hit = arcsRef.current?.pick(point.x, point.y, pad);
          return hit ? { kind: "arc", arc: hit.arc } : null;
        };
        map.on("mousemove", (event) => interact.current.hover(pick(event.point, 5), event.point));
        map.on("mouseout", () => interact.current.hover(null));
        map.on("dragstart", () => interact.current.hover(null));
        // Only the reader's own gestures carry an original event.
        map.on("movestart", (event) => { if ((event as { originalEvent?: Event }).originalEvent) userMoved.current = true; });
        map.on("click", (event) => {
          const coarse = window.matchMedia("(pointer: coarse)").matches;
          const target = pick(event.point, coarse ? 14 : 6);
          if (target) interact.current.open(target);
        });
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    if (host.current) observer.observe(host.current);
    return () => {
      disposed = true;
      observer.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      arcsRef.current = null;
      earthRef.current = null;
    };
  }, []);

  // Base network and airports. The first network draws in; later ones crossfade quickly.
  const shownBase = useRef(false);
  useEffect(() => {
    const map = mapRef.current, arcs = arcsRef.current;
    if (!ready || !map || !arcs || !base) return;
    arcs.set("base", flightArcs(base, false, colorOf), { reveal: shownBase.current ? 650 : 1500 });
    shownBase.current = true;
    (map.getSource("airports") as GeoJSONSource).setData(airportFeatures(base));
  }, [ready, base, colorOf]);

  // Focus: the subset is drawn in bright and the base recedes.
  useEffect(() => {
    const map = mapRef.current, arcs = arcsRef.current;
    if (!ready || !map || !arcs) return;
    if (focus && directed) arcs.set("focus", legArcs(focus, colorOf, planOf), { directed: true, comet: true, reveal: Math.min(2000, 450 + 300 * focus.length) });
    // Lit flights brighten toward where they landed, so each side of a route's fan shows its direction.
    else if (focus) arcs.set("focus", flightArcs(focus, true, colorOf, planOf), { directed: true, reveal: 620 });
    else arcs.set("focus", []);
    // Every flight is drawn, so the context recedes further than a route map's would.
    arcs.fade("base", focus ? 0.12 : 1);
    (map.getSource("focus-airports") as GeoJSONSource).setData(focus ? airportFeatures(focus) : EMPTY);
    map.setPaintProperty("airports", "circle-opacity", focus ? 0.3 : 0.92);
    map.setPaintProperty("airports-glow", "circle-opacity", focus ? 0.03 : 0.1);
    map.setPaintProperty("airports", "circle-stroke-opacity", focus ? 0.3 : 0.92);
  }, [ready, focus, directed, colorOf, planOf]);

  // One leg of a trip previewed from the list, or the flight under the
  // pointer: drawn wider over its own arc, in its direction of travel.
  useEffect(() => {
    const arcs = arcsRef.current;
    if (!ready || !arcs) return;
    const keys = highlight ? new Set(highlight.map((flight) => `flight:${flight.id}`)) : null;
    const lit = keys ? arcs.find("focus", keys) : pointed ? [pointed] : [];
    arcs.set("hover", lit.map((arc) => ({ ...arc, color: lighten(arc.color), width: Math.max(arc.width + 1.2, 2.6), alpha: 1, delay: 0, span: 1 })), { directed: true });
    arcs.fade("focus", highlight ? 0.42 : 1, 200);
  }, [ready, highlight, pointed]);

  // A flight in the air: a point where it is now, kept on its arc as the globe moves.
  const marker = useRef<HTMLSpanElement>(null);
  const airborne = useMemo(() => planNow === null ? null : (focus ?? []).find((flight) => isAirborne(flight, planNow)) ?? null, [focus, planNow]);
  useEffect(() => {
    const map = mapRef.current, arcs = arcsRef.current, element = marker.current;
    if (!ready || !map || !arcs || !element) return;
    if (!airborne || planNow === null) { element.dataset.visible = "false"; return; }
    const key = `flight:${airborne.id}`, share = progressOf(airborne, planNow);
    const place = () => {
      const point = arcs.pointOn("focus", key, share);
      if (point) element.style.transform = `translate3d(${point[0].toFixed(1)}px, ${point[1].toFixed(1)}px, 0)`;
      element.dataset.visible = point ? "true" : "false";
    };
    map.on("render", place);
    place();
    return () => { map.off("render", place); };
  }, [ready, airborne, planNow]);

  // The sun where it is now, or where it stood when the flight in view took off.
  useEffect(() => {
    const earth = earthRef.current;
    if (!ready || !earth) return;
    earth.setSun(scene?.sunAt ?? null);
    if (scene?.sunAt != null) return;
    const timer = window.setInterval(() => mapRef.current?.triggerRepaint(), 60_000);
    return () => window.clearInterval(timer);
  }, [ready, scene?.sunAt]);

  // Camera follows the scene, once per cameraKey.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !scene || lastCameraKey.current === scene.cameraKey) return;
    const first = lastCameraKey.current === null;
    lastCameraKey.current = scene.cameraKey;
    userMoved.current = false;
    moveCamera(map, scene.camera, scene.flights, insetRef.current, first);
  }, [ready, scene]);

  // When the panel or sheet changes size, the globe re-centres in what is
  // left: the scene's framing again, or, once the reader has moved the globe
  // themselves, the same place and zoom in the new space.
  const lastInset = useRef(inset);
  useEffect(() => {
    const map = mapRef.current, current = sceneRef.current;
    const previous = lastInset.current;
    lastInset.current = inset;
    if (!ready || !map) return;
    const moved = Math.abs(previous.left - inset.left) + Math.abs(previous.bottom - inset.bottom) + Math.abs(previous.top - inset.top) + Math.abs(previous.right - inset.right);
    if (!moved) { map.setPadding(inset); return; }
    if (current && !userMoved.current) moveCamera(map, current.camera, current.flights, inset, false, 520);
    else map.easeTo({ padding: inset, duration: 520 });
  }, [ready, inset]);

  // Airport labels are DOM so they use the interface typeface; placement is
  // greedy by priority with collision boxes, recomputed on every camera frame.
  useEffect(() => {
    const map = mapRef.current, container = labelHost.current;
    if (!ready || !map || !container || !base) return;
    // Airports of flights still ahead are not in the base network, but a
    // route on screen always names its ends.
    const visits = airportsIn(base);
    for (const code of [...(focusAirports ?? []), ...pinned.keys()]) if (!visits.has(code)) visits.set(code, 0);
    const existing = labels.current;
    for (const [code, label] of existing) if (!visits.has(code)) { label.element.remove(); existing.delete(code); }
    for (const [code, count] of visits) {
      let label = existing.get(code);
      if (!label) {
        const element = document.createElement("span");
        element.className = styles.label;
        container.appendChild(element);
        label = { element, code, lngLat: coordinatesOf(code), narrow: 0, wide: 0, priority: 0 };
        existing.set(code, label);
      }
      label.element.innerHTML = "";
      const codeNode = document.createElement("b");
      codeNode.textContent = code;
      const cityNode = document.createElement("i");
      cityNode.textContent = cityOf(code, locale);
      label.element.append(codeNode, cityNode);
      label.priority = count;
    }
    for (const label of existing.values()) {
      label.element.dataset.wide = "true";
      label.wide = label.element.offsetWidth;
      label.narrow = (label.element.firstElementChild as HTMLElement).offsetWidth;
    }

    placeLabels.current = () => {
      const width = map.getContainer().clientWidth, height = map.getContainer().clientHeight;
      const edge = insetRef.current;
      const zoom = map.getZoom();
      const center = map.getCenter();
      const showCity = zoom >= 3.4;
      const ranked = [...existing.values()].sort((a, b) => {
        const rank = (label: LabelState) => (pinned.has(label.code) ? 2e6 + pinned.get(label.code)! * 1e4 : 0) + (focusAirports?.has(label.code) ? 1e6 : 0) + label.priority;
        return rank(b) - rank(a);
      });
      const limit = zoom < 2 ? 7 : zoom < 3 ? 14 : 40;
      let shown = 0;
      const transform = (map as unknown as { transform?: { isLocationOccluded?: (lngLat: MapLngLat) => boolean } }).transform;
      const occludedAt = (lngLat: LngLat) => transform?.isLocationOccluded
        ? transform.isLocationOccluded({ lng: lngLat[0], lat: lngLat[1] } as MapLngLat)
        : angularDistance([center.lng, center.lat], lngLat) > Math.PI * 0.47;
      const inside = (box: Box) => box[0] > edge.left + 10 && box[2] < width - edge.right - 10 && box[1] > edge.top + 6 && box[3] < height - edge.bottom - 6;
      // Emphasized dots are obstacles from the start, so no label covers a stop on the route in view.
      const placed: Box[] = [];
      for (const label of ranked) {
        if (!pinned.has(label.code) && !focusAirports?.has(label.code)) continue;
        if (occludedAt(label.lngLat)) continue;
        const point = map.project(label.lngLat);
        placed.push([point.x - 3, point.y - 3, point.x + 3, point.y + 3]);
      }
      for (const label of ranked) {
        const occluded = occludedAt(label.lngLat);
        const point = map.project(label.lngLat);
        const emphasized = pinned.has(label.code) || !!focusAirports?.has(label.code);
        const muted = !!focusAirports && !emphasized;
        const wide = showCity || emphasized;
        const w = wide ? label.wide : label.narrow;
        let chosen: { box: Box; side: string } | undefined;
        if (!occluded && (shown < limit || emphasized) && !(muted && zoom < 3)) {
          chosen = candidates(point.x, point.y, w).find(({ box }) =>
            inside(box) && !placed.some((other) => box[0] < other[2] + 4 && box[2] + 4 > other[0] && box[1] < other[3] + 1 && box[3] + 1 > other[1]));
        }
        if (chosen) {
          placed.push(chosen.box);
          if (!emphasized) placed.push([point.x - 3, point.y - 3, point.x + 3, point.y + 3]);
          shown++;
          label.element.style.transform = `translate3d(${Math.round(chosen.box[0])}px, ${Math.round(chosen.box[1])}px, 0)`;
          label.element.dataset.side = chosen.side;
        }
        label.element.dataset.visible = chosen ? "true" : "false";
        label.element.dataset.wide = wide ? "true" : "false";
        label.element.dataset.muted = muted ? "true" : "false";
      }
    };
    placeLabels.current();
  }, [ready, base, locale, pinned, focusAirports, inset]);

  // What the pointer is over, in words, and where a click on it leads.
  const routeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flight of base ?? []) {
      const key = [metroOf(flight.origin), metroOf(flight.destination)].sort().join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [base]);
  const visits = useMemo(() => airportsIn(base ?? []), [base]);
  // Anything drawn can be described; only the reader's own flights open a page.
  const byId = useMemo(() => new Map([...(base ?? []), ...(scene?.focus ?? []), ...(preview ?? [])].map((flight) => [flight.id, flight])), [base, scene?.focus, preview]);
  const own = useMemo(() => new Set(archive.map((flight) => flight.id)), [archive]);
  const readOnly = !!scene?.readOnly;
  useEffect(() => {
    const n = (value: number) => formatNumber(value, locale);
    const flightOf = (target: Target) => target.kind === "arc" ? byId.get(target.arc.key.slice("flight:".length)) ?? null : null;
    // Flight numbers are typed by readers and city names can come from the
    // model, so every value is escaped before it becomes markup.
    const esc = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
    const describe = (target: Target) => {
      if (target.kind === "airport") return `<b>${esc(target.code)}</b> ${esc(cityOf(target.code, locale))}<span>${esc(mapText.flights(n(visits.get(target.code) ?? 0)))}</span>`;
      const flight = flightOf(target);
      if (!flight) return "";
      const route = routeCounts.get([metroOf(flight.origin), metroOf(flight.destination)].sort().join("|")) ?? 1;
      return `<b>${esc(flight.flight)}</b> ${esc(cityOf(flight.origin, locale))} → ${esc(cityOf(flight.destination, locale))}<span>${esc(formatDay(flight.date, locale))}</span><span>${esc(mapText.route(n(route)))}</span>`;
    };
    let last: Arc | null = null, shown = "";
    interact.current = {
      hover: (target, point) => {
        const element = tooltip.current, canvas = mapRef.current?.getCanvas();
        if (canvas) canvas.style.cursor = target ? "pointer" : "";
        const arc = target?.kind === "arc" ? target.arc : null;
        if (arc?.key !== last?.key) { last = arc; setPointed(arc); }
        if (!element) return;
        if (!target || !point || window.matchMedia("(pointer: coarse)").matches) { element.dataset.visible = "false"; return; }
        const html = describe(target);
        if (shown !== html) { element.innerHTML = html; shown = html; }
        const width = element.offsetWidth, host = element.parentElement!;
        const x = point.x + 14 + width > host.clientWidth - 8 ? point.x - 14 - width : point.x + 14;
        element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(point.y + 14)}px, 0)`;
        element.dataset.visible = "true";
      },
      // A click opens what the pointer named; a tap, which cannot pick one arc
      // out of a fan, opens the route's flights.
      open: (target) => {
        interact.current.hover(null);
        if (readOnly) return;
        // Another city picked from a city, or another flight from a flight,
        // takes the place of the page in view; anything else opens on top.
        const go = (href: string) => {
          const section = (path: string) => path.split("/")[1] ?? "";
          if (section(window.location.pathname) === section(href) && window.location.pathname.split("/").length > 2) { swap(); router.replace(href); }
          else router.push(href);
        };
        if (target.kind === "airport") { go(`/places/${encodeURIComponent(metroOf(target.code))}`); return; }
        const flight = flightOf(target);
        if (!flight || !own.has(flight.id)) return;
        if (window.matchMedia("(pointer: coarse)").matches) router.push(`/log?q=${encodeURIComponent(`${flight.origin} ${flight.destination}`)}`);
        else go(`/flights/${encodeURIComponent(flight.id)}`);
      },
    };
  }, [locale, visits, routeCounts, router, mapText, byId, own, readOnly]);

  // A previewed set that sits on the far side of the globe turns into view
  // once the pointer has rested on it; a passing hover does not move the globe.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !preview?.length || directed || prefersReducedMotion() || map.getZoom() > 3) return;
    const timer = setTimeout(() => {
      const transform = (map as unknown as { transform?: { isLocationOccluded?: (lngLat: MapLngLat) => boolean } }).transform;
      const ends = preview.flatMap((flight) => [coordinatesOf(flight.origin), coordinatesOf(flight.destination)]);
      const hidden = ends.filter((lngLat) => transform?.isLocationOccluded?.({ lng: lngLat[0], lat: lngLat[1] } as MapLngLat)).length;
      if (hidden * 2 <= ends.length) return;
      map.easeTo({ center: weightedCenter(preview), duration: 900, easing: easeOut, essential: false });
    }, 450);
    return () => clearTimeout(timer);
  }, [ready, preview, directed]);

  const zoomBy = (delta: number) => mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 2) + delta, duration: 220 });
  const reset = () => { const map = mapRef.current; if (map && scene) moveCamera(map, scene.camera, scene.flights, insetRef.current, false); };

  return (
    <div className={styles.stage} data-ready={ready ? "true" : "false"}>
      <div ref={host} className={styles.map} />
      <div ref={labelHost} className={styles.labels} aria-hidden="true">
        <span ref={marker} className={styles.aircraft} data-visible="false" />
      </div>
      <div ref={tooltip} className={styles.tooltip} data-visible="false" aria-hidden="true" />
      {failed ? <p className={styles.notice}>{text.unsupported}</p> : null}
      <div className={styles.controls}>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label={text.zoomIn} title={text.zoomIn}><Plus aria-hidden="true" /></button>
        <button type="button" onClick={() => zoomBy(-0.8)} aria-label={text.zoomOut} title={text.zoomOut}><Minus aria-hidden="true" /></button>
        <button type="button" onClick={reset} aria-label={text.reset} title={text.reset}><Globe2 aria-hidden="true" /></button>
      </div>
    </div>
  );
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function moveCamera(map: MapLibreMap, camera: Camera, flights: Flight[], inset: Inset, instant: boolean, travel = 1500) {
  const container = map.getContainer();
  const duration = instant || prefersReducedMotion() ? 0 : travel;
  const padding = inset;
  if (camera.kind === "world") {
    const center = weightedCenter(camera.around?.length ? camera.around : flights);
    const zoom = worldZoom(container.clientWidth, container.clientHeight, inset, center[1]);
    // Turning the globe in place reads better as a glide than as a fly-over.
    if (Math.abs(map.getZoom() - zoom) < 0.4) map.easeTo({ center, zoom, padding, duration: duration ? Math.min(duration, 1100) : 0, easing: easeOut, essential: false });
    else map.flyTo({ center, zoom, padding, duration, curve: 1.2, essential: false });
    return;
  }
  if (!camera.points.length) return;
  // Frame the smallest cap around the route, with room for the arcs' rise.
  const cap = enclosingCap(camera.points);
  const { w, h } = visibleFrame(container.clientWidth, container.clientHeight, inset);
  const reach = (Math.min(w, h) / 2) * 0.76 / (1 + 0.6 * liftOf(cap.radius * 2));
  const fitted = capZoom(Math.max(cap.radius, 0.002), reach, container.clientHeight, cap.center[1]);
  const center = fitted === null && camera.anchor ? camera.anchor : cap.center;
  // Zoom keeps the globe one size only for the latitude it was worked out at.
  const world = worldZoom(container.clientWidth, container.clientHeight, inset, center[1]);
  const zoom = fitted === null ? world : Math.max(world, Math.min(fitted, camera.maxZoom ?? 6.5));
  map.flyTo({ center, zoom, padding, duration, curve: 1.3, essential: false });
}

