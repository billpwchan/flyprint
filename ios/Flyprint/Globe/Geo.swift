import Foundation
import simd

// Geometry shared by the globe and the pages, ported from app/lib/geo.ts,
// app/lib/network.ts and app/components/stage/arcs.ts so a route looks the
// same on the phone as on the web.

struct LngLat: Hashable, Sendable {
  var lng: Double
  var lat: Double
  init(_ lng: Double, _ lat: Double) { self.lng = lng; self.lat = lat }
}

// Points on the unit sphere: z through (0°, 0°), x through 90°E, y through the North Pole.
func toVector(_ p: LngLat) -> SIMD3<Double> {
  let x = p.lng * .pi / 180, y = p.lat * .pi / 180
  return SIMD3(sin(x) * cos(y), sin(y), cos(x) * cos(y))
}

func fromVector(_ v: SIMD3<Double>) -> LngLat {
  LngLat(atan2(v.x, v.z) * 180 / .pi, asin(max(-1, min(1, v.y))) * 180 / .pi)
}

func angularDistance(_ a: LngLat, _ b: LngLat) -> Double {
  let r = Double.pi / 180
  let dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  let h = pow(sin(dLat / 2), 2) + cos(a.lat * r) * cos(b.lat * r) * pow(sin(dLng / 2), 2)
  return 2 * asin(min(1, sqrt(h)))
}

// A flight's track over the ground: the great circle between two airports,
// pushed sideways at the middle by `bow` (a share of its length). A positive
// bow lies right of the direction of travel, so out and back form a lens.
func bowedTrack(_ from: LngLat, _ to: LngLat, bow: Double) -> [SIMD3<Double>] {
  let a = toVector(from), b = toVector(to)
  let angle = acos(min(1, max(-1, simd_dot(a, b))))
  let steps = min(128, max(48, Int((angle * 60).rounded(.up))))
  let s = sin(angle)
  let cross = simd_cross(b, a)
  let length = simd_length(cross)
  let right = length > 1e-9 ? cross / length : .zero
  return (0...steps).map { index in
    let t = Double(index) / Double(steps)
    let wa = s < 1e-6 ? 1 - t : sin((1 - t) * angle) / s
    let wb = s < 1e-6 ? t : sin(t * angle) / s
    let p = a * wa + b * wb
    let aside = bow * angle * sin(.pi * t)
    return p * cos(aside) + right * sin(aside)
  }
}

// Height at the middle of an arc, as a share of the globe's radius: long hauls
// rise higher than short hops, but low enough not to hook over the horizon.
func liftOf(_ angle: Double) -> Double { 0.16 * angle / (1 + 0.7 * angle) }

func arcPath(_ from: LngLat, _ to: LngLat, bow: Double) -> [SIMD3<Double>] {
  let track = bowedTrack(from, to, bow: bow)
  guard let a = track.first, let b = track.last else { return [] }
  let lift = liftOf(acos(min(1, max(-1, simd_dot(a, b)))))
  let last = Double(track.count - 1)
  return track.enumerated().map { index, point in point * (1 + lift * sin(.pi * Double(index) / last)) }
}

// Airports that share one metro area (IATA metropolitan codes), so their arcs
// share a fan. Mirrors metros in app/lib/places.ts.
let metros: [String: String] = [
  "PEK": "BJS", "PKX": "BJS", "PVG": "SHA", "SHA": "SHA", "HND": "TYO", "NRT": "TYO", "KIX": "OSA", "ITM": "OSA",
  "UKB": "OSA", "CTS": "SPK", "OKD": "SPK", "ICN": "SEL", "GMP": "SEL", "TPE": "TPE", "TSA": "TPE", "BKK": "BKK",
  "DMK": "BKK", "CGK": "JKT", "HLP": "JKT", "KUL": "KUL", "SZB": "KUL", "DXB": "DXB", "DWC": "DXB", "IST": "IST",
  "SAW": "IST", "LHR": "LON", "LGW": "LON", "STN": "LON", "LTN": "LON", "LCY": "LON", "SEN": "LON", "CDG": "PAR",
  "ORY": "PAR", "MXP": "MIL", "LIN": "MIL", "BGY": "MIL", "FCO": "ROM", "CIA": "ROM", "ARN": "STO", "BMA": "STO",
  "SVO": "MOW", "DME": "MOW", "VKO": "MOW", "JFK": "NYC", "EWR": "NYC", "LGA": "NYC", "IAD": "WAS", "DCA": "WAS",
  "BWI": "WAS", "ORD": "CHI", "MDW": "CHI", "YYZ": "YTO", "YTZ": "YTO", "EZE": "BUE", "AEP": "BUE", "GRU": "SAO",
  "CGH": "SAO", "VCP": "SAO", "GIG": "RIO", "SDU": "RIO", "CTU": "CTU", "TFU": "CTU", "NGO": "NGO", "NKM": "NGO",
  "IAH": "HOU", "HOU": "HOU", "DFW": "DFW", "DAL": "DFW", "OSL": "OSL", "TRF": "OSL", "RYG": "OSL", "BRU": "BRU",
  "CRL": "BRU", "KBP": "IEV", "IEV": "IEV",
]
func metroOf(_ code: String) -> String { metros[code] ?? code }

// Every flight is its own arc. Flights between the same two cities in the same
// direction stack outward from the route, by whose they are and then by date.
func bowsOf(_ flights: [Flight]) -> [String: Double] {
  let first = 0.07, step = 0.03, widest = 0.26
  let order = ["me", "both", "them"]
  var directions: [String: [Flight]] = [:]
  for flight in flights { directions["\(metroOf(flight.origin))>\(metroOf(flight.destination))", default: []].append(flight) }
  var bows: [String: Double] = [:]
  for var group in directions.values {
    group.sort {
      let a = order.firstIndex(of: $0.side ?? "me") ?? 0, b = order.firstIndex(of: $1.side ?? "me") ?? 0
      if a != b { return a < b }
      return ($0.date, $0.depart) < ($1.date, $1.depart)
    }
    let gap = group.count > 1 ? min(step, (widest - first) / Double(group.count - 1)) : 0
    for (index, flight) in group.enumerated() { bows[flight.id] = first + Double(index) * gap }
  }
  return bows
}

// The smallest spherical cap holding every point (Bădoiu–Clarkson): its centre
// is where the camera looks to keep all of them in view.
func enclosingCap(_ points: [LngLat]) -> (center: LngLat, radius: Double)? {
  guard !points.isEmpty else { return nil }
  let vectors = points.map(toVector)
  var center = simd_normalize(vectors.reduce(.zero, +) + SIMD3(1e-9, 0, 0))
  for step in 1...120 {
    var far = vectors[0], farDot = 2.0
    for v in vectors where simd_dot(center, v) < farDot { farDot = simd_dot(center, v); far = v }
    center = simd_normalize(center + (far - center) / Double(step + 1))
  }
  let radius = vectors.map { acos(min(1, max(-1, simd_dot(center, $0)))) }.max() ?? 0
  return (fromVector(center), radius)
}
