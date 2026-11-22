import SwiftUI

// The sheet's first level in three parts, the way Flighty splits its own:
// the trips (where this person went), the flights one by one, and the
// footprint (how much, how far, which places). The year dial at the top is
// shared, so changing part keeps the year; search sits beside the parts.
enum HomeTab: String, CaseIterable, Identifiable {
  case trips, flights, footprint

  var id: String { rawValue }

  var symbol: String {
    switch self {
    case .trips: "suitcase.fill"
    case .flights: "airplane"
    case .footprint: "globe.asia.australia.fill"
    }
  }

  func title(_ lang: Lang) -> String {
    switch self {
    case .trips: lang.t("旅程", "旅程", "Trips")
    case .flights: lang.t("航班", "航班", "Flights")
    case .footprint: lang.t("足迹", "足跡", "Footprint")
    }
  }
}

struct HomeView: View {
  @Environment(Store.self) private var store
  @Environment(Navigator.self) private var navigator
  @Binding var tab: HomeTab
  @Binding var year: Int?
  var open: (Route) -> Void
  var show: (Route?) -> Void
  var start: () -> Void
  var importFlights: () -> Void
  var search: () -> Void
  // How much of what lies under the dial to show: none at the lowest detent.
  var reveal: Double = 1
  @State private var scrolled = false

  var body: some View {
    Group {
      switch tab {
      case .trips:
        OverviewView(year: $year, open: open, start: start, importFlights: importFlights, reveal: reveal, scrolled: $scrolled) { select(.footprint) }
      case .flights:
        FlightsTab(year: year, open: open, reveal: reveal, scrolled: $scrolled)
      case .footprint:
        FootprintTab(year: $year, open: open, reveal: reveal, scrolled: $scrolled)
      }
    }
    .safeAreaInset(edge: .top, spacing: 0) { dial }
    .safeAreaInset(edge: .bottom, spacing: 0) { TabBar(tab: $tab, search: search) }
    .onAppear { show(nil) }
    // Each part opens at its top, so the dial's backdrop starts clear.
    .onChange(of: tab) { scrolled = false }
  }

  private func select(_ next: HomeTab) {
    withAnimation(.snappy(duration: 0.25)) { tab = next }
  }

  @ViewBuilder private var dial: some View {
    if !store.years.isEmpty {
      YearDial(years: store.years, year: $year)
        .overlay(alignment: .bottomTrailing) { share }
        .background { EdgeBackdrop().opacity(scrolled ? 1 : 0) }
    }
  }

  // The year in view (or every year) as a card to send, from the dial's quiet end.
  @ViewBuilder private var share: some View {
    if !store.landed(in: year).isEmpty {
      Button { navigator.sharing = .year(year) } label: {
        Image(systemName: "square.and.arrow.up").font(.fp(15, .semibold)).foregroundStyle(Ink.secondary)
          .frame(width: 44, height: 44).contentShape(.rect)
      }
      .buttonStyle(Press())
      .padding(.trailing, 10)
      .accessibilityLabel(Text(store.lang.t("分享图片", "分享圖片", "Share image")))
    }
  }
}

// The parts as one dark capsule, the chosen one lifted; search as its own
// round button beside it, the way iOS sets a search tab apart.
struct TabBar: View {
  @Environment(Store.self) private var store
  @Binding var tab: HomeTab
  var search: () -> Void
  @Namespace private var selection

  var body: some View {
    HStack(spacing: 10) {
      HStack(spacing: 0) {
        ForEach(HomeTab.allCases) { item in
          Button {
            withAnimation(.snappy(duration: 0.28)) { tab = item }
          } label: {
            VStack(spacing: 3) {
              Image(systemName: item.symbol).font(.fp(17, .medium)).frame(height: 20)
              Text(item.title(store.lang)).font(.fp(10, .semibold, relativeTo: .caption2))
            }
            .foregroundStyle(tab == item ? Ink.primary : Ink.tertiary)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background {
              if tab == item {
                Capsule().fill(Color.white.opacity(0.11)).matchedGeometryEffect(id: "tab", in: selection)
              }
            }
            .contentShape(.capsule)
          }
          .buttonStyle(Press())
          .accessibilityAddTraits(tab == item ? .isSelected : [])
        }
      }
      .padding(4)
      .background(Capsule().fill(Color.white.opacity(0.06)))
      Button(action: search) {
        Image(systemName: "magnifyingglass").font(.fp(18, .semibold)).foregroundStyle(Ink.primary)
          .frame(width: 56, height: 56)
          .background(Circle().fill(Color.white.opacity(0.06)))
          .contentShape(.circle)
      }
      .buttonStyle(Press())
      .accessibilityLabel(store.lang.t("搜索", "搜尋", "Search"))
    }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .padding(.bottom, 2)
    .background { BottomBackdrop() }
  }
}

