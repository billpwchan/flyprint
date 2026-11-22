import SwiftUI
import simd

enum Route: Hashable {
  case trip(String)
  case flight(String)
  case place(String)

  var kind: Int {
    switch self {
    case .trip: 0
    case .flight: 1
    case .place: 2
    }
  }
}

// The pages in the sheet. Going into something adds a page; moving sideways
// (a neighbour, another city picked on the globe) swaps the page in view, so
// back is always one step to where the reader came from.
@Observable
final class Navigator {
  var path: [Route] = []
  // A flight being added or put right, in a sheet over the pages.
  var editing: EditorTarget?
  // A card of a year, trip or flight, shown before it is shared.
  var sharing: CardRequest?

  func open(_ route: Route) { path.append(route) }

  // Picked on the globe: the same kind of page swaps, anything else opens on top.
  func pick(_ route: Route) {
    if let top = path.last, top.kind == route.kind { path[path.count - 1] = route } else { path.append(route) }
  }

  // Found by search: straight there, with the overview behind it.
  func go(_ route: Route) { path = [route] }

  func pop(to count: Int) { path = Array(path.prefix(max(0, count))) }

  // After the archive changes: pages whose subject is gone close, the rest stay.
  // After the archive changes: each page follows its object (a renamed trip
  // to its new name); the path is cut at the first page whose object is gone.
  func repair(_ follow: (Route) -> Route?) {
    var kept: [Route] = []
    for route in path {
      guard let next = follow(route) else { break }
      kept.append(next)
    }
    if kept != path { path = kept }
  }
}

// One globe and one sheet. The sheet holds the pages; whatever page is on top
// tells the globe what to light and where to look.
struct RootView: View {
  @Environment(Store.self) private var store
  @Environment(\.scenePhase) private var phase
  @State private var navigator = Navigator()
  // The page in view, which a sideways swipe can change without pushing.
  @State private var shown: Route?
  @State private var year: Int?
  @State private var tab: HomeTab = .trips
  @State private var detent: PresentationDetent = Detents.middle
  @State private var sheetHeight: CGFloat = 360
  @State private var settings = false
  @State private var importing = false
  // Signed out: the welcome, unless the reader chose to look around the sample.
  @State private var exploring = false
  @State private var beat = 0
  @State private var authPath: [AuthMode] = []
  // The reader turned the globe away from what the page framed; one tap flies back.
  @State private var drifted = false
  @State private var recentreKey = 0
  @State private var searching = false
  @State private var revealKey = 0

