import SwiftUI

// Weather at an airport on a day, as the server gives it from Open-Meteo:
// each hour is [°C, WMO code, cloud %, mm, 1 by day], local to the airport.
// The same reading and drawing as the web's app/lib/weather.ts.
struct WeatherDay: Codable, Sendable, Hashable {
  var hi: Double
  var lo: Double
  var code: Int
  var rain: Double
  var hours: [[Double?]]

  func hour(_ index: Int) -> (temp: Double?, code: Int?, cloud: Double?, day: Bool?)? {
    guard hours.indices.contains(index) else { return nil }
    let h = hours[index]
    func at(_ i: Int) -> Double? { h.indices.contains(i) ? h[i] : nil }
    return (at(0), at(1).map { Int($0) }, at(2), at(4).map { $0 > 0.5 })
  }

  // What the day was like while it was light (08:00 to 19:00): the daily code
  // is the worst hour, so one evening shower would make a sunny day read as
  // rain. Rain or fog counts when it lasted three hours or more.
  var daytime: (code: Int, cloud: Double) {
    let light = (8..<20).compactMap { hour($0) }
    let cloud = light.reduce(0) { $0 + ($1.cloud ?? 0) } / Double(max(1, light.count))
    let codes = light.compactMap(\.code)
    let wet = codes.filter { WeatherKind.of($0).kind.isWet }
    if wet.count >= 3 {
      var tally: [Int: Int] = [:]
      for code in wet { tally[code, default: 0] += 1 }
      let code = tally.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key > $1.key }[0].key
      return (code, cloud)
    }
    if codes.filter({ WeatherKind.of($0).kind == .fog }).count >= 3 { return (45, cloud) }
    return (cloud < 25 ? 0 : cloud < 80 ? 2 : 3, cloud)
  }
}

enum WeatherKind: Equatable {
  case clear, partly, overcast, fog, drizzle, rain, snow, storm

  var isWet: Bool { [.drizzle, .rain, .snow, .storm].contains(self) }

  static func of(_ code: Int) -> (kind: WeatherKind, strength: Int) {
    switch code {
    case ...1: (.clear, 1)
    case 2: (.partly, 1)
    case 3: (.overcast, 1)
    case 45, 48: (.fog, 1)
    case 51...57: (.drizzle, 1)
    case 61, 80, 66: (.rain, 1)
    case 63, 81: (.rain, 2)
    case 65, 82, 67: (.rain, 3)
    case 71, 77, 85: (.snow, 1)
    case 73: (.snow, 2)
    case 75, 86: (.snow, 3)
    case 95...: (.storm, 3)
    default: (.overcast, 1)
    }
  }

  static func word(_ code: Int, _ lang: Lang) -> String {
    let (kind, strength) = of(code)
    switch kind {
    case .clear: return lang.t("晴", "晴", "Clear")
    case .partly: return lang.t("多云", "多雲", "Some cloud")
    case .overcast: return lang.t("阴", "陰", "Overcast")
    case .fog: return lang.t("雾", "霧", "Fog")
    case .drizzle: return lang.t("毛毛雨", "微雨", "Drizzle")
    case .rain: return [lang.t("小雨", "小雨", "Light rain"), lang.t("中雨", "中雨", "Rain"), lang.t("大雨", "大雨", "Heavy rain")][strength - 1]
    case .snow: return [lang.t("小雪", "小雪", "Light snow"), lang.t("中雪", "中雪", "Snow"), lang.t("大雪", "大雪", "Heavy snow")][strength - 1]
    case .storm: return lang.t("雷雨", "雷雨", "Thunderstorm")
    }
  }
}

func degrees(_ value: Double) -> String { "\(Int(value.rounded()))°" }

func weatherKey(_ code: String, _ date: String) -> String { "\(code) \(date)" }

// Forecasts run fifteen days ahead; past that a day has no weather yet.
func weatherReaches(_ date: String, now: Date) -> Bool {
  let today = ISO8601DateFormatter.day.string(from: now)
  return date <= addDays(today, 14)
}

func addDays(_ date: String, _ days: Int) -> String {
  guard let start = ISO8601DateFormatter.day.date(from: date),
        let moved = Calendar.utc.date(byAdding: .day, value: days, to: start) else { return date }
  return ISO8601DateFormatter.day.string(from: moved)
}

// The hour a local "HH:MM" falls in, to the nearest hour.
func hourOf(_ clock: String) -> Int? {
  let parts = clock.split(separator: ":")
  guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1].prefix(2)) else { return nil }
  return min(23, h + (m >= 30 ? 1 : 0))
}

