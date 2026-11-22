import Foundation
import Observation
import Security

// The reader's archive as the server last answered, kept on disk so the app
// opens at once and works offline. Signed out, it is the sample traveller.
@Observable
final class Store {
  private(set) var response: ArchiveResponse
  private(set) var flightsByID: [String: Flight] = [:]
  private(set) var tripsByID: [String: Trip] = [:]
  // The trips before the last change, by their flights: a trip is named by
  // its first flight, so adding an earlier one or deleting the first renames it.
  private var formerTrips: [String: [String]] = [:]
  private(set) var tripOfFlight: [String: String] = [:]
  private(set) var syncing = false
  // Bumped whenever a new archive arrives, so the globe can draw it in again.
  private(set) var revision = 0
  var now = Date()
  // The interface language; changing it redraws every page in place.
  private(set) var lang = Lang.current

  private let api = API()
  // Weather already fetched, and what has been asked for (so a page that
  // redraws does not ask again). Days past are also kept by URLCache, as the
  // server marks them cacheable for a week.
  private(set) var weather: [String: WeatherDay] = [:]
  @ObservationIgnored private var weatherAsked = Set<String>()
  private var session: String? { didSet { Keychain.session = session } }
  @ObservationIgnored private(set) lazy var importer = Importer(api: api, token: { [weak self] in self?.session }, saved: { [weak self] in await self?.refresh() })

  // Tests pass restoring: false to read the bundled sample whatever the device holds.
  init(restoring: Bool = true) {
    #if DEBUG
    if UserDefaults.standard.bool(forKey: "fp.lang.reset") { Lang.chosen = nil }
    if UserDefaults.standard.bool(forKey: "fp.reset") {
      Keychain.session = nil
      try? FileManager.default.removeItem(at: Self.cacheURL)
    }
    #endif
    session = restoring ? Keychain.session : nil
    response = (restoring ? Self.cached() : nil) ?? Self.bundledSample()
    lang = Lang.current
    index()
  }

  var archive: Archive { response.archive }
  var isSample: Bool { response.sample }
  var owner: Person { archive.owner }
  var trips: [Trip] { response.trips }

  func want(weather keys: [String]) {
    let wanted = keys.filter { weather[$0] == nil && !weatherAsked.contains($0) }
    guard !wanted.isEmpty else { return }
    weatherAsked.formUnion(wanted)
    Task {
      for start in stride(from: 0, to: wanted.count, by: 60) {
        let batch = Array(wanted[start..<min(wanted.count, start + 60)])
        if let found = try? await api.weather(batch) {
          weather.merge(found) { _, new in new }
        } else {
          // Offline or refused: may be asked again next time the page opens.
          weatherAsked.subtract(batch)
        }
      }
    }
  }

  // MARK: Loading

  private static var cacheURL: URL {
    URL.applicationSupportDirectory.appending(path: "archive.json")
  }

  private static func cached() -> ArchiveResponse? {
    guard Keychain.session != nil, let data = try? Data(contentsOf: cacheURL) else { return nil }
    return try? JSONDecoder().decode(ArchiveResponse.self, from: data)
  }

  private static func bundledSample() -> ArchiveResponse {
    let url = Bundle.main.url(forResource: "sample", withExtension: "json")!
    return try! JSONDecoder().decode(ArchiveResponse.self, from: Data(contentsOf: url))
  }

  private func index(remembering: Bool = true) {
    if remembering { formerTrips = tripsByID.mapValues(\.flightIds) }
    flightsByID = Dictionary(uniqueKeysWithValues: archive.flights.map { ($0.id, $0) })
    tripsByID = Dictionary(uniqueKeysWithValues: trips.map { ($0.id, $0) })
    var owners: [String: String] = [:]
    for trip in trips { for id in trip.flightIds { owners[id] = trip.id } }
    tripOfFlight = owners
  }

  private func accept(_ next: ArchiveResponse, data: Data) {
    let changed = next.archive.flights != archive.flights || next.sample != response.sample
    response = next
    // Only a real change moves the trips the pages follow from.
    index(remembering: changed)
    if changed { revision += 1 }
    if !next.sample {
      try? FileManager.default.createDirectory(at: URL.applicationSupportDirectory, withIntermediateDirectories: true)
      try? data.write(to: Self.cacheURL, options: .completeFileProtection)
    }
  }