  var body: some View {
    GeometryReader { geometry in
      GlobeView(scene: welcoming ? welcomeScene : scene,
                insets: EdgeInsets(top: geometry.safeAreaInsets.top + 48, leading: 0, bottom: welcoming ? welcomeCover(geometry.size.height) : sheetHeight, trailing: 0),
                onSelect: welcoming ? { _ in } : pick,
                onDrift: { drifted = $0 })
        .ignoresSafeArea()
    }
    .background(Palette.color(Palette.space))
    .overlay {
      if welcoming {
        WelcomeView(beat: $beat, path: $authPath) { withAnimation(.easeOut(duration: 0.3)) { exploring = true } }
          .transition(.opacity)
      }
    }
    .overlay(alignment: .topTrailing) {
      if !welcoming {
      VStack(alignment: .trailing, spacing: 4) {
        HStack(spacing: 2) {
          if !store.isSample {
            Menu {
              Button { navigator.editing = .add } label: {
                Label(store.lang.t("添加一段航班", "新增一段航班", "Add a flight"), systemImage: "square.and.pencil")
              }
              if FlightEditor.canScan {
                Button { navigator.editing = .scan } label: {
                  Label(store.lang.t("扫登机牌", "掃登機證", "Scan a boarding pass"), systemImage: "barcode.viewfinder")
                }
              }
              Button { importing = true } label: {
                Label(store.lang.t("导入截图、文件或行程单", "匯入截圖、檔案或行程單", "Import screenshots, files or itineraries"), systemImage: "tray.and.arrow.down")
              }
            } label: {
              SceneIcon(symbol: "plus")
            }
            .accessibilityLabel(store.lang.t("添加航班", "新增航班", "Add flights"))
          }
          SceneButton(symbol: store.isSample ? "person.crop.circle" : "person.crop.circle.fill",
                      label: store.isSample ? store.lang.t("登录", "登入", "Sign in") : store.lang.t("设置", "設定", "Settings")) {
            if store.isSample { leaveSample(to: []) } else { settings = true }
          }
        }
        // Where Maps keeps it: under the controls, only once the globe has been turned away.
        if drifted {
          SceneButton(symbol: "scope", label: store.lang.t("回到原来的视角", "回到原來的視角", "Back to the view")) { recentreKey += 1 }
            .transition(.opacity.combined(with: .scale(scale: 0.85, anchor: .top)))
        }
      }
      .animation(.easeOut(duration: 0.2), value: drifted)
      .padding(.trailing, 10)
      .transition(.opacity)
      }
    }
    .sheet(isPresented: Binding(get: { !welcoming }, set: { _ in })) {
      @Bindable var navigator = navigator
      NavigationStack(path: $navigator.path) {
        HomeView(tab: $tab, year: $year, open: open, show: show, start: { leaveSample(to: [.signUp]) }, importFlights: { importing = true },
                 search: { searching = true }, reveal: min(1.0, max(0.0, Double(sheetHeight - Detents.peekHeight - 40) / 70.0)))
          .toolbar(.hidden, for: .navigationBar)
          .containerBackground(.clear, for: .navigation)
          .navigationDestination(for: Route.self) { route in
            page(route)
              .toolbar(.hidden, for: .navigationBar)
              .containerBackground(.clear, for: .navigation)
          }
      }
      .environment(navigator)
      .environment(\.pageTitles, [overviewTitle] + navigator.path.map(title))
      .presentationDetents([Detents.peek, Detents.middle, .large], selection: $detent)
      .presentationBackgroundInteraction(.enabled(upThrough: Detents.middle))
      .presentationBackground { SheetGround() }
      .presentationDragIndicator(.visible)
      .presentationContentInteraction(.scrolls)
      .interactiveDismissDisabled()
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { sheetHeight = $0 }
      .sheet(isPresented: $settings) { SettingsView().environment(store) }
      .sheet(isPresented: $importing) { ImportView().environment(store) }
      .sheet(item: $navigator.editing) { target in
        FlightEditor(target: target) { outcome in edited(outcome) }.environment(store)
      }
      .sheet(item: $navigator.sharing) { request in CardSheet(request: request).environment(store) }
      .sheet(isPresented: $searching) {
        SearchView { route in
          searching = false
          navigator.go(route)
          if detent == Detents.peek { detent = Detents.middle }
        }
        .environment(store)
      }
    }
    .onChange(of: year) { revealKey += 1 }
    .onChange(of: store.isSample) {
      guard !store.isSample else { return }
      authPath = []
      exploring = false
      // Signed in with nothing logged yet: the next thing to do is bring flights in.
      if store.archive.flights.isEmpty {
        Task { try? await Task.sleep(for: .milliseconds(700)); importing = true }
      }
    }
    .onChange(of: store.revision) {
      navigator.repair(follow)
      if let year, !store.years.contains(year) { self.year = nil }
      if let shown { self.shown = follow(shown) }
      revealKey += 1
    }
    .onChange(of: phase) { if phase == .active { store.now = Date() } }
    // Reminders follow the flights and the language as they are now.
    .task(id: "\(store.revision)-\(store.lang)-\(store.isSample)") { await Reminders.schedule(store) }
    #if DEBUG
    .task { launchState() }
    #endif
  }

  @ViewBuilder
  private func page(_ route: Route) -> some View {
    switch route {
    case .trip(let id): TripPager(route: route, start: id, open: open, show: show)
    case .flight(let id): FlightPager(route: route, start: id, open: open, show: show)
    case .place(let metro): PageHost(route: route, title: store.cityName(metro)) { PlaceView(metro: metro, open: open) }
        .onAppear { show(route) }
    }
  }

  // Where a page's back button leads: the part of the sheet it was opened from.
  private var overviewTitle: String { tab.title(store.lang) }