extension Calendar {
  static let utc: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()
}

// What a window shows: the sky by the sun's height above the horizon,
// greyed by cloud, and what is falling past it.
struct WindowLook: Equatable {
  var top: SIMD3<Double>
  var bottom: SIMD3<Double>
  var sun: Double
  var moon: Double
  var stars: Double
  var cloud: Double
  var deck: Double
  var fall: WeatherKind?
  var amount: Int
  var fog: Bool
  var bolt: Bool

  static let noon = 40.0

  private static let sky: [(Double, SIMD3<Double>, SIMD3<Double>)] = [
    (-12, [7, 11, 24], [16, 26, 51]),
    (-6, [18, 28, 60], [58, 62, 106]),
    (-2, [35, 48, 94], [199, 122, 90]),
    (2, [74, 111, 168], [242, 166, 110]),
    (10, [63, 124, 201], [169, 205, 235]),
    (30, [43, 111, 204], [140, 192, 238]),
  ]
  private static let overcastDay: (SIMD3<Double>, SIMD3<Double>) = ([104, 114, 128], [146, 155, 167])
  private static let overcastNight: (SIMD3<Double>, SIMD3<Double>) = ([17, 21, 29], [28, 34, 45])

  private static func mix(_ a: SIMD3<Double>, _ b: SIMD3<Double>, _ t: Double) -> SIMD3<Double> { a + (b - a) * t }

  private static func skyAt(_ elevation: Double) -> (SIMD3<Double>, SIMD3<Double>) {
    let e = min(sky.last!.0, max(sky[0].0, elevation))
    var i = 1
    while i < sky.count - 1 && e > sky[i].0 { i += 1 }
    let (e0, t0, b0) = sky[i - 1], (e1, t1, b1) = sky[i]
    let t = (e - e0) / max(1e-6, e1 - e0)
    return (mix(t0, t1, t), mix(b0, b1, t))
  }

  init(elevation: Double, cloudCover: Double, code: Int) {
    let (kind, strength) = WeatherKind.of(code)
    let falling = kind.isWet
    let cloud = min(1, max(cloudCover / 100, falling || kind == .fog ? 0.85 : kind == .overcast ? 0.9 : 0))
    let daylight = max(0, min(1, (elevation + 6) / 12))
    let (top, bottom) = Self.skyAt(elevation)
    let greyTop = Self.mix(Self.overcastNight.0, Self.overcastDay.0, daylight)
    let greyBottom = Self.mix(Self.overcastNight.1, Self.overcastDay.1, daylight)
    let veil = pow(cloud, 1.4)
    let clearSky = max(0, 1 - cloud / 0.6)
    self.top = Self.mix(top, greyTop, veil)
    self.bottom = Self.mix(bottom, greyBottom, veil)
    sun = elevation > -1 ? clearSky : 0
    moon = elevation < -6 ? clearSky * 0.9 : 0
    stars = elevation < -9 ? clearSky : 0
    self.cloud = kind == .partly || (cloud > 0.2 && cloud < 0.8) ? cloud : 0
    deck = cloud >= 0.8 ? cloud : 0
    fall = kind == .snow ? .snow : falling ? .rain : nil
    amount = kind == .drizzle ? 1 : strength
    fog = kind == .fog
    bolt = kind == .storm
  }
}

// A plane's window with the weather outside it, drawn on a 30 × 40 grid like
// the web's WeatherWindow.
struct WeatherWindow: View {
  let look: WindowLook
  var width: CGFloat = 22

  // Listed so that the first few already spread over the pane.
  private static let rain: [CGPoint] = [(10, 9), (20, 20), (14, 30), (23, 9), (11, 19), (17, 4), (7, 28), (24, 29)].map { CGPoint(x: $0.0, y: $0.1) }
  private static let snow: [CGPoint] = [(9, 9), (20, 20), (15, 30), (23, 12), (11, 19), (17, 6), (8, 27), (23, 31)].map { CGPoint(x: $0.0, y: $0.1) }
  private static let stars: [(CGFloat, CGFloat, CGFloat)] = [(8.5, 9, 0.55), (14, 15, 0.45), (22.5, 21, 0.5), (10, 25, 0.4)]

