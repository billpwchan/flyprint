import SwiftUI

// The footprint: how much and how far (the scope in one number, the years
// or the months, the distance as laps of the Earth, the time aloft as days),
// what carried this person (the aircraft at true scale, the airlines as their
// marks), and where (the countries as their outlines, the cities as they look
// from above, the homes as a band of years).
struct FootprintTab: View {
  @Environment(Store.self) private var store
  @Binding var year: Int?
  var open: (Route) -> Void
  var reveal: Double = 1
  @Binding var scrolled: Bool

  var body: some View {
    let flights = store.flown.filter { year == nil || $0.year == year }
    let lang = store.lang
    ScrollView {
      VStack(alignment: .leading, spacing: 44) {
        VStack(alignment: .leading, spacing: 30) {
          ScopeFigures(year: year, reveal: reveal)
          Group {
            if let year {
              MonthStrip(year: year)
              YearFirsts(year: year, open: open)
            } else if store.years.count > 1 {
              YearBars(year: $year)
            }
          }
          .opacity(reveal)
        }
        if flights.isEmpty {
          Text(lang.t("还没有飞过的航班", "還沒有飛過的航班", "No flights flown yet")).font(.body).foregroundStyle(Ink.secondary)
        } else {
          Group {
            Distance(flights: flights)
            Aloft(flights: flights)
            Superlatives(flights: flights, open: open)
            Hangar(flights: flights)
            Airlines(flights: flights)
            Flags(year: year)
            Cities(year: year, open: open)
            if year == nil && !store.response.homes.isEmpty { Homes(open: open) }
            ImageryCredit()
          }
          .opacity(reveal)
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 8)
      .padding(.bottom, 48)
    }
    .scrollIndicators(.hidden)
    .scrolledOffTop($scrolled)
    .debugScroll()
  }
}

// The cities visited (homes aside), each as it looks from above, the most
// stayed in first; a tap opens the city.
private struct Cities: View {
  @Environment(Store.self) private var store
  let year: Int?
  var open: (Route) -> Void

  var body: some View {
    let lang = store.lang
    let places = visited
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(String(places.count)).font(.display).monospacedDigit()
        Text(lang.t("座城市", "座城市", places.count == 1 ? "city" : "cities")).font(.body).foregroundStyle(Ink.secondary)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), alignment: .leading, spacing: 18) {
        ForEach(places, id: \.metro) { place in
          Button { open(.place(place.metro)) } label: {
            VStack(alignment: .leading, spacing: 6) {
              GeometryReader { geometry in
                CityImage(code: store.anchor(place.metro), size: CGSize(width: geometry.size.width, height: geometry.size.width))
                  .clipShape(.rect(cornerRadius: 14, style: .continuous))
              }
              .aspectRatio(1, contentMode: .fit)
              VStack(alignment: .leading, spacing: 1) {
                Text(store.cityName(place.metro)).font(.captionStrong).lineLimit(1)
                Text(lang.t("\(place.trips) 次", "\(place.trips) 次", place.trips == 1 ? "1 trip" : "\(place.trips) trips"))
                  .font(.micro).monospacedDigit().foregroundStyle(Ink.tertiary)
              }
            }
            .contentShape(.rect)
          }
          .buttonStyle(Press())
        }
      }
    }
  }

  // Trips that stayed in each city (a connection does not count), excluding
  // wherever the person lived, newest visit breaking ties.
  private var visited: [(metro: String, trips: Int, last: String)] {
    let homes = Set(store.response.homes.map { metroOf($0.code) })
    var count: [String: (Int, String)] = [:]
    for trip in store.trips(in: year) {
      let here = Set(([trip.destination] + trip.stays).map(metroOf)).subtracting(homes)
      for metro in here {
        let seen = count[metro] ?? (0, "")
        count[metro] = (seen.0 + 1, max(seen.1, trip.start))
      }
    }
    return count.map { (metro: $0.key, trips: $0.value.0, last: $0.value.1) }
      .sorted { $0.trips != $1.trips ? $0.trips > $1.trips : $0.last > $1.last }
  }
}

// The distance wound around the Earth: one turn of light for each lap of the
// equator, the last turn drawn as far as it got.
private struct Distance: View {
  @Environment(Store.self) private var store
  let flights: [Flight]

  var body: some View {
    let lang = store.lang
    let km = flights.reduce(0) { $0 + $1.km }
    let laps = km / equatorKm
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(Format.decimal(laps, lang)).font(.display).monospacedDigit()
          Text(lang.t("圈地球", "圈地球", laps < 1.05 ? "time around the Earth" : "times around the Earth")).font(.body).foregroundStyle(Ink.secondary)
        }
        Text(lang.t("\(Format.number(km, lang)) 公里，是到月球距离的 \(percent(km / moonKm))", "\(Format.number(km, lang)) 公里，是到月球距離的 \(percent(km / moonKm))", "\(Format.number(km, lang)) km, \(percent(km / moonKm)) of the way to the Moon"))
          .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
      }
      Coil(laps: laps, tone: store.tone)
        .frame(height: 230)
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
  }

  private func percent(_ share: Double) -> String {
    "\(Format.decimal(share * 100, store.lang, digits: share < 0.1 ? 1 : 0))%"
  }
}