  func refresh() async {
    syncing = true
    defer { syncing = false; now = Date() }
    do {
      let (next, data) = try await api.archive(token: session)
      // A token the server no longer knows: back to the sample, signed out.
      if next.sample && session != nil { session = nil; try? FileManager.default.removeItem(at: Self.cacheURL) }
      accept(next, data: data)
      if !next.sample { importer.resume() }
    } catch {
      // Offline or the server is away: keep what is on screen.
    }
  }

  // MARK: Account

  func signIn(email: String, password: String) async throws {
    session = try await api.signIn(email: email, password: password)
    await refresh()
  }

  func signUp(name: String, email: String, password: String) async throws {
    session = try await api.signUp(name: name, email: email, password: password)
    await refresh()
  }

  // nil follows the phone's language.
  func choose(_ choice: Lang?) {
    Lang.chosen = choice
    lang = Lang.current
    Task { await refresh() }
  }


  func rename(_ name: String) async throws {
    guard let session else { throw API.Failure.code("signed_out") }
    try await api.rename(token: session, name: name)
    await refresh()
  }

  func changePassword(current: String, next: String) async throws {
    guard let session else { throw API.Failure.code("signed_out") }
    try await api.changePassword(token: session, current: current, next: next)
  }

  // Everything logged, in the form the importer reads back, as a file to share.
  func exportFile() async throws -> URL {
    guard let session else { throw API.Failure.code("signed_out") }
    let data = try await api.export(token: session)
    let day = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
    let url = URL.temporaryDirectory.appending(path: "flyprint-flights-\(day).json")
    try data.write(to: url, options: .atomic)
    return url
  }

  func deleteAccount(password: String) async throws {
    guard let session else { throw API.Failure.code("signed_out") }
    try await api.deleteAccount(token: session, password: password)
    await forget()
  }

  // One flight typed in or put right; the answer is its id.
  func saveFlight(_ draft: FlightDraft, id: String?) async throws -> String {
    guard let session else { throw API.Failure.code("signed_out") }
    let saved = try await api.saveFlight(token: session, body: draft.body, id: id)
    await refresh()
    return saved
  }

  // Airports by code, city or name, for a flight typed in by hand.
  func airports(_ query: String) async -> AirportAnswer {
    (try? await api.airports(query)) ?? AirportAnswer(airports: [], resolved: nil)
  }

  func deleteFlight(_ id: String) async throws {
    guard let session else { throw API.Failure.code("signed_out") }
    try await api.deleteFlight(token: session, id: id)
    await refresh()
  }

  func signOut() async {
    if let session { await api.signOut(token: session) }
    await forget()
  }

  // Back to the sample traveller, with nothing of the account left on the phone.
  private func forget() async {
    importer.reset()
    session = nil
    try? FileManager.default.removeItem(at: Self.cacheURL)
    response = Self.bundledSample()
    index()
    revision += 1
    await refresh()
  }

  // MARK: Reading the archive

  func place(_ code: String) -> Place? { archive.places[code] }
  func city(_ code: String) -> String { lang.pick(place(code)?.city) ?? code }
  func airportName(_ code: String) -> String { lang.pick(place(code)?.name) ?? code }
  func country(_ iso: String) -> String { lang.pick(archive.countries[iso]) ?? iso }
  func carrier(_ code: String) -> String { lang.pick(archive.carriers[code]) ?? code }
  func position(_ code: String) -> LngLat? { place(code)?.lngLat }

  var years: [Int] { Array(Set(archive.flights.map(\.year))).sorted() }

  func flights(in year: Int?) -> [Flight] {
    archive.flights.filter { year == nil || $0.year == year }
  }

  func landed(in year: Int?) -> [Flight] { flights(in: year).filter { $0.hasLanded(at: now) } }

  // Flights still ahead, soonest first.
  var ahead: [Flight] {
    archive.flights.filter { !$0.hasLanded(at: now) }.sorted { ($0.departAt ?? 0) < ($1.departAt ?? 0) }
  }

  func trips(in year: Int?) -> [Trip] {
    trips.filter { year == nil || $0.year == year }.sorted { $0.start > $1.start }
  }

  func legs(of trip: Trip) -> [Flight] { trip.flightIds.compactMap { flightsByID[$0] } }

  func trip(of flight: Flight) -> Trip? { tripOfFlight[flight.id].flatMap { tripsByID[$0] } }

  // The trip as it is now that was this one before the last change.
  func successor(ofTrip id: String) -> String? {
    if tripsByID[id] != nil { return id }
    return (formerTrips[id] ?? []).lazy.compactMap { self.tripOfFlight[$0] }.first
  }

