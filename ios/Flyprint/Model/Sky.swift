import Foundation
import simd

// The sun along a flight, ported from app/lib/daylight.ts so the phone and
// the web agree on every sunrise.

struct SkyEvent: Hashable, Sendable {
  enum Kind: Sendable { case sunrise, sunset }
  var kind: Kind
  var minute: Int
  var left: Bool
}

// light: the sun's height above what the cabin can see, in degrees, at each share of the flight.
struct Sky: Hashable, Sendable {
  var light: [Point]
  var events: [SkyEvent]

  struct Point: Hashable, Sendable {
    var at: Double
    var degrees: Double
  }

  var allDark: Bool { light.allSatisfy { $0.degrees < 0 } }
  var allLight: Bool { light.allSatisfy { $0.degrees > 0 } }
}

private let rad = Double.pi / 180
private let earthRadiusKm = 6371.0

// Elevation above the horizon and azimuth clockwise from north, in degrees.
// The low-precision solar position (Astronomical Almanac).
func sunAt(_ instant: Double, _ place: LngLat) -> (elevation: Double, azimuth: Double) {
  let d = instant / 86_400_000 + 2440587.5 - 2451545
  let g = (357.529 + 0.98560028 * d) * rad
  let q = 280.459 + 0.98564736 * d
  let longitude = (q + 1.915 * sin(g) + 0.02 * sin(2 * g)) * rad
  let obliquity = (23.439 - 0.00000036 * d) * rad
  let ascension = atan2(cos(obliquity) * sin(longitude), cos(longitude))
  let declination = asin(sin(obliquity) * sin(longitude))
  let sidereal = (280.46061837 + 360.98564736629 * d) * rad
  let hour = sidereal + place.lng * rad - ascension
  let phi: Double = place.lat * rad
  let sinElevation: Double = sin(phi) * sin(declination) + cos(phi) * cos(declination) * cos(hour)
  let elevation: Double = asin(sinElevation)
  let east: Double = -cos(declination) * sin(hour)
  let north: Double = sin(declination) * cos(phi) - cos(declination) * sin(phi) * cos(hour)
  let azimuth: Double = atan2(east, north)
  return (elevation / rad, (azimuth / rad + 360).truncatingRemainder(dividingBy: 360))
}

// Where the sun stands overhead at `instant`.
func subsolar(_ instant: Double) -> LngLat {
  let d = instant / 86_400_000 + 2440587.5 - 2451545
  let g = (357.529 + 0.98560028 * d) * rad
  let q = 280.459 + 0.98564736 * d
  let longitude = (q + 1.915 * sin(g) + 0.02 * sin(2 * g)) * rad
  let obliquity = (23.439 - 0.00000036 * d) * rad
  let ascension = atan2(cos(obliquity) * sin(longitude), cos(longitude))
  let declination = asin(sin(obliquity) * sin(longitude))
  let sidereal = (280.46061837 + 360.98564736629 * d) * rad
  var lng = (ascension - sidereal) / rad
  lng = (lng + 540).truncatingRemainder(dividingBy: 360) - 180
  return LngLat(lng, declination / rad)
}

// Cruise is reached about 25 minutes after take-off and left about 30 before
// landing; from up there the horizon sits below level, so the sun shows longer.
private func altitudeKm(_ minute: Double, _ total: Double) -> Double {
  let climb = min(25, total / 3), descent = min(30, total / 3)
  if minute < climb { return 11 * minute / climb }
  if minute > total - descent { return 11 * (total - minute) / descent }
  return 11
}

private func horizonDip(_ km: Double) -> Double { acos(earthRadiusKm / (earthRadiusKm + km)) / rad }

private func bearing(_ a: LngLat, _ b: LngLat) -> Double {
  let p1 = a.lat * rad, p2 = b.lat * rad, dl = (b.lng - a.lng) * rad
  return (atan2(sin(dl) * cos(p2), cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)) / rad + 360).truncatingRemainder(dividingBy: 360)
}

