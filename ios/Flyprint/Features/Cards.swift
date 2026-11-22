import SwiftUI
import UIKit

// Pictures made to be sent: a year (or every year), a trip, a flight. Each is
// the night globe with the flights drawn as light, and time in the air shown
// as the colour of the sky outside the window. Laid out on a 360 × 480 point
// card and printed at four times that, 1440 × 1920.

enum Card {
  static let size = CGSize(width: 360, height: 480)
  static let scale: CGFloat = 4
  static let margin: CGFloat = 20
}

// MARK: The sky, for print

// The app's sky colours, with night lifted enough to read on a dark card.
func cardSky(_ degrees: Double) -> Color {
  let c = skyLight(degrees)
  let alpha = 0.42 + 0.58 * (c.w - 0.24) / (0.86 - 0.24)
  return Color(red: c.x, green: c.y, blue: c.z, opacity: min(1, max(0.42, alpha)))
}

// One flight's sky from take-off (bottom) to landing (top).
func skyGradient(_ sky: Sky?) -> Gradient {
  guard let sky, !sky.light.isEmpty else { return Gradient(colors: [cardSky(20), cardSky(20)]) }
  let step = max(1, sky.light.count / 24)
  var stops: [Gradient.Stop] = []
  for (index, point) in sky.light.enumerated() where index % step == 0 || index == sky.light.count - 1 {
    stops.append(.init(color: cardSky(point.degrees), location: point.at))
  }
  return Gradient(stops: stops)
}

// MARK: The mark

// One flight leaving home over the curve of the earth (app/lib/mark.mjs).
struct BrandMark: View {
  var body: some View {
    Canvas { context, size in
      let k = size.width / 52
      context.scaleBy(x: k, y: k)
      var horizon = Path()
      horizon.move(to: CGPoint(x: 1, y: 42.5))
      horizon.addQuadCurve(to: CGPoint(x: 51, y: 42.5), control: CGPoint(x: 26, y: 33))
      context.stroke(horizon, with: .color(Color(red: 143 / 255, green: 182 / 255, blue: 230 / 255, opacity: 0.5)), lineWidth: 0.8)
      context.fill(BrandMark.trail, with: .linearGradient(
        Gradient(stops: [.init(color: .white.opacity(0.25), location: 0), .init(color: .white.opacity(0.9), location: 0.55), .init(color: .white, location: 1)]),
        startPoint: CGPoint(x: 4, y: 0), endPoint: CGPoint(x: 48, y: 0)))
      context.fill(Path(ellipseIn: CGRect(x: 1, y: 37, width: 6, height: 6)), with: .color(Color(red: 243 / 255, green: 207 / 255, blue: 127 / 255)))
      context.fill(Path(ellipseIn: CGRect(x: 45.8, y: 37.8, width: 4.4, height: 4.4)), with: .color(.white))
    }
    .aspectRatio(52 / 44, contentMode: .fit)
  }

  private static let trail: Path = {
    let from = CGPoint(x: 4, y: 40), control = CGPoint(x: 26, y: -10), to = CGPoint(x: 48, y: 40)
    var left: [CGPoint] = [], right: [CGPoint] = []
    for step in 0...48 {
      let t = CGFloat(step) / 48
      let x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * control.x + t * t * to.x
      let y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * control.y + t * t * to.y
      let dx = 2 * (1 - t) * (control.x - from.x) + 2 * t * (to.x - control.x)
      let dy = 2 * (1 - t) * (control.y - from.y) + 2 * t * (to.y - control.y)
      let length = hypot(dx, dy)
      let half = (0.6 + (4 - 0.6) * pow(t, 0.8)) / 2
      left.append(CGPoint(x: x - dy / length * half, y: y + dx / length * half))
      right.append(CGPoint(x: x + dy / length * half, y: y - dx / length * half))
    }
    var path = Path()
    path.addLines(left + right.reversed())
    path.closeSubpath()
    return path
  }()
}

// MARK: Names on the globe

struct PlacedName: Identifiable {
  var id: String
  var text: String
  var center: CGPoint
  var dot: CGPoint
  var strong: Bool
}

// Each name beside its city where it fits: right, left, above, below; clear of
// the names already placed and of the card's own text, and off the flights'
// lines where any side allows it.
func placeNames(_ wanted: [(code: String, text: String, at: LngLat, strong: Bool)], on still: GlobeStill, avoiding blocks: [CGRect], limit: Int) -> [PlacedName] {
  var taken = blocks
  var placed: [PlacedName] = []
  let bounds = CGRect(origin: .zero, size: still.size).insetBy(dx: 12, dy: 12)
  // The flights as drawn, as points no more than 3 apart, so a name can keep off them.
  var line: [CGPoint] = []
  for arc in still.arcs {
    var last: CGPoint?
    for v in arcPath(arc.from, arc.to, bow: arc.bow) {
      let point = still.project(v)
      if let point, let last {
        let steps = Int(ceil(hypot(point.x - last.x, point.y - last.y) / 3))
        for i in stride(from: 1, to: steps, by: 1) {
          let k = CGFloat(i) / CGFloat(steps)
          line.append(CGPoint(x: last.x + (point.x - last.x) * k, y: last.y + (point.y - last.y) * k))
        }
      }
      if let point { line.append(point) }
      last = point
    }
  }
  for item in wanted {
    guard placed.count < limit, let dot = still.project(item.at) else { continue }
    let font = UIFont.systemFont(ofSize: item.strong ? 9 : 8, weight: item.strong ? .semibold : .medium)
    let size = (item.text as NSString).size(withAttributes: [.font: font])
    let w = ceil(size.width), h = ceil(size.height)
    let gap: CGFloat = 5
    let spots = [
      CGPoint(x: dot.x + gap + w / 2, y: dot.y), CGPoint(x: dot.x - gap - w / 2, y: dot.y),
      CGPoint(x: dot.x, y: dot.y - gap - h / 2), CGPoint(x: dot.x, y: dot.y + gap + h / 2),
    ]
    let fits = spots.map { center in (center, CGRect(x: center.x - w / 2 - 2, y: center.y - h / 2 - 1, width: w + 4, height: h + 2)) }
      .filter { _, box in bounds.contains(box) && !taken.contains(where: { $0.intersects(box) }) }
    // Off the flights' lines where any side allows it.
    guard let (center, box) = fits.first(where: { _, box in !line.contains(where: box.contains) }) ?? fits.first else { continue }
    taken.append(box)
    taken.append(CGRect(x: dot.x - 3, y: dot.y - 3, width: 6, height: 6))
    placed.append(PlacedName(id: item.code, text: item.text, center: center, dot: dot, strong: item.strong))
  }
  return placed
}

struct GlobeNames: View {
  let names: [PlacedName]

