import type { Variant } from "./profile";

// Types the side views can draw, by ICAO designator. Dimensions are the
// manufacturers' published figures in metres; span is with the type's usual
// wingtip devices. A variant's doors are listed only where its layout differs
// from its family's (fewer overwing exits, a door added by a plug).
export type Maker = "airbus" | "boeing";
export type AircraftType = {
  icao: string;
  maker: Maker;
  name: string;
  variant: Variant;
  span: number;
  height: number;
  firstFlight: string;
};

const neoA320 = { x: 10.6, len: 3.95, dia: 2.42, y: -2.3, core: 1.6, coreDia: 1.25, plug: 0.7 };
const leap1b = { x: 12.6, len: 4.05, dia: 2.1, y: -1.64, core: 1.2, coreDia: 1.1, plug: 0.5, flat: 0.05, chevrons: true };
const a321Doors = [{ x: 4.6, w: 0.81, h: 1.85, y: -0.62 }, { x: 13.2, w: 0.81, h: 1.85, y: -0.62 }, { x: 24.2, w: 0.81, h: 1.85, y: -0.62 }, { x: 36.0, w: 0.81, h: 1.85, y: -0.62 }];

const types: AircraftType[] = [
  { icao: "A319", maker: "airbus", name: "A319", span: 34.1, height: 11.76, firstFlight: "1995-08-25",
    variant: { family: "A320", length: 33.84, doors: [{ x: 4.6, w: 0.81, h: 1.85, y: -0.62 }, { x: 12.0, w: 0.5, h: 0.95, y: 0 }, { x: 25.52, w: 0.81, h: 1.85, y: -0.62 }] } },
  { icao: "A320", maker: "airbus", name: "A320", span: 34.1, height: 11.76, firstFlight: "1987-02-22", variant: { family: "A320", length: 37.57 } },
  { icao: "A321", maker: "airbus", name: "A321", span: 34.1, height: 11.76, firstFlight: "1993-03-11", variant: { family: "A320", length: 44.51, doors: a321Doors } },
  { icao: "A20N", maker: "airbus", name: "A320neo", span: 35.8, height: 11.76, firstFlight: "2014-09-25", variant: { family: "A320", length: 37.57, device: "sharklet", engine: neoA320 } },
  { icao: "A21N", maker: "airbus", name: "A321neo", span: 35.8, height: 11.76, firstFlight: "2016-02-09", variant: { family: "A320", length: 44.51, device: "sharklet", engine: neoA320, doors: a321Doors } },
  { icao: "A332", maker: "airbus", name: "A330-200", span: 60.3, height: 17.39, firstFlight: "1997-08-13", variant: { family: "A330", length: 58.82, fin: 1.07 } },
  { icao: "A333", maker: "airbus", name: "A330-300", span: 60.3, height: 16.79, firstFlight: "1992-11-02", variant: { family: "A330", length: 63.66 } },
  { icao: "A339", maker: "airbus", name: "A330-900", span: 64.0, height: 16.79, firstFlight: "2017-10-19", variant: { family: "A330", length: 63.66, device: "sharklet", engine: { x: 19.9, len: 5.9, dia: 3.45, y: -2.95, core: 2.4, coreDia: 1.9 } } },
  { icao: "A359", maker: "airbus", name: "A350-900", span: 64.75, height: 17.05, firstFlight: "2013-06-14", variant: { family: "A350", length: 66.8 } },
  { icao: "A35K", maker: "airbus", name: "A350-1000", span: 64.75, height: 17.08, firstFlight: "2016-11-24", variant: { family: "A350", length: 73.79 } },
  { icao: "B733", maker: "boeing", name: "737-300", span: 28.88, height: 11.13, firstFlight: "1984-02-24",
    variant: { family: "B737", length: 33.4, device: "none", fin: 0.8, engine: { x: 13.7, len: 3.3, dia: 1.78, y: -1.62, flat: 0.2, core: 0.9 },
      doors: [{ x: 4.45, w: 0.86, h: 1.83, y: -0.4 }, { x: 14.05, w: 0.5, h: 0.97, y: 0 }, { x: 25.73, w: 0.76, h: 1.83, y: -0.4 }] } },
  { icao: "B737", maker: "boeing", name: "737-700", span: 35.79, height: 12.55, firstFlight: "1997-02-09",
    variant: { family: "B737", length: 33.63, doors: [{ x: 4.45, w: 0.86, h: 1.83, y: -0.4 }, { x: 14.15, w: 0.5, h: 0.97, y: 0 }, { x: 25.96, w: 0.76, h: 1.83, y: -0.4 }] } },
  { icao: "B738", maker: "boeing", name: "737-800", span: 35.79, height: 12.55, firstFlight: "1997-07-31", variant: { family: "B737", length: 39.47 } },
  { icao: "B739", maker: "boeing", name: "737-900", span: 35.79, height: 12.55, firstFlight: "2000-08-03", variant: { family: "B737", length: 42.11 } },
  { icao: "B38M", maker: "boeing", name: "737 MAX 8", span: 35.92, height: 12.29, firstFlight: "2016-01-29", variant: { family: "B737", length: 39.52, device: "scimitar", engine: leap1b } },
  { icao: "B39M", maker: "boeing", name: "737 MAX 9", span: 35.92, height: 12.29, firstFlight: "2017-04-13", variant: { family: "B737", length: 42.16, device: "scimitar", engine: leap1b } },
  { icao: "B772", maker: "boeing", name: "777-200", span: 60.93, height: 18.5, firstFlight: "1994-06-12",
    variant: { family: "B777", length: 63.73, device: "none", engine: { dia: 3.95, len: 5.4, y: -2.4 },
      doors: [{ x: 6.0, w: 1.07, h: 1.95, y: -0.5 }, { x: 16.6, w: 1.07, h: 1.95, y: -0.5 }, { x: 40.9, w: 1.07, h: 1.95, y: -0.5 }, { x: 49.7, w: 1.07, h: 1.95, y: -0.5 }] } },
  { icao: "B77L", maker: "boeing", name: "777-200LR", span: 64.8, height: 18.6, firstFlight: "2005-03-08",
    variant: { family: "B777", length: 63.73,
      doors: [{ x: 6.0, w: 1.07, h: 1.95, y: -0.5 }, { x: 16.6, w: 1.07, h: 1.95, y: -0.5 }, { x: 40.9, w: 1.07, h: 1.95, y: -0.5 }, { x: 49.7, w: 1.07, h: 1.95, y: -0.5 }] } },
  { icao: "B773", maker: "boeing", name: "777-300", span: 60.93, height: 18.5, firstFlight: "1997-10-16", variant: { family: "B777", length: 73.86, device: "none", engine: { dia: 3.95, len: 5.4, y: -2.4 } } },
  { icao: "B77W", maker: "boeing", name: "777-300ER", span: 64.8, height: 18.5, firstFlight: "2003-02-24", variant: { family: "B777", length: 73.86 } },
  { icao: "B788", maker: "boeing", name: "787-8", span: 60.12, height: 17.02, firstFlight: "2009-12-15", variant: { family: "B787", length: 56.72 } },
  { icao: "B789", maker: "boeing", name: "787-9", span: 60.12, height: 17.02, firstFlight: "2013-09-17", variant: { family: "B787", length: 62.81 } },
  { icao: "B78X", maker: "boeing", name: "787-10", span: 60.12, height: 17.02, firstFlight: "2017-03-31", variant: { family: "B787", length: 68.28 } },
];

export const aircraftTypes: ReadonlyMap<string, AircraftType> = new Map(types.map((type) => [type.icao, type]));
export const aircraftType = (icao: string | undefined) => (icao ? aircraftTypes.get(icao.toUpperCase()) ?? null : null);