  var body: some View {
    Canvas { context, size in
      let s = size.width / 30
      context.scaleBy(x: s, y: s)
      let frame = Path(roundedRect: CGRect(x: 0.5, y: 0.5, width: 29, height: 39), cornerRadius: 13)
      context.fill(frame, with: .color(.white.opacity(0.07)))
      context.stroke(frame, with: .color(.white.opacity(0.1)), lineWidth: 0.8)
      let pane = Path(roundedRect: CGRect(x: 3, y: 3, width: 24, height: 34), cornerRadius: 10.5)
      context.drawLayer { inner in
        inner.clip(to: pane)
        inner.fill(Path(CGRect(x: 0, y: 0, width: 30, height: 40)),
                   with: .linearGradient(Gradient(colors: [color(look.top), color(look.bottom)]), startPoint: .zero, endPoint: CGPoint(x: 0, y: 40)))
        if look.stars > 0 {
          for (x, y, r) in Self.stars {
            inner.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(.white.opacity(look.stars * 0.8)))
          }
        }
        if look.sun > 0 {
          inner.fill(Path(ellipseIn: CGRect(x: 11, y: 2, width: 18, height: 18)),
                     with: .radialGradient(Gradient(colors: [Color(red: 1, green: 0.957, blue: 0.847).opacity(0.7 * look.sun), .clear]), center: CGPoint(x: 20, y: 11), startRadius: 0, endRadius: 9))
          inner.fill(Path(ellipseIn: CGRect(x: 16.4, y: 7.4, width: 7.2, height: 7.2)), with: .color(Color(red: 1, green: 0.965, blue: 0.878).opacity(look.sun)))
        }
        if look.moon > 0 {
          var moon = Path(ellipseIn: CGRect(x: 15.6, y: 7.2, width: 8, height: 8))
          moon = moon.subtracting(Path(ellipseIn: CGRect(x: 18.2, y: 6, width: 7.4, height: 7.4)))
          inner.fill(moon, with: .color(Color(red: 0.9, green: 0.925, blue: 1).opacity(look.moon)))
        }
        if look.cloud > 0 {
          let puff = Color.white.opacity(0.22 + 0.4 * look.cloud)
          inner.fill(Path(ellipseIn: CGRect(x: -1, y: 24.6, width: 20, height: 6.8)), with: .color(puff))
          inner.fill(Path(ellipseIn: CGRect(x: 11, y: 28.9, width: 22, height: 7.2)), with: .color(puff))
        }
        if look.deck > 0 {
          let band = Color.white.opacity(0.1 * look.deck)
          inner.fill(Path(ellipseIn: CGRect(x: -5, y: 5, width: 26, height: 8)), with: .color(band))
          inner.fill(Path(ellipseIn: CGRect(x: 12, y: 14.4, width: 24, height: 7.2)), with: .color(band))
          inner.fill(Path(ellipseIn: CGRect(x: -4, y: 23.2, width: 28, height: 7.6)), with: .color(band))
        }
        if look.fog {
          for (x, y, w) in [(2.0, 19.0, 26.0), (5, 25, 23), (2, 31, 22)] {
            inner.fill(Path(roundedRect: CGRect(x: x, y: y, width: w, height: 2.6), cornerRadius: 1.3), with: .color(.white.opacity(0.32)))
          }
        }
        if look.fall == .rain {
          let count = look.amount == 1 ? 3 : look.amount == 2 ? 5 : 8
          var lines = Path()
          for point in Self.rain.prefix(count) {
            lines.move(to: point)
            lines.addLine(to: CGPoint(x: point.x - 2, y: point.y + 5.5))
          }
          inner.stroke(lines, with: .color(.white.opacity(0.75)), style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
        }
        if look.fall == .snow {
          let count = look.amount == 1 ? 4 : look.amount == 2 ? 6 : 8
          for point in Self.snow.prefix(count) {
            inner.fill(Path(ellipseIn: CGRect(x: point.x - 1.25, y: point.y - 1.25, width: 2.5, height: 2.5)), with: .color(.white.opacity(0.9)))
          }
        }
        if look.bolt {
          var bolt = Path()
          bolt.addLines([CGPoint(x: 16.5, y: 12), CGPoint(x: 12, y: 20), CGPoint(x: 15.4, y: 20), CGPoint(x: 13.4, y: 27.5), CGPoint(x: 19.4, y: 18), CGPoint(x: 15.8, y: 18), CGPoint(x: 18, y: 12)])
          bolt.closeSubpath()
          inner.fill(bolt, with: .color(Color(red: 1, green: 0.898, blue: 0.541)))
        }
        // The pane's top edge is in the shade of the cabin wall.
        inner.fill(Path(CGRect(x: 0, y: 0, width: 30, height: 40)),
                   with: .linearGradient(Gradient(stops: [.init(color: .black.opacity(0.28), location: 0), .init(color: .clear, location: 0.35)]), startPoint: .zero, endPoint: CGPoint(x: 0, y: 40)))
      }
      context.stroke(pane, with: .color(.white.opacity(0.16)), lineWidth: 0.8)
    }
    .frame(width: width, height: width * 4 / 3)
    .accessibilityHidden(true)
  }