  var body: some View {
    ZStack(alignment: .topLeading) {
      ForEach(names) { name in
        Text(name.text)
          .font(.system(size: name.strong ? 9 : 8, weight: name.strong ? .semibold : .medium))
          .foregroundStyle(.white.opacity(name.strong ? 0.92 : 0.66))
          .shadow(color: .black.opacity(0.9), radius: 2.5)
          .fixedSize()
          .position(name.center)
      }
    }
    .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
  }
}

// MARK: Time in the air

// One flight's time aloft: how long, the sky it flew through, and where on
// the way the sun came up or went down.
struct SkyMark {
  var minutes: Int
  var gradient: Gradient
  var suns: [(at: Double, rise: Bool)]
}

// Flights placed on a run of days: a column per day, as tall as the time
// aloft, coloured from take-off up to landing by the sky outside.
struct SkyRow {
  var days: Int
  var columns: [(day: Int, marks: [SkyMark])]
  var ticks: [(day: Int, label: String)]
}

struct SkyLine: View {
  let row: SkyRow
  let height: CGFloat
  var width: CGFloat = 1.5

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Canvas { context, size in
        let perDay = size.width / CGFloat(max(1, row.days))
        // Fourteen hours fill the band, unless a day held more: then that day
        // does, so a long-haul or a run of flights never reaches the words above.
        let tallest = max(14.0 * 60, row.columns.map { Double($0.marks.reduce(0) { $0 + $1.minutes }) }.max() ?? 0)
        let room = size.height - CGFloat(max(0, (row.columns.map(\.marks.count).max() ?? 1) - 1))
        let sun = Color(red: 1, green: 0.82, blue: 0.6)
        // A faint floor, so a quiet stretch still shows its length.
        context.fill(Path(CGRect(x: 0, y: size.height - 0.5, width: size.width, height: 0.5)), with: .color(.white.opacity(0.1)))
        var suns: [CGPoint] = []
        for column in row.columns {
          let x = (CGFloat(column.day) + 0.5) * perDay - width / 2
          var bottom = size.height
          for mark in column.marks {
            let h = max(1.5, CGFloat(Double(mark.minutes) / tallest) * room)
            let rect = CGRect(x: x, y: bottom - h, width: width, height: h)
            let shading = GraphicsContext.Shading.linearGradient(mark.gradient, startPoint: CGPoint(x: x, y: rect.maxY), endPoint: CGPoint(x: x, y: rect.minY))
            context.drawLayer { glow in
              glow.addFilter(.blur(radius: width * 1.5))
              glow.opacity = 0.6
              glow.fill(Path(rect.insetBy(dx: -width * 0.5, dy: -0.5)), with: shading)
            }
            context.fill(Path(roundedRect: rect, cornerRadius: width / 2), with: shading)
            for event in mark.suns { suns.append(CGPoint(x: x + width / 2, y: rect.maxY - CGFloat(event.at) * h)) }
            bottom -= h + 1
          }
        }
        // Where the sun came up or went down on the way.
        for point in suns {
          context.drawLayer { glow in
            glow.addFilter(.blur(radius: 2.2))
            glow.fill(Path(ellipseIn: CGRect(x: point.x - 2.6, y: point.y - 2.6, width: 5.2, height: 5.2)), with: .color(sun.opacity(0.9)))
          }
          context.fill(Path(ellipseIn: CGRect(x: point.x - 1.3, y: point.y - 1.3, width: 2.6, height: 2.6)), with: .color(sun))
        }
      }
      .frame(height: height)
      GeometryReader { geometry in
        let perDay = geometry.size.width / CGFloat(max(1, row.days))
        ForEach(Array(row.ticks.enumerated()), id: \.offset) { _, tick in
          Text(tick.label)
            .font(.system(size: 6.5, weight: .medium)).monospacedDigit()
            .foregroundStyle(.white.opacity(0.42))
            .fixedSize()
            .offset(x: CGFloat(tick.day) * perDay)
        }
      }
      .frame(height: 8)
    }
  }
}

enum Days {
  private static let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()

  static func between(_ a: String, _ b: String) -> Int {
    guard let x = Format.day(a), let y = Format.day(b) else { return 0 }
    return calendar.dateComponents([.day], from: x, to: y).day ?? 0
  }

  static func month(_ month: Int, _ lang: Lang) -> String {
    lang.isChinese ? "\(month)月" : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]
  }
}

// MARK: What a year held

struct YearStory {
  var year: Int?
  var flights: [Flight]
  var km: Double
  var minutes: Int
  var countries: Int
  var cities: Int
  var sunrises: Int
  var sunsets: Int
  // Places to name on the globe, home first, then where the year went most.
  var places: [String]
  var sky: SkyRow
  var span: (first: Int, last: Int)
  var first: String
  var last: String
}

extension Store {
  func yearStory(_ year: Int?) -> YearStory {
    let flights = landed(in: year).filter { $0.side != "them" }.sorted { ($0.date, $0.depart) < ($1.date, $1.depart) }
    var sunrises = 0, sunsets = 0
    let landedYears = Set(flights.map(\.year)).sorted()
    let firstYear = year ?? landedYears.first ?? 2000, lastYear = year ?? landedYears.last ?? firstYear
    let start = String(format: "%04d-01-01", firstYear)
    var byDay: [Int: [SkyMark]] = [:]
    for flight in flights {
      let sky = self.sky(of: flight)
      var suns: [(at: Double, rise: Bool)] = []
      for event in sky?.events ?? [] {
        if event.kind == .sunrise { sunrises += 1 } else { sunsets += 1 }
        suns.append((Double(event.minute) / Double(max(1, flight.durationMinutes)), event.kind == .sunrise))
      }
      byDay[Days.between(start, flight.date), default: []].append(SkyMark(minutes: flight.durationMinutes, gradient: skyGradient(sky), suns: suns))
    }
    let days = Days.between(start, String(format: "%04d-01-01", lastYear + 1))
    let ticks: [(day: Int, label: String)] = year == nil
      ? stride(from: firstYear, through: lastYear, by: lastYear - firstYear > 11 ? 2 : 1).map { (Days.between(start, String(format: "%04d-01-01", $0)), String($0)) }
      : (1...12).map { (Days.between(start, String(format: "%04d-%02d-01", firstYear, $0)), Days.month($0, lang)) }
    let sky = SkyRow(days: days, columns: byDay.sorted { $0.key < $1.key }.map { ($0.key, $0.value) }, ticks: ticks)
    var metroVisits: [String: Int] = [:]
    for flight in flights {
      metroVisits[metroOf(flight.origin), default: 0] += 1
      metroVisits[metroOf(flight.destination), default: 0] += 1
    }
    let end = String(format: "%04d-12-31", lastYear)
    let homes = response.homes.filter { $0.from <= end && ($0.to ?? "9999") >= start }.map { metroOf($0.code) }
    let ranked = metroVisits.sorted { a, b in
      let ha = homes.contains(a.key), hb = homes.contains(b.key)
      if ha != hb { return ha }
      return a.value > b.value || (a.value == b.value && a.key < b.key)
    }.map(\.key)
    return YearStory(
      year: year, flights: flights,
      km: flights.reduce(0) { $0 + $1.km },
      minutes: flights.reduce(0) { $0 + $1.durationMinutes },
      countries: countries(in: flights).count,
      cities: metroVisits.count,
      sunrises: sunrises, sunsets: sunsets,
      places: ranked, sky: sky, span: (firstYear, lastYear),
      first: flights.first?.date ?? "", last: flights.last?.date ?? "")
  }
}