func greatCircle(_ from: LngLat, _ to: LngLat) -> (Double) -> LngLat {
  let a = toVector(from), b = toVector(to)
  let angle = acos(min(1, max(-1, simd_dot(a, b))))
  let s = sin(angle)
  return { t in
    guard s > 1e-9 else { return from }
    return fromVector(a * (sin((1 - t) * angle) / s) + b * (sin(t * angle) / s))
  }
}

func skyAlong(from: LngLat, to: LngLat, departAt: Double, minutes: Int, samples: Int = 72) -> Sky {
  let place = greatCircle(from, to)
  let total = Double(minutes)
  func visible(_ t: Double) -> (degrees: Double, azimuth: Double) {
    let minute = t * total
    let sun = sunAt(departAt + minute * 60_000, place(t))
    // Refraction lifts the sun's disc by about half a degree at the horizon.
    return (sun.elevation + 0.833 + horizonDip(altitudeKm(minute, total)), sun.azimuth)
  }
  var light: [Sky.Point] = []
  var events: [SkyEvent] = []
  var previous: (t: Double, degrees: Double)?
  for i in 0...samples {
    let t = Double(i) / Double(samples)
    let degrees = visible(t).degrees
    light.append(.init(at: t, degrees: degrees))
    if let before = previous, (before.degrees < 0) != (degrees < 0), degrees != 0 {
      var lo = before.t, hi = t
      for _ in 0..<18 {
        let mid = (lo + hi) / 2
        if (visible(mid).degrees < 0) == (before.degrees < 0) { lo = mid } else { hi = mid }
      }
      let at = (lo + hi) / 2
      let here = place(at), ahead = place(min(1, at + 0.01)), behind = place(max(0, at - 0.01))
      let heading = at < 0.99 ? bearing(here, ahead) : bearing(behind, here)
      let relative = (visible(at).azimuth - heading + 360).truncatingRemainder(dividingBy: 360)
      events.append(SkyEvent(kind: degrees > 0 ? .sunrise : .sunset, minute: Int((at * total).rounded()), left: relative >= 180))
    }
    previous = (t, degrees)
  }
  return Sky(light: light, events: events)
}

// Night a faint blue, the horizon a warm glow, day a pale warm white.
private let skyStops: [(Double, SIMD4<Double>)] = [
  (-12, SIMD4(120, 150, 200, 0.24)),
  (-4, SIMD4(150, 140, 196, 0.38)),
  (0, SIMD4(236, 150, 112, 0.72)),
  (5, SIMD4(246, 204, 150, 0.82)),
  (14, SIMD4(240, 234, 218, 0.86)),
]

// RGBA in 0...1 for the sun at this height.
func skyLight(_ degrees: Double) -> SIMD4<Double> {
  let clamped = max(skyStops[0].0, min(skyStops[skyStops.count - 1].0, degrees))
  var i = 1
  while i < skyStops.count - 1 && clamped > skyStops[i].0 { i += 1 }
  let (d0, c0) = skyStops[i - 1], (d1, c1) = skyStops[i]
  let t = (clamped - d0) / max(1e-9, d1 - d0)
  let c = c0 + (c1 - c0) * t
  return SIMD4(c.x / 255, c.y / 255, c.z / 255, c.w)
}

// Which side of the cabin a seat sits on, from app/lib/plan.ts.
func seatSide(_ seat: String?, body: String?) -> (left: Bool, window: Bool)? {
  guard let letter = seat?.uppercased().last, "ABCDEFGHJK".contains(letter), let body else { return nil }
  if body == "narrowbody" {
    if "ABC".contains(letter) { return (true, letter == "A") }
    if "DEF".contains(letter) { return (false, letter == "F") }
    return nil
  }
  if "ABC".contains(letter) { return (true, letter == "A") }
  if "HJK".contains(letter) { return (false, letter == "K") }
  return nil
}
