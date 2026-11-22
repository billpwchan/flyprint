import SwiftUI

// One field that finds a city, a flight or a trip by any name it goes by:
// 东京, 東京, Tokyo, NRT, JL 42, 2019. Before anything is typed, the trip
// coming up, the latest ones, then the cities this person flies to most.
struct SearchView: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  var pick: (Route) -> Void
  @State private var query = ""
  @FocusState private var focused: Bool
  @State private var scrolled = false

  var body: some View {
    let lang = store.lang
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 30) {
        let found = results
        if !found.coming.isEmpty { trips(found.coming, title: lang.t("接下来", "接下來", "Coming up")) }
        if !found.recent.isEmpty { trips(found.recent, title: lang.t("最近", "最近", "Recent")) }
        if !found.cities.isEmpty { cities(found.cities, title: query.isEmpty ? lang.t("常去的城市", "常去的城市", "Where you go most") : lang.t("城市", "城市", "Cities")) }
        if !found.trips.isEmpty { trips(found.trips, title: lang.t("旅程", "旅程", "Trips")) }
        if !found.flights.isEmpty {
          VStack(alignment: .leading, spacing: 4) {
            SectionTitle(text: lang.t("航班", "航班", "Flights"))
            ForEach(found.flights) { flight in LegRow(flight: flight) { pick(.flight(flight.id)) } }
          }
        }
        if !query.isEmpty && found.isEmpty {
          Text(lang.t("没有找到", "沒有找到", "Nothing found")).font(.body).foregroundStyle(Ink.tertiary)
        }
        if !found.cities.isEmpty || !found.trips.isEmpty || !found.recent.isEmpty { ImageryCredit() }
      }
      .padding(.horizontal, 20)
      .padding(.top, 4)
      .padding(.bottom, 40)
    }
    .scrollIndicators(.hidden)
    .scrollDismissesKeyboard(.immediately)
    .scrolledOffTop($scrolled)
    .safeAreaInset(edge: .top, spacing: 0) {
      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass").font(.fp(16, .medium)).foregroundStyle(Ink.tertiary)
        TextField("", text: $query, prompt: Text(lang.t("城市、机场、航班号、年份", "城市、機場、航班號、年份", "City, airport, flight, year")).foregroundStyle(Ink.tertiary))
          .font(.fp(17, relativeTo: .body))
          .foregroundStyle(Ink.primary)
          .focused($focused)
          .submitLabel(.search)
          .autocorrectionDisabled()
          .textInputAutocapitalization(.characters)
        Button(lang.t("取消", "取消", "Cancel")) { dismiss() }
          .font(.body).foregroundStyle(Ink.secondary).buttonStyle(.plain)
      }
      .padding(.horizontal, 20)
      .padding(.top, 22)
      .padding(.bottom, 14)
      .background { EdgeBackdrop().opacity(scrolled ? 1 : 0) }
    }
    .presentationDetents([.large])
    .presentationBackground { SheetGround() }
    .presentationDragIndicator(.visible)
    .onAppear { focused = true }
  }

  private func trips(_ trips: [Trip], title: String) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      SectionTitle(text: title)
      ForEach(trips) { trip in TripLink(trip: trip) { pick(.trip(trip.id)) } }
    }
  }

  private func cities(_ metros: [String], title: String) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionTitle(text: title)
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
        ForEach(metros, id: \.self) { metro in
          Button { pick(.place(metro)) } label: {
            CityCard(metro: metro, width: (UIScreen.main.bounds.width - 52) / 2)
          }
          .buttonStyle(Press())
        }
      }
    }
  }

  private struct Found {
    var coming: [Trip] = []
    var recent: [Trip] = []
    var cities: [String] = []
    var trips: [Trip] = []
    var flights: [Flight] = []
    var isEmpty: Bool { cities.isEmpty && trips.isEmpty && flights.isEmpty }
  }

  private var results: Found {
    let all = store.allInOrder
    var visits: [String: Int] = [:]
    for flight in all { visits[metroOf(flight.origin), default: 0] += 1; visits[metroOf(flight.destination), default: 0] += 1 }
    let ranked = visits.sorted { $0.value > $1.value || ($0.value == $1.value && $0.key < $1.key) }.map(\.key)
    let text = query.trimmingCharacters(in: .whitespaces)
    guard !text.isEmpty else {
      // Trips are newest first; the nearest of those still to come leads.
      let open = store.trips.filter { trip in store.legs(of: trip).contains { !$0.hasLanded(at: store.now) } }
      let openIDs = Set(open.map(\.id))
      return Found(coming: Array(open.suffix(1)), recent: Array(store.trips.filter { !openIDs.contains($0.id) }.prefix(3)), cities: Array(ranked.prefix(8)))
    }
    let needle = text.lowercased()
    let compact = needle.replacingOccurrences(of: " ", with: "")

    let cities = ranked.filter { metro in
      store.airports(in: metro).contains { code in
        guard let place = store.place(code) else { return false }
        let names = place.city + place.name + (store.archive.countries[place.country] ?? []) + [code, metro, place.country]
        return names.contains { $0.lowercased().contains(needle) }
      }
    }
    let metros = Set(cities)
    let trips = store.trips.filter { metros.contains(metroOf($0.destination)) || $0.start.hasPrefix(text) }
      .sorted { $0.start > $1.start }
    let flights = all.reversed().filter { flight in
      flight.flight.lowercased().replacingOccurrences(of: " ", with: "").contains(compact)
        || "\(flight.origin)\(flight.destination)".lowercased().contains(compact)
        || flight.aircraft?.registration?.lowercased() == needle
    }
    return Found(cities: Array(cities.prefix(6)), trips: Array(trips.prefix(8)), flights: Array(flights.prefix(20)))
  }
}
