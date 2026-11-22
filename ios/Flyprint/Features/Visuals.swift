import MapKit
import SwiftUI

// The things pages show instead of describing them: the sky along a flight,
// a city from above, an airport's runways, the very airframe.

// Daylight along a flight as one line of colour: night a faint blue, the
// horizon a warm glow, day a pale warm white. Sunrises and sunsets are marked.
struct SkyStrip: View {
  let sky: Sky
  let minutes: Int
  var height: CGFloat = 3
  var glow = false
  // Share flown, for a flight in the air.
  var progress: Double?

  var body: some View {
    let tall = max(height * 3, progress == nil ? height * 2.6 : 16)
    GeometryReader { geometry in
      let width = geometry.size.width
      ZStack(alignment: .leading) {
        if glow {
          line.frame(height: height * 3).blur(radius: height * 2.2).opacity(0.55)
        }
        line.frame(height: height)
        ForEach(Array(sky.events.enumerated()), id: \.offset) { _, event in
          Circle()
            .fill(Color(red: 1, green: 0.8, blue: 0.58))
            .frame(width: height * 2.6, height: height * 2.6)
            .shadow(color: Color(red: 1, green: 0.66, blue: 0.4).opacity(0.9), radius: height * 1.6)
            .offset(x: width * Double(event.minute) / Double(max(1, minutes)) - height * 1.3)
        }
        if let progress {
          Image(systemName: "airplane")
            .font(.fp(13, .semibold))
            .foregroundStyle(Ink.primary)
            .offset(x: width * progress - 7)
        }
      }
      .frame(height: tall)
    }
    .frame(height: tall)
    .accessibilityHidden(true)
  }

  private var line: some View {
    Capsule().fill(LinearGradient(stops: sky.light.map { point in
      let c = skyLight(point.degrees)
      return Gradient.Stop(color: Color(red: c.x, green: c.y, blue: c.z, opacity: c.w), location: point.at)
    }, startPoint: .leading, endPoint: .trailing))
  }
}

extension Store {
  func sky(of flight: Flight) -> Sky? {
    guard let departAt = flight.departAt, flight.durationMinutes > 0,
          let from = position(flight.origin), let to = position(flight.destination) else { return nil }
    return skyAlong(from: from, to: to, departAt: departAt, minutes: flight.durationMinutes)
  }

  // Sunrise and sunset on the way, with the window to watch from.
  func skyLine(_ sky: Sky) -> String? {
    let lang = self.lang
    let lines = sky.events.enumerated().map { index, event -> String in
      let after = event.minute < 60 ? lang.t("\(event.minute) 分钟", "\(event.minute) 分鐘", "\(event.minute) min") : Format.duration(minutes: event.minute, lang)
      let side = event.left
      switch event.kind {
      case .sunrise:
        let line = lang.t("起飞 \(after)后日出，在\(side ? "左" : "右")侧窗外", "起飛 \(after)後日出，在\(side ? "左" : "右")邊窗外", "Sunrise \(after) after take-off, off the \(side ? "left" : "right") side")
        return index > 0 && lang == .en ? line.prefix(1).lowercased() + line.dropFirst() : line
      case .sunset:
        let line = lang.t("起飞 \(after)后日落，在\(side ? "左" : "右")侧窗外", "起飛 \(after)後日落，在\(side ? "左" : "右")邊窗外", "Sunset \(after) after take-off, off the \(side ? "left" : "right") side")
        return index > 0 && lang == .en ? line.prefix(1).lowercased() + line.dropFirst() : line
      }
    }
    if !lines.isEmpty { return lines.joined(separator: lang == .en ? "; " : "；") }
    return sky.allDark ? lang.t("全程夜航", "全程夜航", "Dark all the way") : nil
  }