  // Landed flights between the same two cities, either way, before this one.
  func timesFlown(before flight: Flight) -> Int {
    let pair = Set([metroOf(flight.origin), metroOf(flight.destination)])
    return archive.flights.filter {
      $0.id != flight.id && $0.hasLanded(at: now) && Set([metroOf($0.origin), metroOf($0.destination)]) == pair
        && ($0.date, $0.depart) < (flight.date, flight.depart)
    }.count
  }

  // Countries reached for the first time on this flight.
  func isFirstVisit(_ flight: Flight) -> Bool {
    guard let iso = place(flight.destination)?.country else { return false }
    return !archive.flights.contains {
      ($0.date, $0.depart) < (flight.date, flight.depart) && (place($0.destination)?.country == iso || place($0.origin)?.country == iso)
    }
  }
}

// MARK: Server

struct API: Sendable {
  static let origin: URL = {
    #if DEBUG
    // A local server for testing, e.g. -fp.origin http://127.0.0.1:4310
    if let local = UserDefaults.standard.string(forKey: "fp.origin"), let url = URL(string: local) { return url }
    #endif
    return URL(string: "https://flyprint.billpwchan.art")!
  }()

  enum Failure: Error, Equatable {
    case code(String), offline
    var code: String { if case .code(let code) = self { code } else { "network" } }
  }