// MARK: The year card

struct YearPoster: View {
  let story: YearStory
  let globe: CGImage
  let names: [PlacedName]
  let lang: Lang

  // The bands the card's own text holds; the globe and its names live between.
  static func top(_ story: YearStory) -> CGFloat { story.year == nil ? 124 : 104 }
  static let bottom: CGFloat = 386

  var body: some View {
    let ink = Color.white
    ZStack(alignment: .topLeading) {
      GlobeBackdrop(globe: globe, top: Self.top(story), bottom: Self.bottom, names: names)
      VStack(alignment: .leading, spacing: 0) {
        CardHeader(lang: lang, right: period)
        if story.year != nil {
          HStack(alignment: .lastTextBaseline, spacing: 10) {
            Text(title).font(.system(size: 60, weight: .semibold)).tracking(-1.8).monospacedDigit().foregroundStyle(ink.opacity(0.95))
              .lineLimit(1).fixedSize()
            Spacer(minLength: 0)
            figures(alignment: .trailing)
          }
          .padding(.top, 8)
        } else {
          Text(title).font(.system(size: 42, weight: .semibold)).tracking(-1.2).monospacedDigit().foregroundStyle(ink.opacity(0.95))
            .padding(.top, 10)
          figures(alignment: .leading).padding(.top, 4)
        }
        Spacer(minLength: 0)
        HStack(alignment: .firstTextBaseline) {
          Text(aloft).font(.system(size: 9, weight: .semibold)).monospacedDigit().foregroundStyle(ink.opacity(0.92))
          Spacer(minLength: 8)
          if let suns {
            HStack(spacing: 4) {
              Circle().fill(Color(red: 1, green: 0.82, blue: 0.6)).frame(width: 3, height: 3)
                .shadow(color: Color(red: 1, green: 0.7, blue: 0.45), radius: 2)
              Text(suns)
            }
            .font(.system(size: 8, weight: .medium)).monospacedDigit().foregroundStyle(ink.opacity(0.62))
          }
        }
        .padding(.bottom, 7)
        SkyLine(row: story.sky, height: 36, width: story.year == nil ? 1 : 1.5)
        CardFooter(note: lang.t("每一道是一次飞行，颜色是当时窗外的天色", "每一道是一次飛行，顏色是當時窗外的天色", "Each mark is a flight, in the colours of the sky outside"))
          .padding(.top, 7)
      }
      .padding(.horizontal, Card.margin)
      .padding(.top, 22)
      .padding(.bottom, 20)
      .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
    }
    .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
    .background(Ink.ground)
    .environment(\.locale, lang.locale)
  }

  private func figures(alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(String(story.flights.count)).font(.system(size: 15, weight: .semibold)).monospacedDigit().foregroundStyle(.white.opacity(0.95))
        Text(lang.t("次飞行", "次飛行", story.flights.count == 1 ? "flight" : "flights")).font(.system(size: 10, weight: .medium)).foregroundStyle(.white.opacity(0.62))
      }
      // One line where it fits beside the year, else two.
      ViewThatFits(in: .horizontal) {
        Text(facts.joined(separator: " · ")).fixedSize()
        Text(facts[0] + " · " + facts[1] + "\n" + facts[2]).fixedSize()
      }
      .font(.system(size: 8.5, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.62))
      .multilineTextAlignment(alignment == .trailing ? .trailing : .leading)
    }
  }

  private var title: String {
    if let year = story.year { return String(year) }
    return story.span.first == story.span.last ? String(story.span.first) : "\(story.span.first) – \(story.span.last)"
  }

  private var period: String {
    guard !story.first.isEmpty else { return "" }
    let a = story.first.replacingOccurrences(of: "-", with: "."), b = story.last.replacingOccurrences(of: "-", with: ".")
    return story.year == nil ? "\(a) – \(b)" : "\(a) – \(b.dropFirst(5))"
  }

  private var facts: [String] {
    let words = StoreWords(lang: lang)
    return [words.distance(story.km),
                 lang.t("\(story.cities) 座城市", "\(story.cities) 座城市", story.cities == 1 ? "1 city" : "\(story.cities) cities"),
            lang.t("\(story.countries) 个国家和地区", "\(story.countries) 個國家和地區", story.countries == 1 ? "1 country" : "\(story.countries) countries")]
  }

  private var aloft: String {
    let hours = Format.hours(minutes: story.minutes)
    return lang.t("在天上 \(hours) 小时", "在天上 \(hours) 小時", hours == 1 ? "1 hour in the air" : "\(hours) hours in the air")
  }

  private var suns: String? {
    let r = story.sunrises, s = story.sunsets
    guard r + s > 0 else { return nil }
    let rise = lang.t("\(r) 次日出", "\(r) 次日出", r == 1 ? "1 sunrise" : "\(r) sunrises")
    let set = lang.t("\(s) 次日落", "\(s) 次日落", s == 1 ? "1 sunset" : "\(s) sunsets")
    let both = r > 0 && s > 0 ? lang.t("\(rise)、\(set)", "\(rise)、\(set)", "\(rise) and \(set)") : (r > 0 ? rise : set)
    return lang.t("途中 \(both)", "途中 \(both)", "\(both) on the way")
  }
}

// MARK: What every card shares

struct CardHeader: View {
  let lang: Lang
  let right: String

  var body: some View {
    HStack(alignment: .center, spacing: 6) {
      BrandMark().frame(width: 17)
      Text(lang.t("航迹", "航跡", "Flyprint")).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.92))
      Spacer(minLength: 8)
      Text(right).font(.system(size: 8, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.42))
    }
  }
}

struct CardFooter: View {
  let note: String

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(note)
      Spacer(minLength: 8)
      Text("flyprint.billpwchan.art")
    }
    .font(.system(size: 6.5, weight: .medium))
    .foregroundStyle(.white.opacity(0.42))
  }
}

// The globe still behind a card, fading out under the card's own text.
struct GlobeBackdrop: View {
  let globe: CGImage
  let top: CGFloat
  let bottom: CGFloat
  let names: [PlacedName]

