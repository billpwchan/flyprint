import SwiftUI

// A city: what it looks like from above, how it figures in this person's
// flying, its airports as their runways, and where they flew from it.
struct PlaceView: View {
  @Environment(Store.self) private var store
  let metro: String
  var open: (Route) -> Void

  var body: some View {
    let reading = store.reading(of: metro)
    let anchor = store.anchor(metro)
    ScrollView {
      VStack(alignment: .leading, spacing: 30) {
        hero(anchor, reading)
        VStack(alignment: .leading, spacing: 34) {
          figures(reading)
          airports
          if !reading.routes.isEmpty { routes(reading) }
          if !reading.airlines.isEmpty { airlines(reading) }
          if !reading.trips.isEmpty { trips(reading) }
          ImageryCredit()
        }
        .padding(.horizontal, 20)
      }
      .padding(.bottom, 40)
    }
    .scrollIndicators(.hidden)
    .reportsPageScroll(titleAfter: 172)
    .debugScroll()
  }

  private func hero(_ anchor: String, _ reading: Store.CityReading) -> some View {
    let iso = store.place(anchor)?.country
    return GeometryReader { geometry in
      ZStack(alignment: .bottomLeading) {
        CityImage(code: anchor, pitched: true, size: CGSize(width: geometry.size.width, height: 250))
            .mask(LinearGradient(stops: [.init(color: .black, location: 0.35), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
        LinearGradient(colors: [.black.opacity(0.5), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.3))
        VStack(alignment: .leading, spacing: 4) {
          if let iso { Text(store.country(iso)).font(.caption).foregroundStyle(Ink.secondary) }
          Text(store.cityName(metro)).font(.large)
          if let home = reading.lived.first { Text(livedLine(home)).font(.body).foregroundStyle(store.tone) }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottomTrailing) {
          if let iso { CountryMark(iso: iso, size: 72, city: store.position(anchor)).padding(.trailing, 20).padding(.bottom, 6) }
        }
      }
    }
    .frame(height: 250)
  }

  private func livedLine(_ home: Home) -> String {
    let lang = store.lang
    let from = Format.date(home.from, lang)
    guard let to = home.to else { return lang.t("\(from)起住在这里", "\(from)起住在這裏", "Home since \(from)") }
    return lang.t("\(from)至\(Format.date(to, lang))住在这里", "\(from)至\(Format.date(to, lang))住在這裏", "Home \(from) – \(Format.date(to, lang))")
  }

  private func figures(_ reading: Store.CityReading) -> some View {
    let lang = store.lang
    var items: [(String, String)] = [(String(reading.flights.count), lang.t("班", "班", reading.flights.count == 1 ? "flight" : "flights"))]
    if !reading.trips.isEmpty { items.append((String(reading.trips.count), lang.t("次到访", "次到訪", reading.trips.count == 1 ? "visit" : "visits"))) }
    if reading.nights > 0 { items.append((String(reading.nights), lang.t("晚", "晚", reading.nights == 1 ? "night" : "nights"))) }
    if let first = reading.first { items.append((String(first.date.prefix(4)), lang.t("年第一次", "年第一次", "first"))) }
    return FigureRow(items: items)
  }

  // Each airport as its runways, drawn to scale and north up.
  private var airports: some View {
    let lang = store.lang
    return VStack(alignment: .leading, spacing: 14) {
      ForEach(store.airports(in: metro), id: \.self) { code in
        let count = store.flown.filter { $0.origin == code || $0.destination == code }.count
        let runways = Runways.of(code)
        HStack(alignment: .center, spacing: 16) {
          if !runways.isEmpty {
            RunwayDiagram(code: code).frame(width: 112, height: 112)
          }
          VStack(alignment: .leading, spacing: 3) {
            Text(code).font(.title).monospacedDigit()
            Text(store.airportName(code)).font(.caption).foregroundStyle(Ink.secondary).lineLimit(2)
            Text([lang.t("\(count) 班", "\(count) 班", count == 1 ? "1 flight" : "\(count) flights"),
                  runways.isEmpty ? nil : lang.t("\(runways.count) 条跑道", "\(runways.count) 條跑道", runways.count == 1 ? "1 runway" : "\(runways.count) runways")]
              .compactMap { $0 }.joined(separator: " · "))
              .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
          }
          Spacer(minLength: 0)
        }
      }
    }
  }

  // Where they flew from here, longest bar the most flown.
  private func routes(_ reading: Store.CityReading) -> some View {
    let top = Array(reading.routes.prefix(8))
    let most = Double(top.first?.count ?? 1)
    return VStack(alignment: .leading, spacing: 12) {
      SectionTitle(text: store.lang.t("往来最多", "往來最多", "Most flown with"))
      ForEach(top, id: \.metro) { route in
        Button { open(.place(route.metro)) } label: {
          VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
              Text(store.cityName(route.metro)).font(.body)
              Spacer()
              Text(String(route.count)).font(.bodyStrong).monospacedDigit()
            }
            GeometryReader { geometry in
              Capsule().fill(store.tone.opacity(0.75)).frame(width: max(3, geometry.size.width * Double(route.count) / most), height: 3)
            }
            .frame(height: 3)
          }
          .contentShape(.rect)
        }
        .buttonStyle(Press())
      }
    }
  }

  private func airlines(_ reading: Store.CityReading) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionTitle(text: store.lang.t("航司", "航空公司", "Airlines"))
      ScrollView(.horizontal) {
        HStack(spacing: 18) {
          ForEach(reading.airlines.prefix(12), id: \.code) { item in
            VStack(spacing: 6) {
              AirlineMark(code: item.code, size: 36)
              Text(String(item.count)).font(.caption).monospacedDigit().foregroundStyle(Ink.secondary)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(store.carrier(item.code)) \(item.count)")
          }
        }
      }
      .scrollIndicators(.hidden)
    }
  }

  private func trips(_ reading: Store.CityReading) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      SectionTitle(text: store.lang.t("来这里的旅程", "來這裏的旅程", "Trips here"))
      ForEach(reading.trips.prefix(8)) { trip in
        TripLink(trip: trip, within: metro) { open(.trip(trip.id)) }
      }
    }
  }
}