  private let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    // The app carries its session as a token; a cookie would make the server
    // treat it as a page.
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.timeoutIntervalForRequest = 20
    return URLSession(configuration: configuration)
  }()

  private func request(_ path: String, method: String = "GET", body: Any? = nil, token: String? = nil) async throws -> (Data, Int) {
    let data = try body.map { try JSONSerialization.data(withJSONObject: $0) }
    return try await send(path, method: method, data: data, type: data == nil ? nil : "application/json", token: token)
  }

  private func send(_ path: String, method: String, data: Data?, type: String?, token: String?) async throws -> (Data, Int) {
    var request = URLRequest(url: Self.origin.appending(path: path))
    request.httpMethod = method
    request.setValue("ios", forHTTPHeaderField: "X-Flyprint-Client")
    request.setValue(Lang.current.locale.identifier, forHTTPHeaderField: "Accept-Language")
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    if let data, let type {
      request.setValue(type, forHTTPHeaderField: "Content-Type")
      request.httpBody = data
    }
    do {
      let (data, response) = try await session.data(for: request)
      return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    } catch {
      throw Failure.offline
    }
  }

  private struct Answer: Decodable { var token: String?; var error: String? }

  private func session(from data: Data, status: Int) throws -> String {
    let answer = try? JSONDecoder().decode(Answer.self, from: data)
    guard (200..<300).contains(status), let token = answer?.token else { throw Failure.code(answer?.error ?? "server") }
    return token
  }

  func archive(token: String?) async throws -> (ArchiveResponse, Data) {
    let (data, status) = try await request("api/app/archive", token: token)
    guard status == 200 else { throw Failure.code("server") }
    return (try JSONDecoder().decode(ArchiveResponse.self, from: data), data)
  }

  func signIn(email: String, password: String) async throws -> String {
    let (data, status) = try await request("api/auth/login", method: "POST", body: ["email": email, "password": password])
    return try session(from: data, status: status)
  }

  func signUp(name: String, email: String, password: String) async throws -> String {
    let (data, status) = try await request("api/auth/signup", method: "POST", body: ["name": name, "email": email, "password": password])
    return try session(from: data, status: status)
  }

  func signOut(token: String) async {
    _ = try? await request("api/auth/logout", method: "POST", body: [String: String](), token: token)
  }

  private func check(_ data: Data, _ status: Int) throws {
    guard (200..<300).contains(status) else { throw failure(data) }
  }

  func rename(token: String, name: String) async throws {
    let (data, status) = try await request("api/account", method: "PATCH", body: ["name": name], token: token)
    try check(data, status)
  }

  func changePassword(token: String, current: String, next: String) async throws {
    let (data, status) = try await request("api/account/password", method: "POST", body: ["current": current, "next": next], token: token)
    try check(data, status)
  }

  func deleteAccount(token: String, password: String) async throws {
    let (data, status) = try await request("api/account", method: "DELETE", body: ["password": password], token: token)
    try check(data, status)
  }

  func saveFlight(token: String, body: [String: String], id: String?) async throws -> String {
    struct Saved: Decodable { var id: String }
    let (data, status) = try await request(id.map { "api/flights/\($0)" } ?? "api/flights", method: id == nil ? "POST" : "PATCH", body: body, token: token)
    try check(data, status)
    return try JSONDecoder().decode(Saved.self, from: data).id
  }

  // Days at airports, keyed "CODE YYYY-MM-DD"; a day with nothing to give is absent.
  func weather(_ keys: [String]) async throws -> [String: WeatherDay] {
    struct Answer: Decodable { var days: [String: WeatherDay?] }
    var components = URLComponents(url: Self.origin.appending(path: "api/weather"), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "at", value: keys.map { $0.replacingOccurrences(of: " ", with: ":") }.joined(separator: ","))]
    var request = URLRequest(url: components.url!)
    request.setValue("ios", forHTTPHeaderField: "X-Flyprint-Client")
    let (data, response) = try await session.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Failure.code("server") }
    return try JSONDecoder().decode(Answer.self, from: data).days.compactMapValues { $0 }
  }

  func airports(_ query: String) async throws -> AirportAnswer {
    var components = URLComponents(url: Self.origin.appending(path: "api/airports"), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "q", value: query)]
    var request = URLRequest(url: components.url!)
    request.setValue("ios", forHTTPHeaderField: "X-Flyprint-Client")
    let (data, _) = try await session.data(for: request)
    return try JSONDecoder().decode(AirportAnswer.self, from: data)
  }

  func deleteFlight(token: String, id: String) async throws {
    let (data, status) = try await request("api/flights/\(id)", method: "DELETE", token: token)
    try check(data, status)
  }

  func export(token: String) async throws -> Data {
    let (data, status) = try await request("api/export", token: token)
    try check(data, status)
    return data
  }

  private func failure(_ data: Data) -> Failure {
    .code((try? JSONDecoder().decode(Answer.self, from: data))?.error ?? "server")
  }

  func startImport(token: String, text: String, uploads: [Upload]) async throws -> String {
    let boundary = "flyprint-\(UUID().uuidString)"
    var body = Data()
    func line(_ string: String) { body.append(Data(string.utf8)) }
    for upload in uploads {
      let name = upload.name.filter { $0 != "\"" && !$0.isNewline }
      line("--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(name)\"\r\nContent-Type: \(upload.type)\r\n\r\n")
      body.append(upload.data)
      line("\r\n")
    }
    if !text.isEmpty { line("--\(boundary)\r\nContent-Disposition: form-data; name=\"text\"\r\n\r\n\(text)\r\n") }
    line("--\(boundary)--\r\n")
    let (data, status) = try await send("api/imports", method: "POST", data: body, type: "multipart/form-data; boundary=\(boundary)", token: token)
    struct Started: Decodable { var id: String }
    guard status == 202, let started = try? JSONDecoder().decode(Started.self, from: data) else { throw failure(data) }
    return started.id
  }

  struct ImportSummary: Decodable { var id: String; var status: String }

  func imports(token: String) async throws -> [ImportSummary] {
    struct List: Decodable { var imports: [ImportSummary] }
    let (data, status) = try await request("api/imports", token: token)
    guard status == 200 else { throw failure(data) }
    return try JSONDecoder().decode(List.self, from: data).imports
  }

  func importRecord(token: String, id: String) async throws -> Data {
    let (data, status) = try await request("api/imports/\(id)", token: token)
    guard status == 200 else { throw failure(data) }
    return data
  }

  func saveImport(token: String, id: String, edits: [[String: Any]]) async throws -> Data {
    let (data, status) = try await request("api/imports/\(id)", method: "POST", body: ["action": "save", "edits": edits], token: token)
    guard status == 200 else { throw failure(data) }
    return data
  }

  func discardImport(token: String, id: String) async {
    _ = try? await request("api/imports/\(id)", method: "DELETE", token: token)
  }
}

// The session token lives in the keychain, readable only on this device after first unlock.
enum Keychain {
  private static let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "art.billpwchan.flyprint",
    kSecAttrAccount as String: "session",
  ]

  static var session: String? {
    get {
      var item: CFTypeRef?
      var search = query
      search[kSecReturnData as String] = true
      guard SecItemCopyMatching(search as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
      return String(data: data, encoding: .utf8)
    }
    set {
      SecItemDelete(query as CFDictionary)
      guard let newValue else { return }
      var item = query
      item[kSecValueData as String] = Data(newValue.utf8)
      item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      SecItemAdd(item as CFDictionary, nil)
    }
  }
}