  var body: some View {
    ZStack(alignment: .topLeading) {
      Image(decorative: globe, scale: Card.scale)
      LinearGradient(stops: [.init(color: Ink.ground.opacity(0.92), location: 0), .init(color: Ink.ground.opacity(0), location: 1)],
                     startPoint: .top, endPoint: .bottom)
        .frame(height: top + 18)
      LinearGradient(stops: [.init(color: Ink.ground.opacity(0), location: 0), .init(color: Ink.ground.opacity(0.96), location: 0.55)],
                     startPoint: .top, endPoint: .bottom)
        .frame(height: Card.size.height - bottom + 28)
        .offset(y: bottom - 28)
      GlobeNames(names: names)
    }
    .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
  }
}

// Number words without a store, for views rendered off screen.
struct StoreWords {
  let lang: Lang
  func distance(_ km: Double) -> String {
    let one = NumberFormatter()
    one.locale = lang.locale
    one.maximumFractionDigits = 1
    one.minimumFractionDigits = 0
    // Halves up, as the web does: 26,500 km is 2.7 万 on both.
    one.roundingMode = .halfUp
    if lang.isChinese && km >= 10_000 { return "\(one.string(from: NSNumber(value: km / 10_000)) ?? "") " + lang.t("万公里", "萬公里", "") }
    // No more figures than a distance flown is good for.
    let rounded = lang.isChinese ? km : km >= 100_000 ? (km / 1000).rounded() * 1000 : km >= 10_000 ? (km / 100).rounded() * 100 : km
    return "\(Format.number(rounded, lang)) " + lang.t("公里", "公里", "km")
  }
}

// MARK: A trip

// A trip laid out in time: bright where it was in the air (in the colours of
// the sky outside), a quiet line where it stayed, each place named over its stay.
struct TripPiece {
  var air: Bool
  var hours: Double
  var gradient: Gradient?
  var suns: [Double]
  var city: String
  var nights: Int
  var change = false
}

struct TripLine: View {
  let pieces: [TripPiece]
  let from: String
  let to: String
  let start: String
  let end: String
  let lang: Lang

  var body: some View {
    GeometryReader { geometry in
      let widths = TripLine.widths(pieces, total: geometry.size.width)
      let lineY: CGFloat = 16
      ZStack(alignment: .topLeading) {
        Canvas { context, _ in
          var x: CGFloat = 0
          let sun = Color(red: 1, green: 0.82, blue: 0.6)
          for (piece, w) in zip(pieces, widths) {
            if piece.air, let gradient = piece.gradient {
              let rect = CGRect(x: x + 1, y: lineY - 2, width: max(1, w - 2), height: 4)
              let shading = GraphicsContext.Shading.linearGradient(gradient, startPoint: CGPoint(x: rect.minX, y: 0), endPoint: CGPoint(x: rect.maxX, y: 0))
              context.drawLayer { glow in
                glow.addFilter(.blur(radius: 3))
                glow.opacity = 0.7
                glow.fill(Path(roundedRect: rect.insetBy(dx: -1, dy: -1.5), cornerRadius: 3), with: shading)
              }
              context.fill(Path(roundedRect: rect, cornerRadius: 2), with: shading)
              for at in piece.suns {
                let p = CGPoint(x: rect.minX + rect.width * at, y: lineY)
                context.drawLayer { glow in
                  glow.addFilter(.blur(radius: 2.2))
                  glow.fill(Path(ellipseIn: CGRect(x: p.x - 3, y: p.y - 3, width: 6, height: 6)), with: .color(sun.opacity(0.9)))
                }
                context.fill(Path(ellipseIn: CGRect(x: p.x - 1.5, y: p.y - 1.5, width: 3, height: 3)), with: .color(sun))
              }
            } else {
              context.fill(Path(CGRect(x: x, y: lineY - 0.5, width: w, height: 1)), with: .color(.white.opacity(0.22)))
            }
            x += w
          }
          // The ends: where the trip began and where it came back to.
          for end in [CGFloat(0), x] {
            context.fill(Path(ellipseIn: CGRect(x: end - 2, y: lineY - 2, width: 4, height: 4)), with: .color(.white.opacity(0.9)))
          }
        }
        ForEach(Array(labels(widths).enumerated()), id: \.offset) { _, label in
          VStack(alignment: label.align, spacing: 13) {
            Text(label.city).font(.system(size: 9, weight: .semibold)).foregroundStyle(.white.opacity(0.92))
            Text(label.note).font(.system(size: 7.5, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.5))
          }
          .fixedSize()
          .frame(width: 0, alignment: Alignment(horizontal: label.align, vertical: .top))
          .offset(x: label.x, y: 0)
        }
      }
    }
    .frame(height: 44)
  }

  private struct Label { var x: CGFloat; var city: String; var note: String; var align: HorizontalAlignment }

  // Names over the stays wide enough to hold them; the ends carry the dates.
  private func labels(_ widths: [CGFloat]) -> [Label] {
    var result: [Label] = []
    var x: CGFloat = 0
    let total = widths.reduce(0, +)
    result.append(Label(x: 0, city: from, note: start, align: .leading))
    result.append(Label(x: total, city: to, note: end, align: .trailing))
    // The longest stays first, so the place the trip went to is named before
    // the cities passed through. The web card does the same.
    // Measured as drawn, as the web card measures them.
    func width(_ text: String, _ size: CGFloat, _ weight: UIFont.Weight) -> CGFloat {
      (text as NSString).size(withAttributes: [.font: UIFont.systemFont(ofSize: size, weight: weight)]).width
    }
    // Names a word space apart would read as one name; 12 keeps them apart.
    let gap: CGFloat = 12
    var taken: [ClosedRange<CGFloat>] = [0...width(from, 9, .semibold), (total - width(to, 9, .semibold))...total]
    var stays: [(piece: TripPiece, start: CGFloat, end: CGFloat)] = []
    for (piece, w) in zip(pieces, widths) {
      if !piece.air { stays.append((piece, x, x + w)) }
      x += w
    }
    for (piece, start, end) in stays.sorted(by: { $0.piece.nights > $1.piece.nights }) {
      let note = piece.change ? lang.t("转机", "轉機", "change")
        : piece.nights > 0 ? lang.t("\(piece.nights) 晚", "\(piece.nights) 晚", piece.nights == 1 ? "1 night" : "\(piece.nights) nights")
        : lang.t("当天", "即日", "same day")
      let half = max(width(piece.city, 9, .semibold), width(note, 7.5, .medium), 28) / 2
      // Over the middle of its stay if there is room, else slid along it, as
      // long as it still stands over the stay it names.
      let middle = (start + end) / 2
      let clear = { (at: CGFloat) in !taken.contains { at - half - gap < $0.upperBound && at + half + gap > $0.lowerBound } }
      let tries = [middle] + taken.flatMap { [$0.lowerBound - gap - half, $0.upperBound + gap + half] }
      guard let at = tries.filter({ $0 >= start && $0 <= end && clear($0) }).min(by: { abs($0 - middle) < abs($1 - middle) }) else { continue }
      result.append(Label(x: at, city: piece.city, note: note, align: .center))
      taken.append((at - half)...(at + half))
    }
    return result
  }

