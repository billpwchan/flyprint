import type { Flight, Side } from "./data";
import { bowedTrack, fromVector } from "./geo";
import { airportsIn, coordinatesOf, metroOf } from "./places";

export const sideOf = (flight: Flight): Side => flight.side ?? "me";

// Three steps, as in Flighty's past-flight map: once, a few times, a regular route.
export const tierOf = (count: number) => count >= 10 ? 3 : count >= 2 ? 2 : 1;

type PointFeature = GeoJSON.Feature<GeoJSON.Point, { code: string; visits: number; tier: number }>;

const SIDE_ORDER: Side[] = ["me", "both", "them"];
// Bows as a share of a route's length: the first flight of a direction, the
// gap to the next, and the widest a fan may open.
const BOW = { first: 0.07, step: 0.03, widest: 0.26 };
const chronological = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);

// Every flight is its own arc. Flights between the same two cities in the same
// direction stack outward from the route, by whose they are and then by date, so a
// route's fan is as full as it was flown; the other direction fans out on the
// other side. Airports of one city share a fan so their arcs do not cross.
export function bowsOf(list: Flight[]): Map<string, number> {
  const directions = new Map<string, Flight[]>();
  for (const flight of list) {
    const key = `${metroOf(flight.origin)}>${metroOf(flight.destination)}`;
    const group = directions.get(key);
    if (group) group.push(flight); else directions.set(key, [flight]);
  }
  const bows = new Map<string, number>();
  for (const group of directions.values()) {
    group.sort((a, b) => SIDE_ORDER.indexOf(sideOf(a)) - SIDE_ORDER.indexOf(sideOf(b)) || chronological(a, b));
    const step = group.length > 1 ? Math.min(BOW.step, (BOW.widest - BOW.first) / (group.length - 1)) : 0;
    group.forEach((flight, index) => bows.set(flight.id, BOW.first + index * step));
  }
  return bows;
}

// Each flight's bowed ground track, oldest first, for drawing outside the globe.
export function flightTracks(list: Flight[]): GeoJSON.FeatureCollection<GeoJSON.LineString, { side: Side }> {
  const bows = bowsOf(list);
  return {
    type: "FeatureCollection",
    features: [...list].sort(chronological).map((flight) => ({
      type: "Feature",
      properties: { side: sideOf(flight) },
      geometry: { type: "LineString", coordinates: bowedTrack(coordinatesOf(flight.origin), coordinatesOf(flight.destination), bows.get(flight.id) ?? BOW.first).map(fromVector) },
    })),
  };
}

export function airportFeatures(list: Flight[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: PointFeature[] = [...airportsIn(list)].map(([code, visits]) => ({
    type: "Feature",
    properties: { code, visits, tier: tierOf(visits) },
    geometry: { type: "Point", coordinates: coordinatesOf(code) },
  }));
  features.sort((x, y) => x.properties.visits - y.properties.visits);
  return { type: "FeatureCollection", features };
}

// Points along every flight's arc as drawn, fans included, so a camera
// framing them keeps the arcs on screen and not only their endpoints.
export function pathPoints(list: Flight[]): [number, number][] {
  const bows = bowsOf(list);
  const points: [number, number][] = [];
  for (const flight of list) {
    const track = bowedTrack(coordinatesOf(flight.origin), coordinatesOf(flight.destination), bows.get(flight.id) ?? BOW.first);
    for (let index = 0; index < track.length; index += Math.ceil(track.length / 12)) points.push(fromVector(track[index]));
    points.push(fromVector(track.at(-1)!));
  }
  return points;
}