  private func title(of route: Route) -> String {
    switch route {
    case .trip(let id): store.tripsByID[id].map { tripTitle($0, store) } ?? ""
    case .flight(let id): store.flightsByID[id]?.flight ?? ""
    case .place(let metro): store.cityName(metro)
    }
  }

  #if DEBUG
  // Screenshot states from launch arguments, e.g. -fp.route trip#3 -fp.detent large.
  private func launchState() {
    let defaults = UserDefaults.standard
    // Asking for a page or a sheet height means the sample, not the welcome.
    if ["fp.route", "fp.detent", "fp.year", "fp.tab"].contains(where: { defaults.string(forKey: $0) != nil }) { exploring = true }
    if let value = defaults.string(forKey: "fp.beat"), let chosen = Int(value) { beat = chosen }
    if let value = defaults.string(forKey: "fp.year"), let chosen = Int(value) { year = chosen }
    if let value = defaults.string(forKey: "fp.tab"), let chosen = HomeTab(rawValue: value) { tab = chosen }
    switch defaults.string(forKey: "fp.detent") {
    case "peek": detent = Detents.peek
    case "large": detent = .large
    default: break
    }
    if let route = defaults.string(forKey: "fp.route") {
      let trips = store.trips(in: year)
      if route.hasPrefix("trip#"), let n = Int(route.dropFirst(5)), trips.indices.contains(n) { navigator.path = [.trip(trips[n].id)] }
      if route == "flight#next", let next = store.ahead.first { navigator.path = [.flight(next.id)] }
      if route.hasPrefix("flight#"), let n = Int(route.dropFirst(7)) {
        let landed = store.landed(in: year).sorted { ($0.date, $0.depart) > ($1.date, $1.depart) }
        if landed.indices.contains(n) { navigator.path = [.flight(landed[n].id)] }
      }
      if route.hasPrefix("place#") { navigator.path = [.place(String(route.dropFirst(6)))] }
      if route == "records" { tab = .footprint }
    }
    switch defaults.string(forKey: "fp.sheet") {
    case "account": settings = true
    case "welcome": exploring = false
    case "signin": authPath = [.signIn]
    case "signup": authPath = [.signUp]
    case "import": importing = true
    case "search": searching = true
    default: break
    }
    if let share = defaults.string(forKey: "fp.share") {
      if share == "year" { navigator.sharing = .year(year) }
      if share == "trip", case .trip(let id)? = navigator.path.last { navigator.sharing = .trip(id) }
      if share == "flight", case .flight(let id)? = navigator.path.last { navigator.sharing = .flight(id) }
    }
    if let card = defaults.string(forKey: "fp.card") { Task { await CardProof.write(card, store: store) } }
  }
  #endif

  private var welcoming: Bool { store.isSample && !exploring }

  private func follow(_ route: Route) -> Route? {
    switch route {
    case .trip(let id): store.successor(ofTrip: id).map(Route.trip)
    case .flight(let id): store.flightsByID[id] != nil ? route : nil
    case .place(let metro): store.archive.flights.contains { metroOf($0.origin) == metro || metroOf($0.destination) == metro } ? route : nil
    }
  }

  // A new flight opens on its own page; a deleted one closes the page it was on.
  private func edited(_ outcome: EditorOutcome) {
    switch outcome {
    case .added(let id):
      // Saved but not yet read back (offline a moment): it appears with the next refresh.
      guard store.flightsByID[id] != nil else { return }
      navigator.open(.flight(id))
      if detent == Detents.peek { detent = Detents.middle }
    case .deleted(let id):
      if navigator.path.last == .flight(id) { navigator.path.removeLast() }
    case .saved: break
    }
  }

  // From the sample back to the welcome, or straight to signing in or up.
  private func leaveSample(to auth: [AuthMode]) {
    withAnimation(.easeOut(duration: 0.3)) { exploring = false }
    authPath = auth
  }

  // How much of the screen the welcome's words and buttons cover.
  private func welcomeCover(_ height: CGFloat) -> CGFloat { min(470, height * 0.54) }