// A night Earth with the distance coiled around it.
private struct Coil: View {
  let laps: Double
  let tone: Color

  var body: some View {
    Canvas { context, size in
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      let side: Double = min(size.width, size.height)
      let earth: Double = side * 0.2
      let outer: Double = side / 2 - 6
      let gap: Double = min(7, (outer - earth - 10) / max(1, laps))
      // The Earth: a dark disc with a lit rim.
      let disc = Path(ellipseIn: CGRect(x: center.x - earth, y: center.y - earth, width: earth * 2, height: earth * 2))
      context.fill(disc, with: .radialGradient(Gradient(colors: [Color(red: 0.12, green: 0.15, blue: 0.2), Color(red: 0.05, green: 0.06, blue: 0.08)]),
                                               center: CGPoint(x: center.x - earth * 0.3, y: center.y - earth * 0.3), startRadius: 0, endRadius: earth * 1.4))
      context.stroke(disc, with: .color(Color(red: 0.53, green: 0.68, blue: 0.87).opacity(0.35)), lineWidth: 1)
      // The coil, from the surface outward, brightening toward the end.
      let steps = max(60, Int(laps * 160))
      let turns = laps * 2 * .pi
      var path = Path()
      for i in 0...steps {
        let theta = turns * Double(i) / Double(steps)
        let r = earth + 9 + gap * theta / (2 * .pi)
        let point = CGPoint(x: center.x + r * sin(theta), y: center.y - r * cos(theta))
        if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
      }
      var glow = context
      glow.addFilter(.blur(radius: 3))
      glow.stroke(path, with: .color(tone.opacity(0.35)), lineWidth: 2.5)
      context.stroke(path, with: .linearGradient(Gradient(colors: [tone.opacity(0.35), tone]), startPoint: center, endPoint: CGPoint(x: center.x + outer, y: center.y + outer)),
                     style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
      let r = earth + 9 + gap * laps
      let end = CGPoint(x: center.x + r * sin(turns), y: center.y - r * cos(turns))
      context.fill(Path(ellipseIn: CGRect(x: end.x - 3.5, y: end.y - 3.5, width: 7, height: 7)), with: .color(.white))
    }
  }
}

// Every hour aloft as one cell, coloured by the sky outside the window at
// that hour; a row is a day.
private struct Aloft: View {
  @Environment(Store.self) private var store
  let flights: [Flight]
  @State private var hours: [SIMD4<Double>] = []

  var body: some View {
    let lang = store.lang
    let minutes = flights.reduce(0) { $0 + $1.durationMinutes }
    let days = Double(minutes) / 1440
    let night = flights.filter { flight in store.sky(of: flight)?.allDark == true }.count
    let columns = hours.count > 1200 ? 48 : 24
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(Format.decimal(days, lang)).font(.display).monospacedDigit()
          Text(lang.t("天在空中", "天在空中", "days in the air")).font(.body).foregroundStyle(Ink.secondary)
        }
        Text(lang.t("\(Format.number(Double(Format.hours(minutes: minutes)), lang)) 小时，\(night) 班全程夜航", "\(Format.number(Double(Format.hours(minutes: minutes)), lang)) 小時，\(night) 班全程夜航", "\(Format.number(Double(Format.hours(minutes: minutes)), lang)) hours; \(night) in the dark all the way"))
          .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
      }
      Canvas { context, size in
        let gap = 2.0
        let cell = (size.width - gap * Double(columns - 1)) / Double(columns)
        for (index, c) in hours.enumerated() {
          let x = Double(index % columns) * (cell + gap), y = Double(index / columns) * (cell + gap)
          let rect = CGRect(x: x, y: y, width: cell, height: cell)
          context.fill(Path(roundedRect: rect, cornerRadius: cell * 0.25), with: .color(Color(red: c.x, green: c.y, blue: c.z, opacity: max(0.16, c.w))))
        }
      }
      .frame(height: gridHeight(columns))
      .accessibilityHidden(true)
      Text(lang.t("每格是一小时，颜色是那一刻窗外的天色；每行是一天。", "每格是一小時，顏色是那一刻窗外的天色；每行是一天。", "Each square is an hour, coloured by the sky outside at the time; each row is a day."))
        .font(.micro).foregroundStyle(Ink.tertiary)
    }
    .task(id: flights.count) { hours = skyHours() }
  }

  private func gridHeight(_ columns: Int) -> CGFloat {
    let width = UIScreen.main.bounds.width - 40
    let cell = (width - 2 * Double(columns - 1)) / Double(columns)
    let rows = (hours.count + columns - 1) / columns
    return max(0, Double(rows) * (cell + 2) - 2)
  }

  private func skyHours() -> [SIMD4<Double>] {
    var cells: [SIMD4<Double>] = []
    for flight in flights {
      let count = max(1, Int((Double(flight.durationMinutes) / 60).rounded()))
      guard let sky = store.sky(of: flight), !sky.light.isEmpty else {
        cells += Array(repeating: SIMD4(0.6, 0.65, 0.75, 0.16), count: count)
        continue
      }
      for hour in 0..<count {
        let t = (Double(hour) + 0.5) / Double(count)
        let next = sky.light.firstIndex { $0.at >= t } ?? sky.light.count - 1
        let a = sky.light[max(0, next - 1)], b = sky.light[next]
        let k = b.at > a.at ? (t - a.at) / (b.at - a.at) : 0
        cells.append(skyLight(a.degrees + (b.degrees - a.degrees) * max(0, min(1, k))))
      }
    }
    return cells
  }
}

