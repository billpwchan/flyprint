import AVFoundation
import PhotosUI
import SwiftUI
import Vision
import VisionKit

// One flight by hand: typed, or read off a boarding pass's barcode (the
// camera, or a screenshot of an e-boarding pass), then put right later. The
// server reads it the way it reads an import row, so codes, times and
// distance come out the same.
struct FlightDraft: Equatable {
  // A flight's date is a calendar day, held as UTC midnight the way the
  // archive gives it, and shown and read back in UTC so no time zone moves it.
  static let utc: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()
  static var today: Date {
    utc.date(from: Calendar.current.dateComponents([.year, .month, .day], from: Date())) ?? Date()
  }

  var date = FlightDraft.today
  var flight = ""
  var origin = ""
  var destination = ""
  var depart = ""
  var arrive = ""
  var seat = ""
  var cabin = ""
  var aircraft = ""
  var registration = ""

  init() {}

  init(_ flight: Flight) {
    date = Format.day(flight.date) ?? Self.today
    self.flight = flight.flight
    origin = flight.origin
    destination = flight.destination
    depart = flight.depart
    arrive = flight.arrive
    seat = flight.seat ?? ""
    cabin = flight.cabin ?? ""
    aircraft = flight.aircraft?.model ?? ""
    registration = flight.aircraft?.registration ?? ""
  }

  init(_ leg: BoardingPass.Leg) {
    date = Format.day(leg.date) ?? Self.today
    flight = leg.flight
    origin = leg.origin
    destination = leg.destination
    seat = leg.seat
    cabin = leg.cabin
  }

  var body: [String: String] {
    let parts = Self.utc.dateComponents([.year, .month, .day], from: date)
    return [
      "date": String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0),
      "flight": flight, "origin": origin, "destination": destination, "depart": depart, "arrive": arrive,
      "seat": seat, "cabin": cabin, "aircraft": aircraft, "registration": registration,
    ]
  }

  var ready: Bool { !origin.trimmingCharacters(in: .whitespaces).isEmpty && !destination.trimmingCharacters(in: .whitespaces).isEmpty }
}

enum EditorTarget: Identifiable, Hashable {
  case add
  // Straight to the camera, from the add menu.
  case scan
  case edit(String)
  var id: String {
    switch self {
    case .add: "add"
    case .scan: "scan"
    case .edit(let id): "edit-\(id)"
    }
  }
}

enum EditorOutcome { case added(String), saved, deleted(String) }

struct AirportMatch: Decodable, Hashable, Sendable {
  var code: String
  var city: Names
  var name: Names
  var country: String
  var countryName: Names?
}

// Suggestions for what is typed, and the airport it stands for when that is
// clear (伦敦 → LHR); nil when several places share the name.
struct AirportAnswer: Decodable, Sendable {
  var airports: [AirportMatch]
  var resolved: String?
}