  // The globe under the welcome: the whole sample, then one of its trips,
  // then three flights as an import would bring them in.
  private var welcomeScene: GlobeScene {
    var focus: [Flight] = []
    if beat == 1, let trip = store.showcaseTrip { focus = store.legs(of: trip) }
    if beat == 2 { focus = store.showcaseFlights }
    return globeScene(scope: store.archive.flights, focus: focus, place: nil)
  }

  private func open(_ route: Route) {
    navigator.open(route)
    if detent == Detents.peek { detent = Detents.middle }
  }

  private func show(_ route: Route?) {
    if shown != route { shown = route }
  }

  private func pick(_ pick: GlobePick) {
    switch pick {
    case .flight(let id):
      if case .flight(let current) = shown, current == id { return }
      navigator.pick(.flight(id))
    case .place(let code):
      let metro = metroOf(code)
      if case .place(let current) = shown, current == metro { return }
      navigator.pick(.place(metro))
    }
    if detent == Detents.peek { detent = Detents.middle }
  }

  // MARK: What the globe shows

  private var scene: GlobeScene {
    var place: String?
    if case .place(let metro) = shown { place = metro }
    return globeScene(scope: store.flights(in: year), focus: focusFlights, place: place)
  }

  private func globeScene(scope: [Flight], focus: [Flight], place: String?) -> GlobeScene {
    let tone = Palette.tone(store.owner.tone)
    let bows = bowsOf(scope)
    let chronological = scope.sorted { ($0.date, $0.depart) < ($1.date, $1.depart) }
    var scene = GlobeScene()
    scene.base = chronological.compactMap { flight in
      guard let from = store.position(flight.origin), let to = store.position(flight.destination) else { return nil }
      let landed = flight.hasLanded(at: store.now)
      return ArcSpec(id: flight.id, from: from, to: to, bow: bows[flight.id] ?? 0.07, color: tone,
                     alpha: landed ? 0.55 : 0.5, width: 0.75, plan: landed ? 1 : Float(flight.progress(at: store.now)))
    }
    var visits: [String: Int] = [:]
    for flight in scope { visits[flight.origin, default: 0] += 1; visits[flight.destination, default: 0] += 1 }

    scene.focus = focus.compactMap { flight in
      guard let from = store.position(flight.origin), let to = store.position(flight.destination) else { return nil }
      let landed = flight.hasLanded(at: store.now)
      return ArcSpec(id: flight.id, from: from, to: to, bow: bows[flight.id] ?? 0.07, color: tone, alpha: 0.95, width: 1.35,
                     plan: landed ? 1 : Float(flight.progress(at: store.now)))
    }
    let focusCodes = Set(focus.flatMap { [$0.origin, $0.destination] })
    scene.dots = visits.compactMap { code, count in
      guard let at = store.position(code) else { return nil }
      let lit = focusCodes.contains(code)
      return DotSpec(code: code, at: at, radius: lit ? 2.6 : (count >= 10 ? 1.9 : 1.4), alpha: focus.isEmpty ? 0.62 : (lit ? 1 : 0.18))
    }.sorted { $0.code < $1.code }
    let named = labelCodes(focus: focus, lit: focusCodes, place: place)
    scene.labels = named.compactMap { code in
      store.position(code).map { LabelSpec(code: code, text: store.city(code), at: $0, rank: .max, strong: true) }
    }
    // Every city in scope, quieter, where there is room; home first, then the most visited.
    let namedMetros = Set(named.map(metroOf))
    let home = store.response.homes.last.map { metroOf($0.code) }
    var metroVisits: [String: Int] = [:]
    for (code, count) in visits { metroVisits[metroOf(code), default: 0] += count }
    scene.labels += metroVisits.compactMap { metro, count in
      guard !namedMetros.contains(metro) else { return nil }
      let anchor = store.anchor(metro)
      return store.position(anchor).map { LabelSpec(code: anchor, text: store.cityName(metro), at: $0, rank: count + (metro == home ? 100_000 : 0), strong: false) }
    }.sorted { $0.code < $1.code }
    if let metro = place, let at = store.position(store.anchor(metro)) {
      scene.framing = .points([at])
    } else if focus.isEmpty && tab == .footprint && navigator.path.isEmpty && !welcoming {
      // The footprint is the whole of it: every place, the far ones too.
      scene.framing = .world(center: worldCenter(scope))
    } else if focus.isEmpty {
      let heart = heartOf(scope)
      scene.framing = heart.count > 1 ? .points(heart) : .world(center: worldCenter(scope))
    } else {
      scene.framing = .points(focus.flatMap { [store.position($0.origin), store.position($0.destination)] }.compactMap { $0 })
    }
    scene.revealKey = revealKey
    scene.recentreKey = recentreKey
    // A flight's page shows the Earth as it was when it took off.
    if focus.count == 1, case .flight = shown { scene.sunAt = focus[0].departAt }
    return scene
  }