// The longest flight, the most flown route, the busiest year.
private struct Superlatives: View {
  @Environment(Store.self) private var store
  let flights: [Flight]
  var open: (Route) -> Void

  var body: some View {
    let lang = store.lang
    let longest = flights.max { $0.durationMinutes < $1.durationMinutes }
    let route = Dictionary(grouping: flights) { Set([metroOf($0.origin), metroOf($0.destination)]) }.max { $0.value.count < $1.value.count }
    VStack(alignment: .leading, spacing: 22) {
      if let longest {
        record(lang.t("最长的一程", "最長的一程", "Longest flight"),
               "\(store.city(longest.origin)) → \(store.city(longest.destination))",
               "\(Format.duration(minutes: longest.durationMinutes, lang)) · \(longest.flight) · \(Format.date(longest.date, lang))") {
          open(.flight(longest.id))
        }
      }
      if let route, route.value.count > 1, let sample = route.value.last {
        record(lang.t("飞得最多的航线", "飛得最多的航線", "Most flown route"),
               "\(store.city(sample.origin)) — \(store.city(sample.destination))",
               lang.t("\(route.value.count) 次，从 \(route.value.first!.date.prefix(4)) 年起", "\(route.value.count) 次，從 \(route.value.first!.date.prefix(4)) 年起", "\(route.value.count) times since \(route.value.first!.date.prefix(4))")) {
          open(.flight(sample.id))
        }
      }
    }
  }

  private func record(_ label: String, _ title: String, _ detail: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(label).font(.captionStrong).foregroundStyle(Ink.tertiary)
          Text(title).font(.title).lineLimit(1).minimumScaleFactor(0.8)
          Text(detail).font(.caption).monospacedDigit().foregroundStyle(Ink.secondary)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.captionStrong).foregroundStyle(Ink.faint)
      }
      .contentShape(.rect)
    }
    .buttonStyle(Press())
  }
}

// Every type flown, drawn side by side at true scale, so a 777 is longer than
// an A320 by exactly as much as it is.
private struct Hangar: View {
  @Environment(Store.self) private var store
  let flights: [Flight]

  var body: some View {
    let lang = store.lang
    let types = store.types(in: flights)
    let drawn = types.filter { Fleet.canDraw($0.icao) }
    let longest = drawn.compactMap { Fleet.length($0.icao) }.max() ?? 1
    if !types.isEmpty {
      VStack(alignment: .leading, spacing: 18) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(String(types.count)).font(.display).monospacedDigit()
          Text(lang.t("种机型", "種機型", types.count == 1 ? "aircraft type" : "aircraft types")).font(.body).foregroundStyle(Ink.secondary)
        }
        VStack(alignment: .leading, spacing: 18) {
          ForEach(drawn.prefix(8), id: \.icao) { type in
            VStack(alignment: .leading, spacing: 4) {
              AircraftProfile(icao: type.icao, measured: false)
                .containerRelativeFrame(.horizontal) { width, _ in (width - 40) * (Fleet.length(type.icao) ?? longest) / longest }
              HStack(alignment: .firstTextBaseline) {
                Text(Fleet.localModel(type.model, lang)).font(.caption).foregroundStyle(Ink.secondary)
                Spacer()
                Text(lang.t("\(type.count) 次", "\(type.count) 次", "\(type.count)×")).font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
              }
            }
          }
        }
        let rest = types.filter { !Fleet.canDraw($0.icao) } + drawn.dropFirst(8)
        if !rest.isEmpty {
          Text(rest.map { "\(Fleet.localModel($0.model, lang)) \($0.count)" }.joined(separator: " · "))
            .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
        }
      }
    }
  }
}