struct FlightEditor: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  let target: EditorTarget
  var done: (EditorOutcome) -> Void
  @State private var draft = FlightDraft()
  @State private var original = FlightDraft()
  @State private var problem: (field: String, message: String)?
  @State private var saving = false
  @State private var deleting = false
  @State private var confirmDelete = false
  @State private var scanning = false
  @State private var picked: PhotosPickerItem?
  @State private var passNote: String?
  @State private var scrolled = false
  @State private var matches: [AirportMatch] = []
  @State private var resolved: (query: String, code: String)?
  @State private var named: [String: AirportMatch] = [:]
  @FocusState private var focus: Slot?

  enum Slot: Hashable { case flight, origin, destination, depart, arrive, seat, aircraft, registration }

  private var editing: String? { if case .edit(let id) = target { id } else { nil } }

  static var canScan: Bool { DataScannerViewController.isSupported }

  var body: some View {
    let lang = store.lang
    ScrollViewReader { proxy in
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        if editing == nil { passSources }
        dateRow
        Field(label: lang.t("航班号", "航班號", "Flight number"), text: $draft.flight, hint: lang.t("例如 CX255，私人或包机可以不填", "例如 CX255，私人或包機可以不填", "e.g. CX255; leave empty for a private flight"),
              problem: message(for: "flight"), active: focus == .flight)
          .focused($focus, equals: .flight)
          .textInputAutocapitalization(.characters).autocorrectionDisabled().submitLabel(.next)
          .onSubmit { focus = .origin }
        VStack(alignment: .leading, spacing: 12) {
          HStack(alignment: .top, spacing: 16) {
            airportField(lang.t("出发", "出發", "From"), text: $draft.origin, slot: .origin, key: "origin")
            Image(systemName: "arrow.right").font(.fp(15, .semibold)).foregroundStyle(Ink.faint).padding(.top, 30)
            airportField(lang.t("到达", "到達", "To"), text: $draft.destination, slot: .destination, key: "destination")
          }
          if (focus == .origin || focus == .destination) && !matches.isEmpty { suggestions }
        }
        .id("route")
        .animation(.easeOut(duration: 0.18), value: matches)
        .task(id: searching) { await search() }
        HStack(alignment: .top, spacing: 16) {
          Field(label: lang.t("起飞时间", "起飛時間", "Departs"), text: $draft.depart, hint: lang.t("当地时间，例如 09:30", "當地時間，例如 09:30", "Local time, e.g. 09:30"),
                problem: message(for: "time"), active: focus == .depart)
            .focused($focus, equals: .depart).keyboardType(.numbersAndPunctuation).submitLabel(.next).onSubmit { focus = .arrive }
          Field(label: lang.t("降落时间", "降落時間", "Arrives"), text: $draft.arrive, active: focus == .arrive)
            .focused($focus, equals: .arrive).keyboardType(.numbersAndPunctuation).submitLabel(.next).onSubmit { focus = .seat }
        }
        cabinRow
        HStack(alignment: .top, spacing: 16) {
          Field(label: lang.t("座位", "座位", "Seat"), text: $draft.seat, active: focus == .seat)
            .focused($focus, equals: .seat).textInputAutocapitalization(.characters).autocorrectionDisabled()
          Field(label: lang.t("机型", "機型", "Aircraft"), text: $draft.aircraft, hint: lang.t("例如 A350-900", "例如 A350-900", "e.g. A350-900"),
                problem: message(for: "aircraft"), active: focus == .aircraft)
            .focused($focus, equals: .aircraft).autocorrectionDisabled()
        }
        Field(label: lang.t("注册号", "註冊號", "Registration"), text: $draft.registration, hint: lang.t("机身上的编号，例如 B-LRA；有了就能找到这架飞机的照片", "機身上的編號，例如 B-LRA；有了就能找到這架飛機的相片", "The tail number, e.g. B-LRA; with it the aircraft's photo can be found"),
              problem: message(for: "registration"), active: focus == .registration)
          .focused($focus, equals: .registration).textInputAutocapitalization(.characters).autocorrectionDisabled()
        if let problem, problem.field == "general" {
          Text(problem.message).font(.caption).foregroundStyle(Palette.warning)
        }
        if editing != nil {
          Button { confirmDelete = true } label: {
            Text(lang.t("删除这段航班", "刪除這段航班", "Delete this flight")).font(.body).foregroundStyle(Palette.danger)
              .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(.rect)
          }
          .buttonStyle(Press())
          .disabled(deleting)
        }
      }
      .padding(.horizontal, 24)
      .padding(.top, 6)
      .padding(.bottom, 24)
    }
    .scrollIndicators(.hidden)
    .scrollDismissesKeyboard(.interactively)
    .scrolledOffTop($scrolled)
    // Typing an airport: its row goes to the top, so the suggestions under it clear the keyboard.
    .onChange(of: focus) { previous, _ in
      if focus == .origin || focus == .destination { withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("route", anchor: .top) } }
      commit(previous)
    }
    }
    .safeAreaInset(edge: .top, spacing: 0) {
      SheetHeader(title: editing == nil ? lang.t("添加航班", "新增航班", "Add a flight") : lang.t("修改航班", "修改航班", "Edit flight"),
                  action: SheetAction(title: lang.t("保存", "儲存", "Save"), enabled: draft.ready && (editing == nil || draft != original), busy: saving) { save() })
        .padding(.horizontal, 24).padding(.top, 18).padding(.bottom, 4)
        .background { EdgeBackdrop().opacity(scrolled ? 1 : 0) }
    }
    .confirmationDialog(lang.t("删除这段航班？", "刪除這段航班？", "Delete this flight?"), isPresented: $confirmDelete, titleVisibility: .visible) {
      Button(lang.t("删除", "刪除", "Delete"), role: .destructive) { remove() }
    } message: {
      Text(lang.t("删除后它会从地球、旅程和统计里消失，网页版也一样。", "刪除後它會從地球、旅程和統計裏消失，網頁版也一樣。", "It leaves the globe, your trips and your figures, on the web too."))
    }
    .fullScreenCover(isPresented: $scanning) {
      PassScanner { pass in scanning = false; take(pass) } cancel: { scanning = false } failed: {
        scanning = false
        cameraRefused()
      }
        .ignoresSafeArea()
    }
    .onChange(of: picked) {
      guard let picked else { return }
      self.picked = nil
      Task { await readPhoto(picked) }
    }
    .presentationDetents([.large])
    .presentationBackground { SheetGround() }
    .presentationDragIndicator(.visible)
    .onAppear {
      if let editing, let flight = store.flightsByID[editing] {
        draft = FlightDraft(flight); original = draft
      }
      // After the sheet has risen: a cover asked for mid-presentation can be dropped.
      if target == .scan && Self.canScan { Task { try? await Task.sleep(for: .milliseconds(450)); await openScanner() } }
    }
    .task {
      // The airports of a flight being put right, named under their fields.
      for code in [draft.origin, draft.destination] where code.count == 3 {
        if let match = await store.airports(code).airports.first(where: { $0.code == code }) { named[code] = match }
      }
    }
  }

  // A boarding pass fills the form; the camera where the phone can scan, a screenshot always.
  private var passSources: some View {
    let lang = store.lang
    let screenshot = lang.t("登机牌截图", "登機證截圖", "Pass screenshot")
    return VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 28) {
        if Self.canScan {
          Button { Task { await openScanner() } } label: { SourceTile(title: lang.t("扫登机牌", "掃登機證", "Scan a pass"), symbol: "barcode.viewfinder") }
            .buttonStyle(Press())
        }
        PhotosPicker(selection: $picked, matching: .images) {
          SourceTile(title: screenshot, symbol: "photo")
        }
        .buttonStyle(Press())
      }
      Text(passNote ?? lang.t("登机牌上的条码里有航班号、日期、航线和座位，读出来先填好，你再看一眼。纸质的旧登机牌也可以。",
                              "登機證上的條碼裏有航班號、日期、航線和座位，讀出來先填好，你再看一眼。紙本的舊登機證也可以。",
                              "A boarding pass's barcode holds the flight, date, route and seat; they fill in below for you to check. Old paper passes work too."))
        .font(.caption).foregroundStyle(passNote == nil ? Ink.tertiary : store.tone)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var dateRow: some View {
    let lang = store.lang
    return VStack(alignment: .leading, spacing: 6) {
      Text(lang.t("日期", "日期", "Date")).font(.caption).foregroundStyle(Ink.tertiary)
      HStack {
        DatePicker("", selection: $draft.date, displayedComponents: .date)
          .labelsHidden()
          .datePickerStyle(.compact)
          .tint(store.tone)
          .environment(\.locale, lang.locale)
          .environment(\.timeZone, FlightDraft.utc.timeZone)
          .environment(\.calendar, FlightDraft.utc)
        Spacer()
        if let problem = message(for: "date") { Text(problem).font(.caption).foregroundStyle(Palette.warning) }
      }
    }
  }

  private var cabinRow: some View {
    let lang = store.lang
    let cabins: [(String, String)] = [("economy", lang.t("经济", "經濟", "Economy")), ("premium", lang.t("超经", "特選經濟", "Premium")),
                                      ("business", lang.t("商务", "商務", "Business")), ("first", lang.t("头等", "頭等", "First"))]
    return VStack(alignment: .leading, spacing: 10) {
      Text(lang.t("舱位", "艙位", "Cabin")).font(.caption).foregroundStyle(Ink.tertiary)
      // Four equal parts across the width, so English fits an SE as well as Chinese does.
      HStack(spacing: 6) {
        ForEach(cabins, id: \.0) { value, name in
          let chosen = draft.cabin == value
          Button {
            draft.cabin = chosen ? "" : value
            UISelectionFeedbackGenerator().selectionChanged()
          } label: {
            Text(name).font(.bodyStrong).lineLimit(1).minimumScaleFactor(0.75)
              .foregroundStyle(chosen ? Color.black : Ink.secondary)
              .padding(.horizontal, 6).frame(maxWidth: .infinity, minHeight: 36)
              .background(Capsule().fill(chosen ? Ink.primary : Ink.primary.opacity(0.08)))
              .contentShape(.capsule)
          }
          .buttonStyle(Press())
          .accessibilityAddTraits(chosen ? .isSelected : [])
        }
      }
    }
  }

  // What is being typed in an airport field, so suggestions follow it.
  private var searching: String {
    switch focus {
    case .origin: "o:" + draft.origin
    case .destination: "d:" + draft.destination
    default: ""
    }
  }

  private func search() async {
    let query = String(searching.dropFirst(2)).trimmingCharacters(in: .whitespaces)
    guard !query.isEmpty else { matches = []; return }
    try? await Task.sleep(for: .milliseconds(140))
    guard !Task.isCancelled else { return }
    let answer = await store.airports(query)
    guard !Task.isCancelled else { return }
    matches = answer.airports
    resolved = answer.resolved.map { (query, $0) }
    for match in answer.airports where match.code == query.uppercased() || match.code == answer.resolved { named[match.code] = match }
  }

  private var suggestions: some View {
    let lang = store.lang
    return VStack(spacing: 0) {
      let home = matches.first?.country
      ForEach(matches.prefix(5), id: \.code) { match in
        // Same-named cities elsewhere (London, Ontario) carry their country.
        let place = [lang.pick(match.city), match.country == home ? nil : lang.pick(match.countryName)].compactMap { $0 }.joined(separator: " · ")
        Button {
          if focus == .origin { draft.origin = match.code; focus = .destination } else { draft.destination = match.code; focus = .depart }
          named[match.code] = match
          matches = []
          UISelectionFeedbackGenerator().selectionChanged()
        } label: {
          HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(match.code).font(.fp(15, .semibold).monospaced()).foregroundStyle(Ink.primary).frame(width: 44, alignment: .leading)
            Text(lang.pick(match.name) ?? match.code).font(.body).foregroundStyle(Ink.primary).lineLimit(1)
            Spacer(minLength: 8)
            Text(place).font(.caption).foregroundStyle(Ink.tertiary).lineLimit(1)
          }
          .padding(.horizontal, 14)
          .frame(minHeight: 44)
          .contentShape(.rect)
        }
        .buttonStyle(Press())
      }
    }
    .padding(.vertical, 4)
    .background(RoundedRectangle(cornerRadius: 14).fill(Ink.primary.opacity(0.06)))
    .transition(.opacity)
  }

  private func airportField(_ label: String, text: Binding<String>, slot: Slot, key: String) -> some View {
    let code = text.wrappedValue.trimmingCharacters(in: .whitespaces).uppercased()
    let lang = store.lang
    let known = named[code].map { "\(lang.pick($0.name) ?? code) · \(lang.pick($0.city) ?? "")" }
      ?? (code.count == 3 ? store.place(code).map { _ in store.city(code) } : nil)
    return Field(label: label, text: text, hint: known ?? store.lang.t("机场代码、城市或机场名", "機場代碼、城市或機場名", "Airport code, city or name"),
                 problem: message(for: key) ?? (key == "destination" ? message(for: "same_airport") : nil), active: focus == slot)
      .focused($focus, equals: slot)
      // Not forced to capitals: a code typed in capitals is taken as a code, a name as a name.
      .textInputAutocapitalization(.never).autocorrectionDisabled()
      .submitLabel(.next)
      .onSubmit { focus = slot == .origin ? .destination : .depart }
  }

  // The camera is asked for once, here, with the reason in Info.plist.
  private func openScanner() async {
    if await AVCaptureDevice.requestAccess(for: .video) { scanning = true } else { cameraRefused() }
  }

  private func cameraRefused() {
    passNote = store.lang.t("相机用不了。可以在 iPhone 的「设置 → 航迹」里允许使用相机，或者选一张登机牌截图。",
                            "相機用不了。可以在 iPhone 的「設定 → 航跡」裏允許使用相機，或者選一張登機證截圖。",
                            "The camera isn't available. Allow it in the iPhone's Settings, or choose a screenshot of the pass.")
    UINotificationFeedbackGenerator().notificationOccurred(.warning)
  }

  private func message(for field: String) -> String? { problem?.field == field ? problem?.message : nil }

  // Leaving an airport field with a name in it: the airport it stands for
  // takes its place, so what will be saved is in view before Save.
  private func commit(_ slot: Slot?) {
    guard slot == .origin || slot == .destination, let resolved else { return }
    let typed = (slot == .origin ? draft.origin : draft.destination).trimmingCharacters(in: .whitespaces)
    guard typed == resolved.query, typed.uppercased() != resolved.code else { return }
    if slot == .origin { draft.origin = resolved.code } else { draft.destination = resolved.code }
  }

  private func take(_ pass: BoardingPass) {
    guard let leg = pass.legs.first else { return }
    var next = FlightDraft(leg)
    next.depart = draft.depart; next.arrive = draft.arrive
    draft = next
    problem = nil
    let lang = store.lang
    let read = pass.legs.count > 1
      ? lang.t("读到 \(pass.legs.count) 段，先填了第一段 \(leg.origin)→\(leg.destination)。", "讀到 \(pass.legs.count) 段，先填了第一段 \(leg.origin)→\(leg.destination)。", "Read \(pass.legs.count) legs; the first, \(leg.origin)→\(leg.destination), is filled in. ")
      : lang.t("读到了 \(leg.flight) \(leg.origin)→\(leg.destination)。", "讀到了 \(leg.flight) \(leg.origin)→\(leg.destination)。", "Read \(leg.flight) \(leg.origin)→\(leg.destination). ")
    let year = pass.yearKnown ? "" : lang.t("条码里没有年份，看一下日期对不对；", "條碼裏沒有年份，看一下日期對不對；", "The barcode has no year, so check the date. ")
    passNote = read + year + lang.t("登机牌上没有起降时间，知道的话可以补上。", "登機證上沒有起降時間，知道的話可以補上。", "Passes carry no times; add them if you know them.")
    UINotificationFeedbackGenerator().notificationOccurred(.success)
  }

  private func readPhoto(_ item: PhotosPickerItem) async {
    let lang = store.lang
    guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data)?.cgImage else { return }
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.pdf417, .aztec, .qr, .dataMatrix]
    try? VNImageRequestHandler(cgImage: image).perform([request])
    let pass = (request.results ?? []).compactMap(\.payloadStringValue).lazy.compactMap { BoardingPass.read($0) }.first
    if let pass { take(pass) } else {
      passNote = lang.t("这张图里没找到登机牌条码。没有条码的截图可以用导入，让它读文字。", "這張圖裏沒找到登機證條碼。沒有條碼的截圖可以用匯入，讓它讀文字。", "No boarding-pass barcode in that image. For screenshots without one, use Import to read the text.")
      UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
  }

  private func save() {
    commit(focus)
    focus = nil
    saving = true
    problem = nil
    Task {
      defer { saving = false }
      do {
        let id = try await store.saveFlight(draft, id: editing)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        dismiss()
        done(editing == nil ? .added(id) : .saved)
      } catch {
        let code = (error as? API.Failure)?.code ?? "server"
        let field = switch code {
        case "date", "flight", "origin", "destination", "same_airport", "time", "aircraft", "registration": code
        case "origin_ambiguous": "origin"
        case "destination_ambiguous": "destination"
        case "registration_type": "aircraft"
        default: "general"
        }
        withAnimation { problem = (field, flightProblem(code, store.lang)) }
        UINotificationFeedbackGenerator().notificationOccurred(.error)
      }
    }
  }

  private func remove() {
    guard let editing else { return }
    deleting = true
    Task {
      defer { deleting = false }
      do {
        try await store.deleteFlight(editing)
        dismiss()
        done(.deleted(editing))
      } catch {
        problem = ("general", flightProblem((error as? API.Failure)?.code ?? "server", store.lang))
      }
    }
  }
}