// Every flight, the coming ones first, then the flown ones by month, newest
// first: for finding the one flown in some March, or checking the next one.
struct FlightsTab: View {
  @Environment(Store.self) private var store
  let year: Int?
  var open: (Route) -> Void
  var reveal: Double = 1
  @Binding var scrolled: Bool

  var body: some View {
    let lang = store.lang
    let ahead = store.ahead.filter { year == nil || $0.year == year }
    let flown = store.landed(in: year).sorted { ($0.date, $0.depart) > ($1.date, $1.depart) }
    let months = Dictionary(grouping: flown) { String($0.date.prefix(7)) }.sorted { $0.key > $1.key }
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        if !ahead.isEmpty {
          header(lang.t("接下来", "接下來", "Coming up"), count: ahead.count)
          ForEach(ahead) { flight in LogRow(flight: flight) { open(.flight(flight.id)) } }
        }
        ForEach(months, id: \.key) { month in
          header(Format.month("\(month.key)-01", lang), count: month.value.count)
          ForEach(month.value) { flight in LogRow(flight: flight) { open(.flight(flight.id)) } }
        }
        if ahead.isEmpty && flown.isEmpty {
          Text(lang.t("还没有航班", "還沒有航班", "No flights yet")).font(.body).foregroundStyle(Ink.secondary).padding(.top, 20)
        }
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 40)
      .opacity(reveal)
    }
    .scrollIndicators(.hidden)
    .scrolledOffTop($scrolled)
    .debugScroll()
  }

  private func header(_ title: String, count: Int) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title).font(.headline).monospacedDigit()
      Spacer()
      Text(String(count)).font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
    }
    .padding(.top, 22)
    .padding(.bottom, 4)
  }
}

// A flight in the list: its airline's mark, the cities, the codes and times,
// and the sky it flew through. A coming one shows how long until it leaves.
struct LogRow: View {
  @Environment(Store.self) private var store
  let flight: Flight
  var action: () -> Void

  var body: some View {
    let lang = store.lang
    Button(action: action) {
      HStack(alignment: .top, spacing: 14) {
        AirlineMark(code: flight.airline, size: 28).padding(.top, 2)
        VStack(alignment: .leading, spacing: 4) {
          HStack(alignment: .firstTextBaseline) {
            Text("\(store.city(flight.origin)) → \(store.city(flight.destination))").font(.headline).lineLimit(1)
            Spacer(minLength: 8)
            TimelineView(.periodic(from: .now, by: 60)) { context in
              if let countdown = flightCountdown(flight, at: context.date, lang) {
                Text(countdown).font(.captionStrong).monospacedDigit().foregroundStyle(store.tone)
              } else {
                Text(Format.date(flight.date, lang, year: false)).font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
              }
            }
          }
          Text(detail).font(.caption).monospacedDigit().foregroundStyle(Ink.secondary).lineLimit(1)
          if let sky = store.sky(of: flight) {
            SkyStrip(sky: sky, minutes: flight.durationMinutes, height: 2).padding(.top, 5)
          }
        }
      }
      .padding(.vertical, 11)
      .contentShape(.rect)
    }
    .buttonStyle(Press())
  }

  private var detail: String {
    let clock = flight.depart.isEmpty ? "" : " · \(flight.depart) → \(flight.arrive)\(flight.arrivalDayOffset > 0 ? " +\(flight.arrivalDayOffset)" : "")"
    return "\(flight.origin) → \(flight.destination) · \(flight.flight)\(clock)"
  }
}