  // Each piece as long as it lasted, but a flight never thinner than a mark
  // and a stay never so short its name can't sit over it.
  static func widths(_ pieces: [TripPiece], total: CGFloat) -> [CGFloat] {
    let hours = pieces.reduce(0) { $0 + max(0.01, $1.hours) }
    var widths = pieces.map { CGFloat(max(0.01, $0.hours) / hours) * total }
    let least: (TripPiece) -> CGFloat = { $0.air ? 10 : 6 }
    for _ in 0..<3 {
      let short = zip(pieces, widths).map { $1 < least($0) }
      let fixed = zip(pieces, short).reduce(CGFloat(0)) { $0 + ($1.1 ? least($1.0) : 0) }
      let free = zip(widths, short).reduce(CGFloat(0)) { $0 + ($1.1 ? 0 : $1.0) }
      guard free > 0, fixed < total else { break }
      let k = (total - fixed) / free
      widths = zip(zip(pieces, widths), short).map { item, isShort in isShort ? least(item.0) : item.1 * k }
    }
    return widths
  }
}

struct TripStory {
  var title: String
  var facts: String
  var dates: String
  var flights: [Flight]
  var km: Double
  var minutes: Int
  var sunrises: Int
  var sunsets: Int
  var pieces: [TripPiece]
  var start: String
  var end: String
  var from: String
  var to: String
}

extension Store {
  func tripStory(_ trip: Trip) -> TripStory {
    // In the trip's own order: its gaps are numbered by it.
    let legs = self.legs(of: trip)
    var pieces: [TripPiece] = []
    var sunrises = 0, sunsets = 0
    for (index, leg) in legs.enumerated() {
      let sky = self.sky(of: leg)
      for event in sky?.events ?? [] { if event.kind == .sunrise { sunrises += 1 } else { sunsets += 1 } }
      pieces.append(TripPiece(air: true, hours: Double(leg.durationMinutes) / 60, gradient: skyGradient(sky),
                              suns: (sky?.events ?? []).map { Double($0.minute) / Double(max(1, leg.durationMinutes)) }, city: "", nights: 0))
      guard index + 1 < legs.count else { continue }
      let next = legs[index + 1]
      let gap = trip.gaps.indices.contains(index) ? trip.gaps[index] : nil
      // As the trip measured the ground, else from the clocks, else from the nights.
      let hours: Double = if let minutes = gap?.minutes { Double(minutes) / 60 }
        else if let left = leg.departAt, let leaves = next.departAt { max(0, (leaves - left) / 3_600_000 - Double(leg.durationMinutes) / 60) }
        else { Double((gap?.nights ?? 0) * 24) }
      pieces.append(TripPiece(air: false, hours: hours, gradient: nil, suns: [], city: city(gap?.at ?? leg.destination),
                              nights: gap?.kind == "connection" ? 0 : (gap?.nights ?? 0), change: gap?.kind == "connection"))
    }
    let short: (String) -> String = { $0.replacingOccurrences(of: "-", with: ".").dropFirst(5).description }
    return TripStory(
      title: tripTitle(trip, self), facts: tripFacts(trip, self), dates: Format.span(trip.start, trip.end, lang),
      flights: legs, km: legs.reduce(0) { $0 + $1.km }, minutes: legs.reduce(0) { $0 + $1.durationMinutes },
      sunrises: sunrises, sunsets: sunsets, pieces: pieces, start: short(trip.start), end: short(trip.end),
      from: legs.first.map { city($0.origin) } ?? "", to: legs.last.map { city($0.destination) } ?? "")
  }
}

struct TripPoster: View {
  let story: TripStory
  let globe: CGImage
  let names: [PlacedName]
  let lang: Lang

  static let top: CGFloat = 112
  static let bottom: CGFloat = 352

  var body: some View {
    ZStack(alignment: .topLeading) {
      GlobeBackdrop(globe: globe, top: Self.top, bottom: Self.bottom, names: names)
      VStack(alignment: .leading, spacing: 0) {
        CardHeader(lang: lang, right: story.dates)
        let title = Self.titleLines(story.title)
        VStack(alignment: .leading, spacing: 0) {
          ForEach(title.lines, id: \.self) { line in
            Text(line).font(.system(size: title.size, weight: .semibold)).tracking(-0.8 * title.size / 40)
              .foregroundStyle(.white.opacity(0.95)).lineLimit(1).fixedSize()
              .frame(height: title.size * 1.193)
          }
        }
        .frame(height: 40 * 1.193 + CGFloat(title.lines.count - 1) * title.size * 1.193)
        .padding(.top, 14)
        Text(story.facts).font(.system(size: 10, weight: .medium)).foregroundStyle(.white.opacity(0.62)).padding(.top, 4)
        Spacer(minLength: 0)
        TripLine(pieces: story.pieces, from: story.from, to: story.to, start: story.start, end: story.end, lang: lang)
        HStack(alignment: .firstTextBaseline) {
          Text(figures).font(.system(size: 9, weight: .semibold)).monospacedDigit().foregroundStyle(.white.opacity(0.92))
          Spacer(minLength: 8)
          if let suns = sunsLine(story.sunrises, story.sunsets, lang) {
            HStack(spacing: 4) {
              Circle().fill(Color(red: 1, green: 0.82, blue: 0.6)).frame(width: 3, height: 3)
                .shadow(color: Color(red: 1, green: 0.7, blue: 0.45), radius: 2)
              Text(suns)
            }
            .font(.system(size: 8, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.62))
          }
        }
        .padding(.top, 16)
        CardFooter(note: lang.t("亮的一段是在天上，颜色是当时窗外的天色", "亮的一段是在天上，顏色是當時窗外的天色", "Bright where it was in the air, in the colours of the sky outside"))
          .padding(.top, 9)
      }
      .padding(.horizontal, Card.margin)
      .padding(.top, 22)
      .padding(.bottom, 20)
      .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
    }
    .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
    .background(Ink.ground)
    .environment(\.locale, lang.locale)
  }

  // The title at 40, smaller until it fits, down to 30; past that, two lines
  // at the size the longer fits. The break is at a " · " if there is one, else
  // after "Moved to", else at the space that balances the lines, so a city's
  // name is split only when it is the whole title. The web card does the same.
  static func titleLines(_ title: String) -> (lines: [String], size: CGFloat) {
    let room = Card.size.width - Card.margin * 2
    let font = UIFont.systemFont(ofSize: 40, weight: .semibold)
    func fit(_ line: String) -> CGFloat {
      let width = (line as NSString).size(withAttributes: [.font: font, .kern: -0.8]).width
      return min(40, 40 * room / max(1, width))
    }
    if fit(title) >= 30 { return ([title], fit(title)) }
    let dots = title.ranges(of: " · ")
    let lead = "Moved to "
    let breaks: [Range<String.Index>] = !dots.isEmpty ? dots
      : title.hasPrefix(lead) ? [title.index(title.startIndex, offsetBy: lead.count - 1)..<title.index(title.startIndex, offsetBy: lead.count)]
      : title.ranges(of: " ")
    let pairs = breaks.map { [String(title[..<$0.lowerBound]), String(title[$0.upperBound...])] }
      .filter { !$0[0].isEmpty && !$0[1].isEmpty }
    guard let best = pairs.max(by: { min(fit($0[0]), fit($0[1])) < min(fit($1[0]), fit($1[1])) }) else { return ([title], fit(title)) }
    return (best, min(32, fit(best[0]), fit(best[1])))
  }

