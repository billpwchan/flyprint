import SwiftUI

// Flights side by side in the order they were flown: swipe to the one before
// or after, and the globe flies along.
struct FlightPager: View {
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
    let ids = store.allInOrder.map(\.id)
    let index = ids.firstIndex(of: current) ?? 0
    Pager(ids: ids, selection: $current) { id in
      FlightPage(id: id, open: open)
    }
    .overlay(alignment: .top) {
      PageBar(route: route, title: store.flightsByID[current].map { "\($0.origin) → \($0.destination)" }, position: (index, ids.count), counted: false, share: { navigator.sharing = .flight(current) }) { delta in
        if ids.indices.contains(index + delta) { current = ids[index + delta] }
      }
    }
    .environment(\.pageScroll, scroll)
    .onAppear { show(.flight(current)); place = index }
    .onChange(of: current) { show(.flight(current)); if let found = ids.firstIndex(of: current) { place = found } }
    // The one on screen was deleted or merged elsewhere: stay where it stood.
    .onChange(of: ids) {
      guard !ids.contains(current), !ids.isEmpty else { return }
      current = ids[min(place, ids.count - 1)]
    }
  }
}

// One flight, shown as itself: an airport board, the sky it flew through, the
// aircraft, and every other time this person flew the route.
struct FlightPage: View {
  @Environment(Store.self) private var store
  @Environment(Navigator.self) private var navigator
  let id: String
  var open: (Route) -> Void

  var body: some View {
    if let flight = store.flightsByID[id] {
      ScrollView {
        VStack(alignment: .leading, spacing: 30) {
          header(flight)
          board(flight)
          FlightWeather(flight: flight)
          if !store.isSample && flight.side != "them" && !flight.hasLanded(at: store.now) { AheadActions(flight: flight) }
          if let aircraft = flight.aircraft { AircraftSection(flight: flight, aircraft: aircraft) }
          RouteHistory(flight: flight)
          if let trip = store.trip(of: flight), trip.flightIds.count > 1 {
            TripLink(trip: trip, label: store.lang.t("所在旅程", "所在旅程", "Part of")) { open(.trip(trip.id)) }
          }
          // Only the reader's own flights; a linked person's are theirs to change.
          if !store.isSample && flight.side != "them" {
            Button { navigator.editing = .edit(flight.id) } label: {
              HStack(spacing: 8) {
                Image(systemName: "pencil").font(.fp(14, .medium))
                Text(store.lang.t("修改或删除这段航班", "修改或刪除這段航班", "Edit or delete this flight")).font(.body)
              }
              .foregroundStyle(Ink.secondary)
              .frame(minHeight: 44)
              .contentShape(.rect)
            }
            .buttonStyle(Press())
          }
        }
        .padding(.horizontal, 20)
        .padding(.top, pageBarHeight + 8)
        .padding(.bottom, 40)
        .background(alignment: .top) { glow(flight) }
      }
      .scrollIndicators(.hidden)
      .reportsPageScroll(titleAfter: 120)
    }
  }

  // The airline's colour, faintly, where its name is.
  private func glow(_ flight: Flight) -> some View {
    RadialGradient(colors: [(Livery.color(flight.airline) ?? store.tone).opacity(0.22), .clear],
                   center: UnitPoint(x: 0.12, y: 0.12), startRadius: 0, endRadius: 320)
      .frame(height: 360)
      .padding(.horizontal, -20)
      .allowsHitTesting(false)
  }

  private func header(_ flight: Flight) -> some View {
    let lang = store.lang
    let day = lang.isChinese ? "\(Format.date(flight.date, lang)) \(Format.weekday(flight.date, lang))" : "\(Format.weekday(flight.date, lang)) \(Format.date(flight.date, lang))"
    return HStack(alignment: .center, spacing: 12) {
      AirlineMark(code: flight.airline, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(flight.flight).font(.title).monospacedDigit()
        Text("\(store.carrier(flight.airline)) · \(day)").font(.caption).foregroundStyle(Ink.secondary).lineLimit(1).minimumScaleFactor(0.85)
      }
      Spacer(minLength: 8)
      TimelineView(.periodic(from: .now, by: 30)) { context in
        if let countdown = flightCountdown(flight, at: context.date, lang) {
          Text(countdown).font(.bodyStrong).monospacedDigit().foregroundStyle(store.tone)
        } else if let n = store.ordinal(of: flight) {
          Text(lang.t("第 \(n) 次飞行", "第 \(n) 次飛行", "Flight \(n)")).font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
        }
      }
    }
  }