  // Names on the globe: the ends of what is open; for a city, only the city.
  private func labelCodes(focus: [Flight], lit: Set<String>, place: String?) -> [String] {
    if let metro = place { return [store.anchor(metro)] }
    var seen = Set<String>()
    return focus.flatMap { [$0.origin, $0.destination] }.filter { lit.contains($0) && seen.insert(metroOf($0)).inserted }
  }

  private var focusFlights: [Flight] {
    switch shown {
    case .trip(let id): store.tripsByID[id].map(store.legs) ?? []
    case .flight(let id): store.flightsByID[id].map { [$0] } ?? []
    case .place(let metro): store.flights(in: year).filter { metroOf($0.origin) == metro || metroOf($0.destination) == metro }
    case nil: []
    }
  }

  // The places that make up most of a person's flying: nearest the middle of
  // it first, until nine in ten visits are in. One far-off trip should not
  // shrink the whole picture to fit it; turning the globe still reaches it.
  private func heartOf(_ flights: [Flight]) -> [LngLat] {
    var visits: [String: Int] = [:]
    for flight in flights { visits[flight.origin, default: 0] += 1; visits[flight.destination, default: 0] += 1 }
    let points = visits.compactMap { code, count in store.position(code).map { (at: $0, count: count) } }
    guard points.count > 1 else { return points.map(\.at) }
    let middle = points.map { toVector($0.at) * Double($0.count) }.reduce(.zero, +)
    guard simd_length(middle) > 1e-6 else { return points.map(\.at) }
    let center = fromVector(simd_normalize(middle))
    let total = points.reduce(0) { $0 + $1.count }
    var kept: [LngLat] = [], covered = 0
    for point in points.sorted(by: { angularDistance($0.at, center) < angularDistance($1.at, center) }) {
      kept.append(point.at)
      covered += point.count
      if Double(covered) >= Double(total) * 0.9 { break }
    }
    return kept
  }

  // Where the person's flights cluster, so the first view of the globe is theirs.
  private func worldCenter(_ flights: [Flight]) -> LngLat {
    let points = flights.flatMap { [store.position($0.origin), store.position($0.destination)] }.compactMap { $0 }
    // Nothing flown yet: face the phone's own region.
    guard !points.isEmpty else { return Locale.current.region.flatMap { Countries.middle($0.identifier) } ?? LngLat(110, 25) }
    let sum = points.map(toVector).reduce(.zero, +)
    let center = fromVector(simd_normalize(sum))
    return LngLat(center.lng, max(-35, min(45, center.lat)))
  }
}

// A control on the globe: the icon itself, lifted off the scene by a shadow.
struct SceneButton: View {
  let symbol: String
  let label: String
  var action: () -> Void

  var body: some View {
    Button(action: action) { SceneIcon(symbol: symbol) }
      .buttonStyle(Press())
      .accessibilityLabel(label)
  }
}

struct SceneIcon: View {
  let symbol: String
  var body: some View {
    Image(systemName: symbol)
      .font(.fp(19, .medium))
      .foregroundStyle(Ink.primary)
      .shadow(color: .black.opacity(0.9), radius: 6)
      .frame(width: 44, height: 44)
      .contentShape(.rect)
  }
}

enum Detents {
  // The dial and the parts under it, with the globe as large as it gets.
  static let peekHeight: CGFloat = 172
  static let peek = PresentationDetent.height(peekHeight)
  static let middle = PresentationDetent.fraction(0.5)
}