  // The window to sit by for the sunrise or sunset on a flight still ahead.
  func seatLine(_ sky: Sky, _ flight: Flight) -> String? {
    guard let event = sky.events.first else { return nil }
    let lang = self.lang
    let body = flight.aircraft?.body
    let what = event.kind == .sunrise ? lang.t("日出", "日出", "the sunrise") : lang.t("日落", "日落", "the sunset")
    if let seat = flight.seat, let yours = seatSide(seat, body: body) {
      let side = yours.left ? lang.t("左侧", "左側", "the left") : lang.t("右侧", "右側", "the right")
      return yours.left == event.left
        ? lang.t("你的 \(seat) 在\(side)，看得到\(what)", "你的 \(seat) 在\(side)，看得到\(what)", "Seat \(seat) is on \(side), facing \(what)")
        : lang.t("你的 \(seat) 在\(side)，\(what)在另一侧", "你的 \(seat) 在\(side)，\(what)在另一側", "Seat \(seat) is on \(side); \(what) is on the other side")
    }
    let letter = event.left ? "A" : body == "widebody" ? "K" : body == "narrowbody" ? "F" : nil
    guard let letter else { return nil }
    return lang.t("选 \(letter) 座靠窗可以看到", "選 \(letter) 座靠窗可以看到", "A window seat at \(letter) will see it")
  }
}

// MARK: Cities from above

// A city's own satellite picture from Apple Maps, found by its name so the
// frame holds the city rather than its airport, and kept on disk.
@MainActor
final class PlaceImagery {
  static let shared = PlaceImagery()
  private var running: [String: Task<UIImage?, Never>] = [:]
  private var memory: [String: UIImage] = [:]

  private static let folder: URL = {
    let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "places", directoryHint: .isDirectory)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }()

  func cached(_ key: String) -> UIImage? {
    if let image = memory[key] { return image }
    guard let image = UIImage(contentsOfFile: Self.folder.appending(path: "\(key).jpg").path) else { return nil }
    memory[key] = image
    return image
  }

  func image(key: String, query: String, near: CLLocationCoordinate2D, size: CGSize, distance: Double, pitch: Double) async -> UIImage? {
    if let image = cached(key) { return image }
    if let task = running[key] { return await task.value }
    let task = Task<UIImage?, Never> {
      let found = await Self.center(of: query, near: near)
      let center = found ?? near
      let options = MKMapSnapshotter.Options()
      options.preferredConfiguration = MKImageryMapConfiguration(elevationStyle: pitch > 0 ? .realistic : .flat)
      // Drawn larger than shown and cut to the middle: the mark Apple draws in
      // the corner would cover a small picture, so pages credit the imagery in words.
      let grow = max(1, 320 / min(size.width, size.height))
      let inner = CGSize(width: size.width * grow, height: size.height * grow)
      let margin = 48.0
      options.size = CGSize(width: inner.width + margin * 2, height: inner.height + margin * 2)
      options.camera = MKMapCamera(lookingAtCenter: center, fromDistance: distance * options.size.height / inner.height, pitch: pitch, heading: 0)
      // Sizes here are pixels already.
      options.traitCollection = UITraitCollection { $0.userInterfaceStyle = .dark; $0.displayScale = 1 }
      guard let snapshot = try? await MKMapSnapshotter(options: options).start() else { return nil }
      let full = snapshot.image
      let crop = CGRect(x: margin * full.scale, y: margin * full.scale, width: inner.width * full.scale, height: inner.height * full.scale)
      guard let cut = full.cgImage?.cropping(to: crop) else { return nil }
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let cg = UIGraphicsImageRenderer(size: size, format: format).image { _ in
        UIImage(cgImage: cut).draw(in: CGRect(origin: .zero, size: size))
      }.cgImage!
      let image = UIImage(cgImage: cg)
      // A picture centred on the airport stands in for now and is not kept.
      if found != nil, let data = image.jpegData(compressionQuality: 0.82) {
        try? data.write(to: Self.folder.appending(path: "\(key).jpg"))
      }
      return image
    }
    running[key] = task
    let image = await task.value
    running[key] = nil
    if let image { memory[key] = image }
    return image
  }

  private static var centers: [String: CLLocationCoordinate2D] = [:]
  private static var lookups: [String: Task<CLLocationCoordinate2D?, Never>] = [:]

  // One lookup per name at a time: the geocoder throttles a burst of the same question.
  private static func center(of query: String, near: CLLocationCoordinate2D) async -> CLLocationCoordinate2D? {
    if let known = centers[query] { return known }
    if let running = lookups[query] { return await running.value }
    let task = Task { await lookup(query, near: near) }
    lookups[query] = task
    let found = await task.value
    lookups[query] = nil
    if let found { centers[query] = found }
    return found
  }

  private static func lookup(_ query: String, near: CLLocationCoordinate2D) async -> CLLocationCoordinate2D? {
    let airport = CLLocation(latitude: near.latitude, longitude: near.longitude)
    // A name that resolves far from the airport is another place with that name.
    func close(_ item: MKMapItem?) -> CLLocationCoordinate2D? {
      guard let location = item?.location, location.distance(from: airport) < 90_000 else { return nil }
      return location.coordinate
    }
    var found: CLLocationCoordinate2D?
    if let request = MKGeocodingRequest(addressString: query) {
      let location: CLLocation? = await withCheckedContinuation { done in
        request.getMapItems { items, _ in done.resume(returning: items?.first?.location) }
      }
      if let location, location.distance(from: airport) < 90_000 { found = location.coordinate }
    }
    if found == nil {
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      request.resultTypes = .address
      request.region = MKCoordinateRegion(center: near, latitudinalMeters: 120_000, longitudinalMeters: 120_000)
      found = close(try? await MKLocalSearch(request: request).start().mapItems.first)
    }
    #if DEBUG
    if found == nil { print("[imagery] no centre for \(query)") }
    #endif
    return found
  }
}