  private var figures: String {
    let hours = Format.duration(minutes: story.minutes, lang)
    return lang.t("在天上 \(hours)", "在天上 \(hours)", "\(hours) in the air") + " · " + StoreWords(lang: lang).distance(story.km)
  }
}

func sunsLine(_ r: Int, _ s: Int, _ lang: Lang) -> String? {
  guard r + s > 0 else { return nil }
  let rise = lang.t("\(r) 次日出", "\(r) 次日出", r == 1 ? "1 sunrise" : "\(r) sunrises")
  let set = lang.t("\(s) 次日落", "\(s) 次日落", s == 1 ? "1 sunset" : "\(s) sunsets")
  let both = r > 0 && s > 0 ? lang.t("\(rise)、\(set)", "\(rise)、\(set)", "\(rise) and \(set)") : (r > 0 ? rise : set)
  return lang.t("途中 \(both)", "途中 \(both)", "\(both) on the way")
}

// MARK: A flight

struct FlightPoster: View {
  let flight: Flight
  let globe: CGImage
  let names: [PlacedName]
  let sky: Sky?
  let ordinal: Int?
  let airline: String
  let skyWords: String?
  let lang: Lang
  let store: Store

  static let top: CGFloat = 96
  static let bottom: CGFloat = 290
  // Where the two ends start, the same on every flight's card.
  static let ends: CGFloat = 296

  var body: some View {
    ZStack(alignment: .topLeading) {
      GlobeBackdrop(globe: globe, top: Self.top, bottom: Self.bottom, names: names)
      VStack(alignment: .leading, spacing: 0) {
        CardHeader(lang: lang, right: Format.dayAndWeekday(flight.date, lang))
        HStack(alignment: .center, spacing: 10) {
          CardAirlineMark(code: flight.airline, size: 28)
          VStack(alignment: .leading, spacing: 2) {
            Text(spaced(flight.flight)).font(.system(size: 20, weight: .semibold)).tracking(-0.2).monospacedDigit().foregroundStyle(.white.opacity(0.95))
            Text(airline).font(.system(size: 9, weight: .medium)).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
          }
          Spacer(minLength: 8)
          if let ordinal {
            Text(lang.t("第 \(ordinal) 次飞行", "第 \(ordinal) 次飛行", "\(Self.ordinalWord(ordinal)) flight"))
              .font(.system(size: 8.5, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.62))
          }
        }
        .padding(.top, 16)
      }
      .padding(.horizontal, Card.margin)
      .padding(.top, 22)
      VStack(alignment: .leading, spacing: 0) {
        // The two ends joined by the sky the flight flew through.
        HStack(alignment: .top, spacing: 10) {
          end(flight.origin, flight.depart, alignment: .leading, offset: 0)
          VStack(spacing: 7) {
            if let sky { FlightSkyBand(sky: sky, minutes: flight.durationMinutes).padding(.top, 13) }
            Text(Format.duration(minutes: flight.durationMinutes, lang)).font(.system(size: 8.5, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.62))
          }
          end(flight.destination, flight.arrive, alignment: .trailing, offset: flight.arrivalDayOffset)
        }
        if let skyWords {
          Text(skyWords).font(.system(size: 9, weight: .medium)).foregroundStyle(.white.opacity(0.78))
            .lineLimit(2).minimumScaleFactor(0.85).fixedSize(horizontal: false, vertical: true)
            .padding(.top, 10)
        }
        Spacer(minLength: 8)
        aircraft
        CardFooter(note: lang.t("线的颜色是沿途窗外的天色", "線的顏色是沿途窗外的天色", "The line is the colour of the sky outside, all the way")).padding(.top, 12)
      }
      .padding(.horizontal, Card.margin)
      .padding(.top, Self.ends)
      .padding(.bottom, 20)
      .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
    }
    .frame(width: Card.size.width, height: Card.size.height, alignment: .topLeading)
    .background(Ink.ground)
    .environment(\.locale, lang.locale)
  }

  static func ordinalWord(_ n: Int) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_GB")
    formatter.numberStyle = .ordinal
    return formatter.string(from: NSNumber(value: n)) ?? String(n)
  }

  private func spaced(_ number: String) -> String {
    guard let split = number.firstIndex(where: { $0.isNumber }), split != number.startIndex else { return number }
    return number[..<split] + " " + number[split...]
  }

  private func end(_ code: String, _ time: String, alignment: HorizontalAlignment, offset: Int) -> some View {
    VStack(alignment: alignment, spacing: 3) {
      Text(code).font(.system(size: 32, weight: .semibold)).tracking(-0.3).monospacedDigit().foregroundStyle(.white.opacity(0.95))
      Text(store.city(code)).font(.system(size: 9, weight: .medium)).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
      if !time.isEmpty {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text(time).font(.system(size: 11, weight: .semibold)).monospacedDigit().foregroundStyle(.white.opacity(0.92))
          if offset != 0 { Text(offset > 0 ? "+\(offset)" : "\(offset)").font(.system(size: 7, weight: .semibold)).foregroundStyle(.white.opacity(0.62)) }
        }
      }
    }
    .fixedSize()
  }

  @ViewBuilder private var aircraft: some View {
    if let aircraft = flight.aircraft, !aircraft.model.isEmpty {
      HStack(alignment: .center, spacing: 12) {
        if Fleet.canDraw(aircraft.icao) {
          AircraftProfile(icao: aircraft.icao, measured: false).frame(width: 86)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(Fleet.localModel(aircraft.model, lang)).font(.system(size: 9.5, weight: .semibold)).foregroundStyle(.white.opacity(0.92))
          let extra = [aircraft.registration, flight.seat.map { seat in [seat, cabin].compactMap { $0 }.joined(separator: " · ") }].compactMap { $0 }.filter { !$0.isEmpty }
          if !extra.isEmpty {
            Text(extra.joined(separator: " · ")).font(.system(size: 8, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.62))
          }
        }
        Spacer(minLength: 0)
      }
      .environment(store)
    }
  }

  private var cabin: String? {
    switch flight.cabin {
    case "economy": lang.t("经济舱", "經濟艙", "Economy")
    case "premium": lang.t("超级经济舱", "特選經濟艙", "Premium economy")
    case "business": lang.t("商务舱", "商務艙", "Business")
    case "first": lang.t("头等舱", "頭等艙", "First")
    default: nil
    }
  }
}

