import SwiftUI

// Trips side by side in time: swipe to the trip before or after.
struct TripPager: View {
  @Environment(Store.self) private var store
  @Environment(Navigator.self) private var navigator
  let route: Route
  var open: (Route) -> Void
  var show: (Route?) -> Void
  @State private var current: String
  @State private var scroll = PageScroll()
  @State private var place = 0

  init(route: Route, start: String, open: @escaping (Route) -> Void, show: @escaping (Route?) -> Void) {
    self.route = route
    self.open = open
    self.show = show
    _current = State(initialValue: start)
  }

  var body: some View {
    let ids = store.trips.sorted { $0.start < $1.start }.map(\.id)
    let index = ids.firstIndex(of: current) ?? 0
    Pager(ids: ids, selection: $current) { id in
      TripPage(id: id, open: open)
    }
    .overlay(alignment: .top) {
      PageBar(route: route, title: store.tripsByID[current].map { tripTitle($0, store) }, position: (index, ids.count), share: { navigator.sharing = .trip(current) }) { delta in
        if ids.indices.contains(index + delta) { current = ids[index + delta] }
      }
    }
    .environment(\.pageScroll, scroll)
    .onAppear { show(.trip(current)); place = index }
    .onChange(of: current) { show(.trip(current)); if let found = ids.firstIndex(of: current) { place = found } }
    // The one on screen was deleted or merged elsewhere: stay where it stood.
    .onChange(of: ids) {
      guard !ids.contains(current), !ids.isEmpty else { return }
      current = store.successor(ofTrip: current) ?? ids[min(place, ids.count - 1)]
    }
  }
}

// A trip: the place it went to, seen from above, then the days as they ran:
// each flight with the sky it flew through, each stay as its nights.
struct TripPage: View {
  @Environment(Store.self) private var store
  let id: String
  var open: (Route) -> Void