// The picture of a city: a flat view from above for a list, a raised one for a page.
struct CityImage: View {
  @Environment(Store.self) private var store
  let code: String
  var pitched = false
  var size: CGSize
  @State private var image: UIImage?

  var body: some View {
    ZStack {
      // While the imagery loads: a tile in the sheet's own tone, not a black hole.
      Ink.primary.opacity(0.06)
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .saturation(0.88)
          .brightness(-0.05)
          .transition(.opacity)
      }
    }
    .frame(width: size.width, height: size.height)
    .clipped()
    .task(id: code) {
      if let cached = PlaceImagery.shared.cached(key) { image = cached; return }
      guard let place = store.place(code) else { return }
      let near = CLLocationCoordinate2D(latitude: place.coordinates[1], longitude: place.coordinates[0])
      let query = [place.city.last, store.archive.countries[place.country]?.last].compactMap { $0 }.joined(separator: ", ")
      let scale = UIScreen.main.scale
      let fetched = await PlaceImagery.shared.image(key: key, query: query, near: near,
                                                    size: CGSize(width: size.width * min(scale, 2), height: size.height * min(scale, 2)),
                                                    distance: pitched ? 9_000 : 30_000, pitch: pitched ? 50 : 0)
      withAnimation(.easeOut(duration: 0.35)) { image = fetched }
    }
    .accessibilityHidden(true)
  }

  private var key: String { "v5-\(metroOf(code))-\(pitched ? "p" : "f")-\(Int(size.width))x\(Int(size.height))" }
}

// MARK: Airports

// An airport's surveyed runways, from OurAirports through the server's table.
enum Runways {
  // [lon1, lat1, lon2, lat2, width m, end1, end2, length m]
  private struct Table: Decodable {
    var runways: [String: [[Value]]]
  }
  private enum Value: Decodable {
    case number(Double), text(String)
    init(from decoder: Decoder) throws {
      let container = try decoder.singleValueContainer()
      if let number = try? container.decode(Double.self) { self = .number(number) } else { self = .text(try container.decode(String.self)) }
    }
    var number: Double { if case .number(let n) = self { n } else { 0 } }
    var text: String { switch self { case .text(let t): t; case .number(let n): String(Int(n)) } }
  }

  struct Runway: Sendable {
    var a: LngLat
    var b: LngLat
    var width: Double
    var length: Double
    var ends: (String, String)
  }