// An airline's mark on the dark card: in its own colours, or in white where
// those colours are too dark to see against the night.
struct CardAirlineMark: View {
  let code: String
  var size: CGFloat = 28

  var body: some View {
    if let image = AirlineMark.image(code) {
      let dark = (Livery.luminance(code) ?? 1) < 0.32
      Image(uiImage: image)
        .resizable()
        .renderingMode(dark ? .template : .original)
        .interpolation(.high)
        .scaledToFit()
        .foregroundStyle(.white.opacity(0.9))
        .frame(width: size, height: size)
    } else {
      Text(code).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(.white.opacity(0.62)).frame(width: size, height: size)
    }
  }
}

// One flight's sky as a band of light, the sunrises and sunsets on it.
struct FlightSkyBand: View {
  let sky: Sky
  let minutes: Int

  var body: some View {
    Canvas { context, size in
      let rect = CGRect(x: 0, y: size.height / 2 - 2, width: size.width, height: 4)
      let gradient = skyGradient(sky)
      let shading = GraphicsContext.Shading.linearGradient(gradient, startPoint: CGPoint(x: 0, y: 0), endPoint: CGPoint(x: size.width, y: 0))
      context.drawLayer { glow in
        glow.addFilter(.blur(radius: 4))
        glow.opacity = 0.8
        glow.fill(Path(roundedRect: rect.insetBy(dx: 0, dy: -2), cornerRadius: 4), with: shading)
      }
      context.fill(Path(roundedRect: rect, cornerRadius: 2), with: shading)
      let sun = Color(red: 1, green: 0.82, blue: 0.6)
      for event in sky.events {
        let x = size.width * CGFloat(event.minute) / CGFloat(max(1, minutes))
        context.drawLayer { glow in
          glow.addFilter(.blur(radius: 3))
          glow.fill(Path(ellipseIn: CGRect(x: x - 4, y: size.height / 2 - 4, width: 8, height: 8)), with: .color(sun.opacity(0.95)))
        }
        context.fill(Path(ellipseIn: CGRect(x: x - 2, y: size.height / 2 - 2, width: 4, height: 4)), with: .color(sun))
      }
    }
    .frame(height: 12)
  }
}

// MARK: Printing

enum CardPrinter {
  static func yearCard(_ year: Int?, store: Store) async -> UIImage? {
    let story = store.yearStory(year)
    guard !story.flights.isEmpty else { return nil }
    // A few flights carry a little more light each than a life of them.
    let width: Float = story.flights.count < 12 ? 1.15 : story.flights.count < 40 ? 0.95 : 0.75
    let top = YearPoster.top(story), bottom = YearPoster.bottom
    guard let still = still(story.flights, store: store, top: top, bottom: bottom, directed: false, width: width),
          let globe = await GlobePrinter.print(still) else { return nil }
    let wanted = story.places.prefix(14).compactMap { metro -> (code: String, text: String, at: LngLat, strong: Bool)? in
      let anchor = store.anchor(metro)
      return store.position(anchor).map { (metro, store.cityName(metro), $0, false) }
    }.enumerated().map { index, item in (item.code, item.text, item.at, index < 6) }
    let names = placeNames(wanted, on: still, avoiding: bands(top, bottom), limit: 11)
    return render(YearPoster(story: story, globe: globe, names: names, lang: store.lang))
  }

  static func tripCard(_ id: String, store: Store) async -> UIImage? {
    guard let trip = store.tripsByID[id] else { return nil }
    let story = store.tripStory(trip)
    guard let still = still(story.flights, store: store, top: TripPoster.top, bottom: TripPoster.bottom, directed: true, width: 1.3),
          let globe = await GlobePrinter.print(still) else { return nil }
    var seen = Set<String>()
    let stops = story.flights.flatMap { [$0.origin, $0.destination] }.filter { seen.insert(metroOf($0)).inserted }
    let wanted = stops.compactMap { code in store.position(code).map { (code: code, text: store.city(code), at: $0, strong: true) } }
    let names = placeNames(wanted, on: still, avoiding: bands(TripPoster.top, TripPoster.bottom), limit: 10)
    return render(TripPoster(story: story, globe: globe, names: names, lang: store.lang))
  }

  static func flightCard(_ id: String, store: Store) async -> UIImage? {
    guard let flight = store.flightsByID[id],
          let still = still([flight], store: store, top: FlightPoster.top, bottom: FlightPoster.bottom, directed: true, width: 1.6),
          let globe = await GlobePrinter.print(still) else { return nil }
    let wanted = [flight.origin, flight.destination].compactMap { code in store.position(code).map { (code: code, text: store.city(code), at: $0, strong: true) } }
    let names = placeNames(wanted, on: still, avoiding: bands(FlightPoster.top, FlightPoster.bottom), limit: 2)
    let sky = store.sky(of: flight)
    return render(FlightPoster(flight: flight, globe: globe, names: names, sky: sky, ordinal: store.ordinal(of: flight),
                               airline: store.carrier(flight.airline), skyWords: sky.flatMap(store.skyLine), lang: store.lang, store: store))
  }

  private static func bands(_ top: CGFloat, _ bottom: CGFloat) -> [CGRect] {
    [CGRect(x: 0, y: 0, width: Card.size.width, height: top), CGRect(x: 0, y: bottom - 4, width: Card.size.width, height: Card.size.height)]
  }

  // The flights as light on the globe, framed in the band between the card's text.
  private static func still(_ flights: [Flight], store: Store, top: CGFloat, bottom: CGFloat, directed: Bool, width: Float) -> GlobeStill? {
    let tone = Palette.tone(store.owner.tone)
    let bows = bowsOf(flights)
    let arcs = flights.compactMap { flight -> ArcSpec? in
      guard let from = store.position(flight.origin), let to = store.position(flight.destination) else { return nil }
      return ArcSpec(id: flight.id, from: from, to: to, bow: bows[flight.id] ?? 0.07, color: tone, alpha: directed ? 1 : 0.75, width: width)
    }
    guard !arcs.isEmpty else { return nil }
    var visits: [String: Int] = [:]
    for flight in flights { visits[flight.origin, default: 0] += 1; visits[flight.destination, default: 0] += 1 }
    let dots = visits.compactMap { code, count -> DotSpec? in
      store.position(code).map { DotSpec(code: code, at: $0, radius: directed ? 2.2 : (count >= 10 ? 1.9 : 1.4), alpha: directed ? 1 : 0.8) }
    }
    let middle = CGPoint(x: Card.size.width / 2, y: (top + bottom) / 2 + 2)
    let camera = GlobeStill.framing(arcs, size: Card.size, scale: Card.scale, middle: middle, reach: (bottom - top) / 2 - 6)
    return GlobeStill(arcs: arcs, dots: dots, camera: camera, size: Card.size, scale: Card.scale, middle: middle,
                      directed: directed, glow: directed ? 6 : 5, glowGain: directed ? 0.24 : 0.2)
  }

