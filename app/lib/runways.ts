// A runway as the server sends it: both thresholds [lon, lat], width in
// metres, the two end names and the declared length in metres.
export type Runway = [lon1: number, lat1: number, lon2: number, lat2: number, width: number, end1: string, end2: string, length: number];

// An airport's surveyed runways, and the declared lengths of open runways
// whose ends are not surveyed (counted, never drawn).
export type AirportRunways = { runways: Runway[]; unsurveyed: number[] };