  // Like a departures board: the codes and local times largest, the cities
  // under them; between them the flight's own sky.
  private func board(_ flight: Flight) -> some View {
    let lang = store.lang
    let sky = store.sky(of: flight)
    let landed = flight.hasLanded(at: store.now)
    return VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .top) {
        end(flight.origin, flight.depart, alignment: .leading)
        Spacer(minLength: 12)
        end(flight.destination, flight.arrive, alignment: .trailing, dayOffset: flight.arrivalDayOffset)
      }
      VStack(spacing: 8) {
        Text("\(Format.duration(minutes: flight.durationMinutes, lang)) · \(lang.t("\(Format.number(flight.km, lang)) 公里", "\(Format.number(flight.km, lang)) 公里", "\(Format.number(flight.km, lang)) km"))")
          .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
          .frame(maxWidth: .infinity)
        if let sky {
          SkyStrip(sky: sky, minutes: flight.durationMinutes, height: 4, glow: true,
                   progress: flight.isAirborne(at: store.now) ? flight.progress(at: store.now) : nil)
        } else {
          Capsule().fill(store.tone.opacity(0.6)).frame(height: 2)
        }
      }
      let lines = [sky.flatMap(store.skyLine), landed ? nil : sky.flatMap { store.seatLine($0, flight) }, seat(flight), together(flight)].compactMap { $0 }
      if !lines.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(lines, id: \.self) { Text($0).font(.caption).foregroundStyle(Ink.secondary) }
        }
      }
    }
  }

  private func end(_ code: String, _ time: String, alignment: HorizontalAlignment, dayOffset: Int = 0) -> some View {
    Button { open(.place(metroOf(code))) } label: {
      VStack(alignment: alignment, spacing: 2) {
        Text(code).font(.display).monospacedDigit().tracking(-0.5)
        Text(store.city(code)).font(.body).foregroundStyle(Ink.secondary).lineLimit(1)
        if !time.isEmpty {
          HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(time).font(.fp(22, .medium, relativeTo: .title2)).monospacedDigit()
            if dayOffset != 0 { Text(dayOffset > 0 ? "+\(dayOffset)" : "\(dayOffset)").font(.captionStrong).foregroundStyle(Ink.tertiary) }
          }
          .padding(.top, 6)
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(Press())
  }

  private func seat(_ flight: Flight) -> String? {
    guard let seat = flight.seat, !seat.isEmpty else { return nil }
    let lang = store.lang
    return lang.t("座位 \(seat)", "座位 \(seat)", "Seat \(seat)") + (flight.cabin.map { " · \($0)" } ?? "")
  }

  private func together(_ flight: Flight) -> String? {
    let names = (flight.with ?? []).compactMap { id in store.archive.links.first { $0.id == id }?.name }
    guard !names.isEmpty else { return nil }
    let list = names.joined(separator: store.lang.isChinese ? "、" : ", ")
    return store.lang.t("与 \(list) 同飞", "與 \(list) 同飛", "With \(list)")
  }
}

// The aircraft as itself: the very airframe when it is known, the type drawn
// to scale otherwise; then what it means for this person.
struct AircraftSection: View {
  @Environment(Store.self) private var store
  let flight: Flight
  let aircraft: Aircraft

  var body: some View {
    let lang = store.lang
    let icao = aircraft.icao.uppercased()
    let flown = store.flown
    let landed = flight.hasLanded(at: store.now)
    let onType = flown.filter { $0.aircraft?.icao.uppercased() == icao }.count
    let before = landed ? Array(flown.prefix { $0.id != flight.id }) : flown
    let firstOfType = (aircraft.source == "operated" || !landed) && !before.contains { $0.aircraft?.icao.uppercased() == icao }
    let basis = switch aircraft.source {
    case "operated": lang.t("实际执飞", "實際執飛", "As flown")
    case "scheduled": lang.t("计划机型", "計劃機型", "Scheduled aircraft")
    default: lang.t("这条航线的常用机型", "這條航線的常用機型", "Usual aircraft on this route")
    }
    let history = firstOfType ? lang.t("第一次坐这个机型", "第一次坐這款機型", "First time on this type")
      : lang.t("坐过这个机型 \(onType) 次", "坐過這款機型 \(onType) 次", onType == 1 ? "Your only flight on this type" : "\(onType) flights on this type")
    VStack(alignment: .leading, spacing: 14) {
      if let registration = aircraft.registration, !registration.isEmpty {
        AirframePhoto(registration: registration)
      }
      if Fleet.canDraw(icao) {
        AircraftProfile(icao: icao, tentative: aircraft.source == "typical")
      }
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline) {
          Text(Fleet.localModel(aircraft.model, lang)).font(.headline)
          Spacer(minLength: 8)
          if let registration = aircraft.registration, !registration.isEmpty {
            Text(registration).font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
          }
        }
        Text("\(basis) · \(history)").font(.caption).foregroundStyle(Ink.secondary)
        if let operation = flight.operation {
          Text(lang.t("由\(store.carrier(operation.airline)) \(operation.flight) 实际承运", "由\(store.carrier(operation.airline)) \(operation.flight) 實際承運", "Operated by \(store.carrier(operation.airline)) as \(operation.flight)"))
            .font(.caption).foregroundStyle(Ink.secondary)
        }
      }
    }
  }
}