  private static func render<V: View>(_ view: V) -> UIImage? {
    let renderer = ImageRenderer(content: view)
    renderer.scale = Card.scale
    renderer.isOpaque = true
    return renderer.uiImage
  }
}

// MARK: Sharing

// What a card is of: a year (or every year), one trip, one flight.
enum CardRequest: Identifiable, Hashable {
  case year(Int?)
  case trip(String)
  case flight(String)

  var id: String {
    switch self {
    case .year(let year): "year-\(year.map(String.init) ?? "all")"
    case .trip(let id): "trip-\(id)"
    case .flight(let id): "flight-\(id)"
    }
  }
}

// The card at full size before it goes anywhere, and one button to send it.
struct CardSheet: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  let request: CardRequest
  @State private var image: UIImage?
  @State private var file: URL?
  @State private var sharing: URL?
  @State private var sent = false
  @State private var failed = false

  var body: some View {
    let lang = store.lang
    VStack(spacing: 0) {
      SheetHeader(title: title).padding(.horizontal, 24).padding(.top, 18)
      preview
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .padding(.bottom, 20)
      PrimaryButton(title: lang.t("分享图片", "分享圖片", "Share image")) { sharing = file }
        .disabled(file == nil)
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
    }
    .presentationDetents([.large])
    .presentationBackground { SheetGround() }
    // Once it has gone somewhere, the preview has done its job and closes too.
    .sheet(item: $sharing, onDismiss: { if sent { dismiss() } }) { url in
      ShareSheet(items: [url]) { completed in sent = completed; sharing = nil }.presentationDetents([.medium, .large])
    }
    .task(id: "\(request.id)-\(lang)-\(store.revision)") { await make() }
  }

  private var preview: some View {
    GeometryReader { geometry in
      let width = min(geometry.size.width, geometry.size.height * 3 / 4)
      ZStack {
        Rectangle().fill(Ink.ground)
        if let image {
          Image(uiImage: image).resizable().interpolation(.high).transition(.opacity)
        } else if failed {
          Text(store.lang.t("这张图没能生成", "這張圖沒能生成", "This card couldn’t be made")).font(.body).foregroundStyle(Ink.secondary)
        } else {
          ProgressView().tint(Ink.secondary)
        }
      }
      .frame(width: width, height: width * 4 / 3)
      .clipShape(.rect(cornerRadius: 12))
      .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(.white.opacity(0.1), lineWidth: 0.5) }
      .shadow(color: .black.opacity(0.5), radius: 28, y: 14)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .animation(.easeOut(duration: 0.35), value: image != nil)
      .accessibilityElement()
      .accessibilityLabel(Text(title))
    }
  }

  private var title: String {
    let lang = store.lang
    switch request {
    case .year(let year): return year.map { lang.t("\($0) 年", "\($0) 年", String($0)) } ?? lang.t("全部年份", "全部年份", "All years")
    case .trip(let id): return store.tripsByID[id].map { tripTitle($0, store) } ?? ""
    case .flight(let id):
      guard let flight = store.flightsByID[id] else { return "" }
      return flight.flight.isEmpty ? "\(flight.origin) → \(flight.destination)" : flight.flight
    }
  }

  // Named for what it shows, so it reads right in Files, AirDrop or a chat.
  private var fileName: String {
    let brand = store.lang.t("航迹", "航跡", "Flyprint")
    let subject: String
    switch request {
    case .year(let year): subject = year.map(String.init) ?? store.lang.t("全部年份", "全部年份", "All years")
    case .trip(let id): subject = store.tripsByID[id].map { "\(tripTitle($0, store)) \($0.start.prefix(7))" } ?? ""
    case .flight(let id):
      subject = store.flightsByID[id].map { "\($0.flight.isEmpty ? "\($0.origin)-\($0.destination)" : $0.flight) \($0.date)" } ?? ""
    }
    return "\(brand) \(subject)".replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
  }

  private func make() async {
    let made: UIImage?
    switch request {
    case .year(let year): made = await CardPrinter.yearCard(year, store: store)
    case .trip(let id): made = await CardPrinter.tripCard(id, store: store)
    case .flight(let id): made = await CardPrinter.flightCard(id, store: store)
    }
    guard let made, let data = made.jpegData(compressionQuality: 0.92) else { failed = true; return }
    let folder = FileManager.default.temporaryDirectory.appending(path: "cards", directoryHint: .isDirectory)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let url = folder.appending(path: fileName + ".jpg")
    do {
      try data.write(to: url, options: .atomic)
      file = url
    } catch {
      failed = true
    }
    image = made
  }
}

#if DEBUG
// Proofs of the cards for checking them by eye: -fp.card year#2024 writes
// Documents/cards/year-2024-<lang>.jpg once the archive has loaded.
enum CardProof {
  static func write(_ request: String, store: Store) async {
    let parts = request.split(separator: "#").map(String.init)
    guard let kind = parts.first else { return }
    let folder = URL.documentsDirectory.appending(path: "cards")
    try? FileManager.default.removeItem(at: folder)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let lang = ["zh-Hans", "zh-Hant", "en"][store.lang.rawValue]
    switch kind {
    case "year":
      let years: [Int?] = parts.count > 1 ? parts[1].split(separator: ",").map { $0 == "all" ? nil : Int($0) } : [nil] + store.years.map { Optional($0) }
      for year in years {
        guard let image = await CardPrinter.yearCard(year, store: store), let data = image.jpegData(compressionQuality: 0.92) else { continue }
        try? data.write(to: folder.appending(path: "year-\(year.map(String.init) ?? "all")-\(lang).jpg"))
      }
    case "trip":
      let trips = store.trips.sorted { $0.start > $1.start }
      for n in (parts.count > 1 ? parts[1].split(separator: ",").compactMap { Int($0) } : [0]) where trips.indices.contains(n) {
        guard let image = await CardPrinter.tripCard(trips[n].id, store: store), let data = image.jpegData(compressionQuality: 0.92) else { continue }
        try? data.write(to: folder.appending(path: "trip-\(n)-\(lang).jpg"))
      }
    case "flight":
      let landed = store.landed(in: nil).sorted { ($0.date, $0.depart) > ($1.date, $1.depart) }
      for n in (parts.count > 1 ? parts[1].split(separator: ",").compactMap { Int($0) } : [0]) where landed.indices.contains(n) {
        guard let image = await CardPrinter.flightCard(landed[n].id, store: store), let data = image.jpegData(compressionQuality: 0.92) else { continue }
        try? data.write(to: folder.appending(path: "flight-\(n)-\(lang).jpg"))
      }
    default: break
    }
    try? Data("done".utf8).write(to: folder.appending(path: "done-\(lang)"))
  }
}
#endif