  private static let table: [String: [[Value]]] = {
    guard let url = Bundle.main.url(forResource: "runways", withExtension: "json"),
          let data = try? Data(contentsOf: url) else { return [:] }
    return (try? JSONDecoder().decode(Table.self, from: data))?.runways ?? [:]
  }()

  static func of(_ code: String) -> [Runway] {
    (table[code] ?? []).compactMap { row in
      guard row.count >= 8 else { return nil }
      return Runway(a: LngLat(row[0].number, row[1].number), b: LngLat(row[2].number, row[3].number), width: row[4].number, length: row[7].number, ends: (row[5].text, row[6].text))
    }
  }
}

// Runways drawn to scale, north up, as light bars on the dark sheet, each
// end labelled with its number as on an airport diagram.
struct RunwayDiagram: View {
  let code: String

  var body: some View {
    let runways = Runways.of(code)
    Canvas { context, size in
      guard !runways.isEmpty else { return }
      let lat0 = runways.map { ($0.a.lat + $0.b.lat) / 2 }.reduce(0, +) / Double(runways.count)
      let k = cos(lat0 * .pi / 180)
      func metres(_ p: LngLat) -> CGPoint { CGPoint(x: p.lng * 111_320 * k, y: -p.lat * 110_540) }
      let points = runways.flatMap { [metres($0.a), metres($0.b)] }
      let minX = points.map(\.x).min()!, maxX = points.map(\.x).max()!
      let minY = points.map(\.y).min()!, maxY = points.map(\.y).max()!
      let span = max(maxX - minX, maxY - minY, 1)
      let label: CGFloat = 16
      let scale = (min(size.width, size.height) - label * 2) / span
      let offset = CGPoint(x: size.width / 2 - (minX + maxX) / 2 * scale, y: size.height / 2 - (minY + maxY) / 2 * scale)
      let ink = Color(red: 228 / 255, green: 236 / 255, blue: 247 / 255)
      var labels: [(String, CGPoint)] = []
      for runway in runways {
        let a = metres(runway.a), b = metres(runway.b)
        let pa = CGPoint(x: a.x * scale + offset.x, y: a.y * scale + offset.y)
        let pb = CGPoint(x: b.x * scale + offset.x, y: b.y * scale + offset.y)
        var path = Path()
        path.move(to: pa)
        path.addLine(to: pb)
        context.stroke(path, with: .color(ink.opacity(0.88)), style: StrokeStyle(lineWidth: max(3, runway.width * 1.5 * scale), lineCap: .butt))
        let length = max(1, hypot(pb.x - pa.x, pb.y - pa.y))
        let ux = (pb.x - pa.x) / length, uy = (pb.y - pa.y) / length
        for (end, at, sign) in [(runway.ends.0, pa, -1.0), (runway.ends.1, pb, 1.0)] where !end.isEmpty {
          labels.append((end, CGPoint(x: at.x + ux * sign * 10, y: at.y + uy * sign * 10)))
        }
      }
      // Numbers that would sit on one another are left out; the first of a pair stays.
      var placed: [CGRect] = []
      for (end, p) in labels {
        let rect = CGRect(x: p.x - 10, y: p.y - 6, width: 20, height: 12)
        guard !placed.contains(where: { $0.intersects(rect) }) else { continue }
        placed.append(rect)
        context.draw(Text(end).font(.system(size: 9, weight: .medium)).monospacedDigit().foregroundStyle(Ink.tertiary), at: p)
      }
    }
    .accessibilityHidden(true)
  }
}

// MARK: The airframe

// A photo of the very aircraft, by registration, from Planespotters, credited
// to its photographer and linked to the original.
struct AirframePhoto: View {
  let registration: String
  @State private var photo: Photo?
  @Environment(\.openURL) private var openURL

  struct Photo: Sendable {
    var image: URL
    var link: URL
    var photographer: String
  }