  var body: some View {
    if let trip = store.tripsByID[id] {
      let legs = store.legs(of: trip)
      ScrollView {
        VStack(alignment: .leading, spacing: 26) {
          hero(trip)
          figures(trip)
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(legs.enumerated()), id: \.element.id) { index, flight in
              LegRow(flight: flight) { open(.flight(flight.id)) }
              if index < trip.gaps.count {
                let next = index + 1 < legs.count ? legs[index + 1] : nil
                GapRow(gap: trip.gaps[index], days: next.map { (addDays(flight.date, flight.arrivalDayOffset), $0.date) }) { open(.place(metroOf(trip.gaps[index].at))) }
              }
            }
          }
          .padding(.horizontal, 20)
          ImageryCredit().padding(.horizontal, 20)
        }
        .padding(.bottom, 40)
      }
      .scrollIndicators(.hidden)
      .reportsPageScroll(titleAfter: 172)
    }
  }

  // The destination from above, the name over it.
  private func hero(_ trip: Trip) -> some View {
    let lang = store.lang
    let iso = store.place(trip.destination)?.country
    return GeometryReader { geometry in
      Button { open(.place(metroOf(trip.destination))) } label: {
        ZStack(alignment: .bottomLeading) {
          CityImage(code: trip.destination, pitched: true, size: CGSize(width: geometry.size.width, height: 250))
            .mask(LinearGradient(stops: [.init(color: .black, location: 0.35), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
          LinearGradient(colors: [.black.opacity(0.5), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.3))
          VStack(alignment: .leading, spacing: 4) {
            if let iso {
              Text(store.country(iso)).font(.caption).foregroundStyle(Ink.secondary)
            }
            Text(tripTitle(trip, store)).font(.large).lineLimit(1).minimumScaleFactor(0.7)
            Text(Format.span(trip.start, trip.end, lang)).font(.body).monospacedDigit().foregroundStyle(Ink.secondary)
          }
          .padding(.horizontal, 20)
          .padding(.bottom, 4)
          .frame(maxWidth: .infinity, alignment: .leading)
          .overlay(alignment: .bottomTrailing) {
            if let iso { CountryMark(iso: iso, size: 72, city: store.position(trip.destination)).padding(.trailing, 20).padding(.bottom, 6) }
          }
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
    }
    .frame(height: 250)
  }

  private func figures(_ trip: Trip) -> some View {
    let lang = store.lang
    var items: [(String, String)] = []
    items.append(trip.nights == 0 ? (lang.t("当天", "即日", "Same"), lang.t("往返", "往返", "day")) : (String(trip.nights), lang.t("晚", "晚", trip.nights == 1 ? "night" : "nights")))
    items.append((String(trip.flightIds.count), lang.t("段", "段", trip.flightIds.count == 1 ? "flight" : "flights")))
    items.append((Format.number(trip.km, lang), lang.t("公里", "公里", "km")))
    let hours = max(1, Format.hours(minutes: trip.minutes))
    items.append((String(hours), lang.t("小时在空中", "小時在空中", hours == 1 ? "hour aloft" : "hours aloft")))
    return FigureRow(items: items).padding(.horizontal, 20)
  }
}

// A row of figures: numbers clear, units quiet. The last one may be a phrase.
struct FigureRow: View {
  let items: [(String, String)]

  var body: some View {
    // One line if it fits, then one tighter line, and only then two lines.
    ViewThatFits(in: .horizontal) {
      HStack(alignment: .firstTextBaseline, spacing: 18) { cells(items, .title) }
      HStack(alignment: .firstTextBaseline, spacing: 11) { cells(items, .fp(19, .semibold, relativeTo: .title3)) }
      HStack(alignment: .firstTextBaseline, spacing: 9) { cells(items, .fp(17, .semibold, relativeTo: .headline)) }
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline, spacing: 18) { cells(Array(items.prefix(2)), .title) }
        HStack(alignment: .firstTextBaseline, spacing: 18) { cells(Array(items.dropFirst(2)), .title) }
      }
    }
  }

  private func cells(_ list: [(String, String)], _ font: Font) -> some View {
    ForEach(Array(list.enumerated()), id: \.offset) { _, item in
      HStack(alignment: .firstTextBaseline, spacing: 3) {
        Text(item.0).font(font).monospacedDigit()
        if !item.1.isEmpty { Text(item.1).font(.caption).foregroundStyle(Ink.tertiary) }
      }
      .fixedSize()
    }
  }
}

// One flight in a trip: the mark, the codes, the times, and its sky under it.
struct LegRow: View {
  @Environment(Store.self) private var store
  let flight: Flight
  var action: () -> Void

  var body: some View {
    let lang = store.lang
    Button(action: action) {
      HStack(alignment: .top, spacing: 14) {
        AirlineMark(code: flight.airline, size: 30).padding(.top, 2)
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline) {
            Text("\(flight.origin) → \(flight.destination)").font(.fp(20, .semibold, relativeTo: .title3)).monospacedDigit()
            Spacer(minLength: 8)
            Text(Format.date(flight.date, lang, year: false)).font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
          }
          Text(times).font(.caption).monospacedDigit().foregroundStyle(Ink.secondary)
          if let sky = store.sky(of: flight) {
            SkyStrip(sky: sky, minutes: flight.durationMinutes, height: 2).padding(.top, 4)
          }
        }
      }
      .padding(.vertical, 12)
      .contentShape(.rect)
    }
    .buttonStyle(Press())
  }

  private var times: String {
    let clock = flight.depart.isEmpty ? "" : "\(flight.depart) → \(flight.arrive)\(flight.arrivalDayOffset > 0 ? " +\(flight.arrivalDayOffset)" : "") · "
    return "\(flight.flight) · \(clock)\(Format.duration(minutes: flight.durationMinutes, store.lang))"
  }
}

// What happened between two flights: a connection, the nights of a stay, or
// a stretch on the ground. The nights are drawn, one point each.
struct GapRow: View {
  @Environment(Store.self) private var store
  let gap: Gap
  // The first and last day of a stay, when the flight on from it is known.
  var days: (String, String)?
  var openPlace: () -> Void