func flightProblem(_ code: String, _ lang: Lang) -> String {
  switch code {
  case "date": lang.t("日期不对，最远可以记一年后的航班", "日期不對，最遠可以記一年後的航班", "Check the date; up to a year ahead")
  case "origin", "destination": lang.t("认不出这个机场，换成三字代码试试", "認不出這個機場，換成三字代碼試試", "Unknown airport; try its three-letter code")
  case "origin_ambiguous", "destination_ambiguous": lang.t("有好几个机场叫这个名字，从候选里选一个", "有好幾個機場叫這個名字，從候選裏選一個", "Several airports go by that name; pick one from the list")
  case "aircraft": lang.t("认不出这个机型，写成 A350-900、737-800 这样试试", "認不出這個機型，寫成 A350-900、737-800 這樣試試", "Unknown aircraft; try something like A350-900 or 737-800")
  case "registration": lang.t("注册号的写法不对，例如 B-LRA", "註冊號的寫法不對，例如 B-LRA", "That registration doesn't read right; e.g. B-LRA")
  case "registration_type": lang.t("写了注册号，也请写上机型", "寫了註冊號，也請寫上機型", "Add the aircraft type along with the registration")
  case "same_airport": lang.t("出发和到达是同一个机场", "出發和到達是同一個機場", "That's the same airport twice")
  case "time": lang.t("这两个时间对不上这条航线，确认是当地时间", "這兩個時間對不上這條航線，確認是當地時間", "Those times don't fit this route; use local times")
  case "flight": lang.t("航班号的写法不对", "航班號的寫法不對", "That flight number doesn't read right")
  case "duplicate": lang.t("这段航班已经记过了", "這段航班已經記過了", "That flight is already in your log")
  case "not_found": lang.t("这段航班已经不在了", "這段航班已經不在了", "That flight is no longer there")
  default: problemText(code, lang)
  }
}