  var body: some View {
    Group {
      if let photo {
        VStack(alignment: .trailing, spacing: 6) {
          AsyncImage(url: photo.image) { image in
            image.resizable().scaledToFill()
          } placeholder: { Ink.ground }
            .frame(maxWidth: .infinity)
            .aspectRatio(498 / 280, contentMode: .fit)
            .clipShape(.rect(cornerRadius: 14))
          Button { openURL(photo.link) } label: {
            Text("© \(photo.photographer) · Planespotters").font(.micro).foregroundStyle(Ink.tertiary)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .task(id: registration) { photo = await Self.fetch(registration) }
  }

  private static var cache: [String: Photo?] = [:]

  private static func fetch(_ registration: String) async -> Photo? {
    if let known = cache[registration] { return known }
    var request = URLRequest(url: URL(string: "https://api.planespotters.net/pub/photos/reg/\(registration.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? registration)")!)
    request.setValue("Flyprint/1.0 (+https://flyprint.billpwchan.art)", forHTTPHeaderField: "User-Agent")
    guard let (data, _) = try? await URLSession.shared.data(for: request),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let first = (json["photos"] as? [[String: Any]])?.first,
          let large = (first["thumbnail_large"] as? [String: Any])?["src"] as? String,
          let image = URL(string: large),
          let linkText = first["link"] as? String, let link = URL(string: linkText),
          link.host()?.hasSuffix("planespotters.net") == true else {
      cache[registration] = .some(nil)
      return nil
    }
    let photo = Photo(image: image, link: link, photographer: first["photographer"] as? String ?? "")
    cache[registration] = photo
    return photo
  }
}

// Pages that show cities from above say where the pictures come from.
struct ImageryCredit: View {
  @Environment(Store.self) private var store
  var body: some View {
    Text(store.lang.t("城市影像 © Apple 地图", "城市影像 © Apple 地圖", "City imagery © Apple Maps")).font(.micro).foregroundStyle(Ink.faint)
  }
}

// MARK: Countries

// Each country's own outline (scripts/build-ios-countries.mjs), on an
// equal-area projection centred on it, with the projection kept so a city
// can be placed on the shape.
enum Countries {
  private struct Outline: Decodable {
    var center: [Double]
    var scale: Double
    var translate: [Double]
    var box: [Double]
    var d: String
    // A country of scattered islands: the coasts around it, and a ring round its islands.
    var around: String?
    var ring: [Double]?
  }

  private static let outlines: [String: Outline] = {
    guard let url = Bundle.main.url(forResource: "countries", withExtension: "json"),
          let data = try? Data(contentsOf: url) else { return [:] }
    return (try? JSONDecoder().decode([String: Outline].self, from: data)) ?? [:]
  }()
  private static var paths: [String: Path] = [:]
  private static var arounds: [String: Path] = [:]

  static func locator(_ iso: String) -> (around: Path, ring: CGRect)? {
    let key = iso.uppercased()
    guard let outline = outlines[key], let d = outline.around, let ring = outline.ring, ring.count == 3 else { return nil }
    let circle = CGRect(x: ring[0] - ring[2], y: ring[1] - ring[2], width: ring[2] * 2, height: ring[2] * 2)
    if let path = arounds[key] { return (path, circle) }
    let path = svgPath(d)
    arounds[key] = path
    return (path, circle)
  }

  static func shape(_ iso: String) -> (path: Path, box: CGRect)? {
    let key = iso.uppercased()
    guard let outline = outlines[key], outline.box.count == 4 else { return nil }
    let box = CGRect(x: outline.box[0], y: outline.box[1], width: outline.box[2] - outline.box[0], height: outline.box[3] - outline.box[1])
    if let path = paths[key] { return (path, box) }
    let path = svgPath(outline.d)
    paths[key] = path
    return (path, box)
  }

  // Where a point falls on the country's drawing (d3's azimuthal equal-area).
  // Roughly the middle of a country, for facing the globe toward it.
  static func middle(_ iso: String) -> LngLat? {
    guard let outline = outlines[iso.uppercased()], outline.center.count == 2 else { return nil }
    return LngLat(outline.center[0], outline.center[1])
  }

  static func place(_ iso: String, _ point: LngLat) -> CGPoint? {
    guard let outline = outlines[iso.uppercased()], outline.center.count == 2, outline.translate.count == 2 else { return nil }
    let rad = Double.pi / 180
    let lambda = (point.lng - outline.center[0]) * rad, phi = point.lat * rad, phi0 = outline.center[1] * rad
    let cosc = sin(phi0) * sin(phi) + cos(phi0) * cos(phi) * cos(lambda)
    guard cosc > -0.99 else { return nil }
    let k = sqrt(2 / (1 + cosc))
    let x = k * cos(phi) * sin(lambda)
    let y = k * (cos(phi0) * sin(phi) - sin(phi0) * cos(phi) * cos(lambda))
    return CGPoint(x: outline.translate[0] + outline.scale * x, y: outline.translate[1] - outline.scale * y)
  }
}

// A country as its shape, lit; a city on it as a point of light.
struct CountryMark: View {
  @Environment(Store.self) private var store
  let iso: String
  var size: CGFloat = 28
  var city: LngLat?
  var color: Color?

  var body: some View {
    let fill = color ?? store.tone
    Canvas { context, canvas in
      guard let (path, box) = Countries.shape(iso) else { return }
      let scale = min(canvas.width / box.width, canvas.height / box.height)
      let offset = CGPoint(x: (canvas.width - box.width * scale) / 2 - box.minX * scale, y: (canvas.height - box.height * scale) / 2 - box.minY * scale)
      let place = CGAffineTransform(translationX: offset.x, y: offset.y).scaledBy(x: scale, y: scale)
      let placed = path.applying(place)
      let locator = Countries.locator(iso)
      if let locator {
        context.fill(locator.around.applying(place), with: .color(fill.opacity(0.2)))
      }
      var glow = context
      glow.addFilter(.blur(radius: max(1.5, size * 0.06)))
      glow.fill(placed, with: .color(fill.opacity(0.45)))
      // Stroked too, so a country of small islands still shows; in one layer,
      // so the rim is no denser than the land.
      context.drawLayer { land in
        land.opacity = city == nil ? 0.9 : 0.55
        land.fill(placed, with: .color(fill))
        land.stroke(placed, with: .color(fill), style: StrokeStyle(lineWidth: max(0.8, 2.4 * scale), lineJoin: .round))
      }
      if let locator {
        context.stroke(Path(ellipseIn: locator.ring.applying(place)), with: .color(fill.opacity(0.75)), lineWidth: max(0.8, 2.4 * scale))
      }
      // A city in a territory the outline leaves out (Okinawa, the Canaries) gets no dot.
      if let city, let at = Countries.place(iso, city), box.insetBy(dx: -4, dy: -4).contains(at) {
        let p = CGPoint(x: at.x * scale + offset.x, y: at.y * scale + offset.y)
        let r = max(2.5, size * 0.05)
        var halo = context
        halo.addFilter(.blur(radius: r * 1.6))
        halo.fill(Path(ellipseIn: CGRect(x: p.x - r * 2, y: p.y - r * 2, width: r * 4, height: r * 4)), with: .color(.white.opacity(0.8)))
        context.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)), with: .color(.white))
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

// A city as a card: its imagery, with its name and airports over a dark foot.
struct CityCard: View {
  @Environment(Store.self) private var store
  let metro: String
  let width: CGFloat

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      CityImage(code: store.anchor(metro), size: CGSize(width: width.rounded(), height: 110))
      LinearGradient(colors: [.clear, Ink.ground.opacity(0.85)], startPoint: .center, endPoint: .bottom)
      VStack(alignment: .leading, spacing: 1) {
        Text(store.cityName(metro)).font(.headline).lineLimit(1)
        Text(store.airports(in: metro).joined(separator: " · ")).font(.micro).monospacedDigit().foregroundStyle(Ink.secondary)
      }
      .padding(10)
    }
    .frame(height: 110)
    .frame(maxWidth: .infinity)
    .clipShape(.rect(cornerRadius: 14, style: .continuous))
  }
}