// Every time this person flew between these two cities, on a line through
// the years; this flight is the bright one.
struct RouteHistory: View {
  @Environment(Store.self) private var store
  let flight: Flight

  var body: some View {
    let lang = store.lang
    let all = store.route(of: flight)
    let index = all.firstIndex { $0.id == flight.id } ?? 0
    let first = all.first?.date ?? flight.date
    let last = max(all.last?.date ?? flight.date, flight.date)
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text("\(store.city(flight.origin)) — \(store.city(flight.destination))").font(.headline).lineLimit(1)
        Spacer(minLength: 8)
        Text(all.count == 1 ? lang.t("只飞过这一次", "只飛過這一次", "The only time")
             : lang.t("第 \(index + 1) 次，共 \(all.count) 次", "第 \(index + 1) 次，共 \(all.count) 次", "\(ordinal(index + 1)) of \(all.count)"))
          .font(.caption).monospacedDigit().foregroundStyle(Ink.secondary)
      }
      if all.count > 1 {
        let start = Format.day(first)?.timeIntervalSince1970 ?? 0
        let end = Format.day(last)?.timeIntervalSince1970 ?? 1
        VStack(spacing: 6) {
          GeometryReader { geometry in
            let width = geometry.size.width
            ZStack(alignment: .leading) {
              Capsule().fill(Ink.faint.opacity(0.5)).frame(height: 1)
              ForEach(all) { item in
                let t = end > start ? ((Format.day(item.date)?.timeIntervalSince1970 ?? start) - start) / (end - start) : 0.5
                let current = item.id == flight.id
                let outbound = item.origin == flight.origin
                Circle()
                  .fill(current ? store.tone : (outbound ? Ink.secondary : Ink.tertiary))
                  .frame(width: current ? 9 : 5, height: current ? 9 : 5)
                  .shadow(color: current ? store.tone.opacity(0.8) : .clear, radius: 5)
                  .offset(x: width * t - (current ? 4.5 : 2.5))
              }
            }
            .frame(height: 12)
          }
          .frame(height: 12)
          HStack {
            Text(String(first.prefix(4)))
            Spacer()
            Text(String(last.prefix(4)))
          }
          .font(.micro).monospacedDigit().foregroundStyle(Ink.tertiary)
        }
      }
    }
    .accessibilityElement(children: .combine)
  }

  private func ordinal(_ n: Int) -> String {
    let suffix = (11...13).contains(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10 < 4 ? n % 10 : 0]
    return "\(n)\(suffix)"
  }
}

// A trip as a link: its place from above, its name and span.
struct TripLink: View {
  @Environment(Store.self) private var store
  let trip: Trip
  var label: String?
  // On a city's own page its name would repeat on every row; there the
  // month leads instead.
  var within: String? = nil
  var action: () -> Void

  var body: some View {
    let title = tripTitle(trip, store)
    let here = within.map { store.cityName($0) == title } ?? false
    Button(action: action) {
      HStack(spacing: 14) {
        CityImage(code: trip.destination, size: CGSize(width: 56, height: 56))
          .clipShape(.rect(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 3) {
          if let label { Text(label).font(.caption).foregroundStyle(Ink.tertiary) }
          Text(here ? Format.month(trip.start, store.lang) : title).font(.headline).monospacedDigit()
          Text(here ? "\(Format.span(trip.start, trip.end, store.lang, year: false)) · \(tripFacts(trip, store))" : "\(Format.span(trip.start, trip.end, store.lang)) · \(tripFacts(trip, store))")
            .font(.caption).monospacedDigit().foregroundStyle(Ink.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.captionStrong).foregroundStyle(Ink.faint)
      }
      .contentShape(.rect)
    }
    .buttonStyle(Press())
  }
}

// An airline's mark from the same set the web uses; its code when there is none.
struct AirlineMark: View {
  let code: String
  var size: CGFloat = 24

  var body: some View {
    if let image = AirlineMark.image(code) {
      Image(uiImage: image)
        .resizable()
        .interpolation(.high)
        .scaledToFit()
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    } else {
      Text(code)
        .font(.system(size: size * 0.42, weight: .semibold))
        .foregroundStyle(Ink.secondary)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
  }

  private static var cache: [String: UIImage] = [:]
  static func image(_ code: String) -> UIImage? {
    if let image = cache[code] { return image }
    guard let url = Bundle.main.url(forResource: code, withExtension: "webp", subdirectory: "airlines"),
          let image = UIImage(contentsOfFile: url.path) else { return nil }
    cache[code] = image
    return image
  }
}