private struct SourceTile: View {
  let title: String
  let symbol: String
  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: symbol).font(.fp(17, .medium))
      Text(title).font(.bodyStrong)
    }
    .foregroundStyle(Ink.primary)
    .frame(minHeight: 44)
    .contentShape(.rect)
  }
}

// The camera, looking for a boarding pass's barcode; the first one that
// reads as a pass is taken.
private struct PassScanner: UIViewControllerRepresentable {
  var found: (BoardingPass) -> Void
  var cancel: () -> Void
  var failed: () -> Void

  func makeUIViewController(context: Context) -> UINavigationController {
    let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.pdf417, .aztec, .qr, .dataMatrix])],
                                            qualityLevel: .accurate, isHighlightingEnabled: true)
    scanner.delegate = context.coordinator
    scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { _ in cancel() })
    let navigation = UINavigationController(rootViewController: scanner)
    navigation.overrideUserInterfaceStyle = .dark
    // Scanning starts once the camera view is on screen; a refused camera says so.
    Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(350))
      do { try scanner.startScanning() } catch { failed() }
    }
    return navigation
  }

  func updateUIViewController(_ controller: UINavigationController, context: Context) {}
  func makeCoordinator() -> Coordinator { Coordinator(found: found) }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    let found: (BoardingPass) -> Void
    private var done = false
    init(found: @escaping (BoardingPass) -> Void) { self.found = found }

    func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
      guard !done else { return }
      for item in allItems {
        if case .barcode(let code) = item, let payload = code.payloadStringValue, let pass = BoardingPass.read(payload) {
          done = true
          scanner.stopScanning()
          found(pass)
          return
        }
      }
    }
  }
}