// Each airline as its mark, by how often it carried this person.
private struct Airlines: View {
  @Environment(Store.self) private var store
  let flights: [Flight]

  var body: some View {
    let lang = store.lang
    let airlines = store.airlines(in: flights)
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(String(airlines.count)).font(.display).monospacedDigit()
        Text(lang.t("家航空公司", "家航空公司", airlines.count == 1 ? "airline" : "airlines")).font(.body).foregroundStyle(Ink.secondary)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), alignment: .leading, spacing: 18) {
        ForEach(airlines.prefix(25), id: \.code) { item in
          VStack(spacing: 6) {
            AirlineMark(code: item.code, size: 40)
            Text(String(item.count)).font(.caption).monospacedDigit().foregroundStyle(Ink.secondary)
          }
          .frame(maxWidth: .infinity)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel("\(store.carrier(item.code)) \(item.count)")
        }
      }
    }
  }
}

// The countries, as their outlines in the order they were first reached.
private struct Flags: View {
  @Environment(Store.self) private var store
  let year: Int?

  var body: some View {
    let lang = store.lang
    let all = store.firstCountries()
    let inScope = year == nil ? all : all.filter { first in store.countries(in: store.flown.filter { $0.year == year }).contains(first.iso) }
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(String(inScope.count)).font(.display).monospacedDigit()
        Text(lang.t("个国家和地区", "個國家和地區", inScope.count == 1 ? "country" : "countries")).font(.body).foregroundStyle(Ink.secondary)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), alignment: .leading, spacing: 18) {
        ForEach(inScope, id: \.iso) { item in
          VStack(spacing: 4) {
            CountryMark(iso: item.iso, size: 44)
            Text(store.country(item.iso)).font(.caption).foregroundStyle(Ink.secondary).lineLimit(1).minimumScaleFactor(0.8)
            Text(String(item.date.prefix(4))).font(.micro).monospacedDigit().foregroundStyle(Ink.tertiary)
          }
          .frame(maxWidth: .infinity)
        }
      }
    }
  }
}

// Where this person has lived, as a band across the years.
private struct Homes: View {
  @Environment(Store.self) private var store
  var open: (Route) -> Void

  var body: some View {
    let lang = store.lang
    let homes = store.response.homes.sorted { $0.from < $1.from }
    let today = ISO8601DateFormatter.day.string(from: store.now)
    let start = Format.day(homes.first?.from ?? today)?.timeIntervalSince1970 ?? 0
    let end = Format.day(today)?.timeIntervalSince1970 ?? 1
    let tones = [Palette.color(Palette.tone(store.owner.tone)), Color(red: 0.87, green: 0.65, blue: 0.55), Color(red: 0.61, green: 0.8, blue: 0.64),
                 Color(red: 0.73, green: 0.65, blue: 0.89), Color(red: 0.47, green: 0.78, blue: 0.81)]
    VStack(alignment: .leading, spacing: 16) {
      SectionTitle(text: lang.t("住过的地方", "住過的地方", "Homes"))
      GeometryReader { geometry in
        HStack(spacing: 2) {
          ForEach(Array(homes.enumerated()), id: \.offset) { index, home in
            let from = Format.day(home.from)?.timeIntervalSince1970 ?? start
            let to = Format.day(home.to ?? today)?.timeIntervalSince1970 ?? end
            RoundedRectangle(cornerRadius: 3).fill(tones[index % tones.count].opacity(0.8))
              .frame(width: max(4, (geometry.size.width - Double(homes.count - 1) * 2) * (to - from) / max(1, end - start)))
          }
        }
      }
      .frame(height: 10)
      VStack(alignment: .leading, spacing: 10) {
        ForEach(Array(homes.enumerated().reversed()), id: \.offset) { index, home in
          Button { open(.place(metroOf(home.code))) } label: {
            HStack(spacing: 12) {
              CityImage(code: home.code, size: CGSize(width: 36, height: 36))
                .clipShape(.rect(cornerRadius: 9, style: .continuous))
                .overlay(alignment: .bottomTrailing) {
                  Circle().fill(tones[index % tones.count]).frame(width: 9, height: 9)
                    .overlay { Circle().stroke(Ink.ground, lineWidth: 2) }
                    .offset(x: 3, y: 3)
                }
              Text(store.city(home.code)).font(.body)
              Spacer()
              Text("\(home.from.prefix(4)) – \(home.to.map { String($0.prefix(4)) } ?? lang.t("至今", "至今", "now"))")
                .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
            }
            .frame(minHeight: 40)
            .contentShape(.rect)
          }
          .buttonStyle(Press())
        }
      }
    }
  }
}

extension ISO8601DateFormatter {
  static let day: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    return formatter
  }()
}