  private func color(_ rgb: SIMD3<Double>) -> Color { Color(red: rgb.x / 255, green: rgb.y / 255, blue: rgb.z / 255) }
}

// Where the flight left and where it landed, at those hours.
struct FlightWeather: View {
  @Environment(Store.self) private var store
  let flight: Flight

  var body: some View {
    let arrival = addDays(flight.date, flight.arrivalDayOffset)
    let keys = [weatherKey(flight.origin, flight.date), weatherKey(flight.destination, arrival)]
    let landAt = flight.departAt.map { $0 + Double(flight.durationMinutes) * 60_000 }
    let ends = [(store.weather[keys[0]], flight.depart, flight.departAt, flight.origin, 0),
                (store.weather[keys[1]], flight.arrive, landAt, flight.destination, 1)]
    HStack(alignment: .center) {
      ForEach(ends, id: \.4) { day, clock, instant, code, side in
        if let day {
          end(day, clock: clock, instant: instant, code: code, arriving: side == 1)
        } else {
          Color.clear.frame(width: 1, height: 1)
        }
        if side == 0 { Spacer(minLength: 12) }
      }
    }
    .task(id: keys) { store.want(weather: keys) }
  }

  private func end(_ day: WeatherDay, clock: String, instant: Double?, code: String, arriving: Bool) -> some View {
    let lang = store.lang
    let hour = hourOf(clock)
    let entry = hour.flatMap { day.hour($0) }
    let elevation: Double? = instant.flatMap { at in store.position(code).map { sunAt(at, $0).elevation } }
    let light = day.daytime
    let look = entry.map { WindowLook(elevation: elevation ?? (($0.day ?? true) ? WindowLook.noon : -20), cloudCover: $0.cloud ?? 0, code: $0.code ?? day.code) }
      ?? WindowLook(elevation: WindowLook.noon, cloudCover: light.cloud, code: light.code)
    let temp = entry?.temp.map(degrees) ?? "\(degrees(day.hi)) / \(degrees(day.lo))"
    let word = WeatherKind.word(entry?.code ?? light.code, lang)
    let when = hour == nil ? lang.t("当天", "當天", "That day") : arriving ? lang.t("落地时", "落地時", "On landing") : lang.t("起飞时", "起飛時", "At take-off")
    let label = VStack(alignment: arriving ? .trailing : .leading, spacing: 1) {
      HStack(spacing: 5) {
        Text(temp).font(.bodyStrong).monospacedDigit()
        Text(word).font(.caption).foregroundStyle(Ink.secondary)
      }
      Text(when).font(.micro).foregroundStyle(Ink.tertiary)
    }
    return HStack(spacing: 10) {
      if arriving { label; WeatherWindow(look: look, width: 24) } else { WeatherWindow(look: look, width: 24); label }
    }
    .accessibilityElement(children: .combine)
  }
}

// Each day of a stay as its window at midday, with the day's high and low.
struct StayDays: View {
  @Environment(Store.self) private var store
  let code: String
  let from: String
  let to: String

  var body: some View {
    let days = Self.days(from, to)
    let keys = days.map { weatherKey(code, $0) }
    Group {
      if weatherReaches(to, now: store.now) {
        ScrollView(.horizontal) {
          HStack(alignment: .top, spacing: 9) {
            ForEach(Array(keys.enumerated()), id: \.offset) { _, key in
              if let day = store.weather[key] {
                let light = day.daytime
                VStack(spacing: 1) {
                  WeatherWindow(look: WindowLook(elevation: WindowLook.noon, cloudCover: light.cloud, code: light.code), width: 18)
                  Text(degrees(day.hi)).font(.micro).foregroundStyle(Ink.secondary).padding(.top, 4)
                  Text(degrees(day.lo)).font(.micro).foregroundStyle(Ink.tertiary)
                }
                .monospacedDigit()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(WeatherKind.word(light.code, store.lang)) \(degrees(day.hi)) / \(degrees(day.lo))")
              } else {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(.white.opacity(0.04)).frame(width: 18, height: 24)
              }
            }
          }
        }
        .scrollIndicators(.hidden)
      }
    }
    .task(id: keys) { store.want(weather: keys) }
  }

  static func days(_ from: String, _ to: String) -> [String] {
    var out: [String] = []
    var date = from
    while date <= to && out.count < 22 {
      out.append(date)
      date = addDays(date, 1)
    }
    return out
  }
}