  var body: some View {
    Button(action: openPlace) {
      HStack(alignment: .center, spacing: 14) {
        marks.frame(width: 30)
        VStack(alignment: .leading, spacing: 8) {
          Text(text).font(.caption).foregroundStyle(gap.kind == "stay" ? Ink.secondary : Ink.tertiary)
          if gap.kind == "stay" && gap.nights > 0 {
            // The days as their weather once it has come, the nights until then
            // (and for good when offline or too far ahead).
            if let days, stayKeys.contains(where: { store.weather[$0] != nil }) {
              StayDays(code: gap.at, from: days.0, to: days.1)
            } else {
              nights
            }
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.vertical, gap.kind == "stay" ? 14 : 6)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .task(id: stayKeys) { store.want(weather: stayKeys) }
  }

  private var stayKeys: [String] {
    guard gap.kind == "stay", gap.nights > 0, let days, weatherReaches(days.1, now: store.now) else { return [] }
    return StayDays.days(days.0, days.1).map { weatherKey(gap.at, $0) }
  }

  private var marks: some View {
    VStack(spacing: 3) {
      ForEach(0..<(gap.kind == "stay" ? 5 : 3), id: \.self) { _ in
        Circle().fill(Ink.faint).frame(width: 2, height: 2)
      }
    }
  }

  private var nights: some View {
    let shown = min(gap.nights, 21)
    return HStack(spacing: 5) {
      ForEach(0..<shown, id: \.self) { _ in
        Image(systemName: "moon.fill").font(.fp(9)).foregroundStyle(Color(red: 0.62, green: 0.68, blue: 0.86).opacity(0.85))
      }
      if gap.nights > shown { Text("+\(gap.nights - shown)").font(.micro).foregroundStyle(Ink.tertiary) }
    }
    .accessibilityHidden(true)
  }

  private var text: String {
    let lang = store.lang, city = store.city(gap.at)
    switch gap.kind {
    case "connection":
      let wait = gap.minutes.map { Format.duration(minutes: $0, lang) } ?? ""
      return lang.t("\(city)转机\(wait.isEmpty ? "" : " · \(wait)")", "\(city)轉機\(wait.isEmpty ? "" : " · \(wait)")", "Connect in \(city)\(wait.isEmpty ? "" : " · \(wait)")")
    case "stay":
      if gap.nights == 0 { return lang.t("当天往返\(city)", "即日往返\(city)", "A day in \(city)") }
      return lang.t("在\(city)停留 \(gap.nights) 晚", "在\(city)停留 \(gap.nights) 晚", "\(gap.nights) \(gap.nights == 1 ? "night" : "nights") in \(city)")
    default:
      let to = store.city(gap.to)
      return lang.t("从\(city)经地面到\(to)", "從\(city)經地面到\(to)", "Overland from \(city) to \(to)")
    }
  }
}

func tripTitle(_ trip: Trip, _ store: Store) -> String {
  let city = store.city(trip.destination)
  return trip.kind == "move" ? store.lang.t("迁居\(city)", "遷居\(city)", "Moved to \(city)") : city
}

func tripFacts(_ trip: Trip, _ store: Store) -> String {
  let lang = store.lang
  let nights = trip.nights == 0 ? lang.t("当天", "即日", "Same day") : lang.t("\(trip.nights) 晚", "\(trip.nights) 晚", trip.nights == 1 ? "1 night" : "\(trip.nights) nights")
  let legs = lang.t("\(trip.flightIds.count) 段", "\(trip.flightIds.count) 段", trip.flightIds.count == 1 ? "1 flight" : "\(trip.flightIds.count) flights")
  let stays = trip.stays.filter { $0 != trip.destination }.map(store.city)
  let via = stays.isEmpty ? "" : " · " + lang.t("经", "經", "via ") + stays.joined(separator: lang.isChinese ? "、" : ", ")
  return "\(nights) · \(legs)\(via)"
}
