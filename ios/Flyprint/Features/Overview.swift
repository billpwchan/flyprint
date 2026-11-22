import SwiftUI

// The trips part of the sheet: the scope's figures (they open the
// footprint), the next flight, then the trips, newest first.
struct OverviewView: View {
  @Environment(Store.self) private var store
  @Binding var year: Int?
  var open: (Route) -> Void
  var start: () -> Void
  var importFlights: () -> Void
  // How much of what lies under the figures to show: none at the lowest
  // detent, so nothing is cut by the sheet's corner, rising as it is pulled up.
  var reveal: Double = 1
  @Binding var scrolled: Bool
  var footprint: () -> Void

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        if !store.years.isEmpty {
          ScopeFigures(year: year, reveal: reveal, action: footprint)
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        VStack(alignment: .leading, spacing: 30) {
          if store.isSample { SampleLine(start: start) }
          ImportLine(action: importFlights)
          if store.archive.flights.isEmpty && !store.isSample && !store.importer.isBusy {
            EmptyArchive(action: importFlights)
          }
          if year == nil, let next = store.ahead.first {
            NextFlight(flight: next, more: store.ahead.count - 1) { open(.flight(next.id)) }
          }
        }
        .padding(.horizontal, 20)
        .padding(.top, 30)
        .opacity(reveal)
        TripList(year: year, open: open)
          .padding(.horizontal, 20)
          .padding(.top, 34)
          .opacity(reveal)
        if !store.trips.isEmpty { ImageryCredit().padding(.horizontal, 20).padding(.top, 28) }
      }
      .padding(.bottom, 40)
    }
    .scrollIndicators(.hidden)
    .scrolledOffTop($scrolled)
    .debugScroll()
  }
}

// Years on a dial: turn it and the globe lights only that year, a tick under
// the finger for each year passed. The first stop is the whole archive, then
// the years from the latest back, so the recent ones are a short turn away.
struct YearDial: View {
  @Environment(Store.self) private var store
  let years: [Int]
  @Binding var year: Int?
  @State private var position: Int?
  private let all = 0
  private let stop: CGFloat = 76
  private var stops: [Int] { [all] + years.reversed() }

  var body: some View {
    dial
    // One year each side of the chosen one, the ends clear: the share button
    // at the right sits on nothing.
    .mask { DialMask(stop: stop) }
    .padding(.top, 10)
    .sensoryFeedback(.selection, trigger: position)
    .onAppear { position = year ?? all }
    .onChange(of: position) { year = position == all ? nil : position }
    .onChange(of: year) { if (position ?? all) != (year ?? all) { position = year ?? all } }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(store.lang.t("年份", "年份", "Year"))
    .accessibilityValue(year.map(String.init) ?? store.lang.t("全部", "全部", "All"))
    .accessibilityAdjustableAction(adjust)
  }

  private func adjust(_ direction: AccessibilityAdjustmentDirection) {
    let index: Int = stops.firstIndex(of: position ?? all) ?? 0
    let next: Int = index + (direction == .increment ? 1 : -1)
    position = stops[max(0, min(stops.count - 1, next))]
  }

  private var dial: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 0) {
        ForEach(stops, id: \.self) { item in
          stopLabel(item)
            .frame(width: stop, height: 44)
            .contentShape(.rect)
            .onTapGesture { withAnimation(.snappy(duration: 0.25)) { position = item } }
            .id(item)
        }
      }
      .scrollTargetLayout()
    }
    .scrollIndicators(.hidden)
    .scrollTargetBehavior(.viewAligned)
    .scrollPosition(id: $position, anchor: .center)
    .safeAreaPadding(.horizontal, max(0, (UIScreen.main.bounds.width - stop) / 2))
  }

  private func stopLabel(_ item: Int) -> some View {
    let selected = (position ?? all) == item
    let text = item == all ? store.lang.t("全部", "全部", "All") : String(item)
    let font: Font = selected ? .fp(22, .semibold, relativeTo: .title3) : .fp(17, relativeTo: .title3)
    return Text(text).font(font).monospacedDigit().foregroundStyle(selected ? Ink.primary : Ink.tertiary)
  }
}

// What the scope held, as figures; on the trips part they open the footprint.
// The scope in one number; distance, time aloft and countries in one quiet
// line under it, in the units people say them in.
// One year each side of the chosen one shows; past them the dial is clear.
private struct DialMask: View {
  let stop: CGFloat

  var body: some View {
    GeometryReader { geometry in
      let clear: CGFloat = max(44, geometry.size.width / 2 - stop * 1.5 - 4)
      HStack(spacing: 0) {
        Color.clear.frame(width: clear)
        LinearGradient(colors: [Color.clear, Color.black], startPoint: .leading, endPoint: .trailing).frame(width: 40)
        Color.black
        LinearGradient(colors: [Color.black, Color.clear], startPoint: .leading, endPoint: .trailing).frame(width: 40)
        Color.clear.frame(width: clear)
      }
    }
  }
}

struct ScopeFigures: View {
  @Environment(Store.self) private var store
  let year: Int?
  var reveal: Double = 1
  // Nil where the figures head the footprint itself.
  var action: (() -> Void)?

  var body: some View {
    let flights = store.landed(in: year)
    let lang = store.lang
    if !flights.isEmpty {
      if let action {
        Button(action: action) { figures(flights) }
          .buttonStyle(Press())
          .accessibilityHint(lang.t("打开足迹", "打開足跡", "Opens your footprint"))
      } else {
        figures(flights)
      }
    }
  }

  private func figures(_ flights: [Flight]) -> some View {
    let lang = store.lang
    return VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(String(flights.count)).font(.large).monospacedDigit()
        Text(lang.t("次飞行", "次飛行", flights.count == 1 ? "flight" : "flights")).font(.body).foregroundStyle(Ink.secondary)
        Spacer(minLength: 8)
        if action != nil { Image(systemName: "chevron.right").font(.captionStrong).foregroundStyle(Ink.faint) }
      }
      let line = facts(flights)
      ViewThatFits(in: .horizontal) {
        Text(line).font(.body)
        Text(line).font(.caption)
      }
      .lineLimit(1)
      .monospacedDigit()
      .foregroundStyle(Ink.secondary)
      .opacity(reveal)
    }
    .contentShape(.rect)
  }

  private func facts(_ flights: [Flight]) -> String {
    let lang = store.lang
    let km = flights.reduce(0) { $0 + $1.km }
    let hours = Double(flights.reduce(0) { $0 + $1.durationMinutes }) / 60
    let countries = store.countries(in: flights).count
    let one = NumberFormatter()
    one.locale = lang.locale
    one.maximumFractionDigits = 1
    one.minimumFractionDigits = 0
    one.roundingMode = .halfUp
    let distance = lang.isChinese && km >= 10_000
      ? "\(one.string(from: NSNumber(value: Double(km) / 10_000)) ?? "") " + lang.t("万公里", "萬公里", "")
      : "\(Format.number(Double(km), lang)) " + lang.t("公里", "公里", "km")
    let aloft = hours >= 48
      ? lang.t("\(one.string(from: NSNumber(value: hours / 24)) ?? "") 天在空中", "\(one.string(from: NSNumber(value: hours / 24)) ?? "") 天在空中", "\(one.string(from: NSNumber(value: hours / 24)) ?? "") days in the air")
      : lang.t("\(Int(hours.rounded())) 小时在空中", "\(Int(hours.rounded())) 小時在空中", "\(Int(hours.rounded())) hours in the air")
    let places = lang.t("\(countries) 个国家和地区", "\(countries) 個國家和地區", countries == 1 ? "1 country" : "\(countries) countries")
    return [distance, aloft, places].joined(separator: " · ")
  }
}

struct SampleLine: View {
  @Environment(Store.self) private var store
  var start: () -> Void

  var body: some View {
    let lang = store.lang
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Text(lang.t("这是示例旅客 \(store.owner.name) 的航迹", "這是示例旅客 \(store.owner.name) 的航跡", "A sample traveller, \(store.owner.name)"))
        .font(.body).foregroundStyle(Ink.secondary)
      Spacer(minLength: 0)
      Button(action: start) {
        Text(lang.t("开始记录", "開始記錄", "Start yours")).font(.bodyStrong).foregroundStyle(store.tone)
          .frame(minHeight: 44).contentShape(.rect)
      }
      .buttonStyle(Press())
    }
  }
}

// The next flight as a ticket: the codes, the sky it will fly through, the
// countdown, tinted with the airline's colour.
struct NextFlight: View {
  @Environment(Store.self) private var store
  let flight: Flight
  let more: Int
  var action: () -> Void

  var body: some View {
    let lang = store.lang
    let livery = Livery.color(flight.airline) ?? store.tone
    Button(action: action) {
      TimelineView(.periodic(from: .now, by: 30)) { context in
        VStack(alignment: .leading, spacing: 14) {
          HStack(alignment: .firstTextBaseline) {
            Text(flight.isAirborne(at: context.date) ? lang.t("在空中", "在空中", "In the air") : lang.t("下一程", "下一程", "Next flight"))
              .font(.captionStrong).foregroundStyle(store.tone)
            Spacer()
            Text(flightCountdown(flight, at: context.date, lang) ?? "").font(.bodyStrong).monospacedDigit()
          }
          // The codes joined by the sky the flight will fly through.
          let sky = store.sky(of: flight)
          VStack(spacing: 4) {
            HStack(alignment: .center, spacing: 12) {
              Text(flight.origin).font(.large).monospacedDigit()
              ZStack {
                if let sky {
                  SkyStrip(sky: sky, minutes: flight.durationMinutes, height: 3,
                           progress: flight.isAirborne(at: context.date) ? flight.progress(at: context.date) : nil)
                } else {
                  Capsule().fill(Ink.faint).frame(height: 2)
                }
                if !flight.isAirborne(at: context.date) {
                  Image(systemName: "airplane").font(.fp(13, .semibold)).foregroundStyle(Ink.primary)
                    .padding(.horizontal, 6)
                    .background(Capsule().fill(Ink.ground.opacity(0.0001)))
                    .shadow(color: .black.opacity(0.8), radius: 4)
                }
              }
              Text(flight.destination).font(.large).monospacedDigit()
            }
            HStack(alignment: .firstTextBaseline) {
              VStack(alignment: .leading, spacing: 2) {
                Text(store.city(flight.origin)).font(.caption).foregroundStyle(Ink.secondary).lineLimit(1)
                if !flight.depart.isEmpty { Text(flight.depart).font(.bodyStrong).monospacedDigit() }
              }
              Spacer(minLength: 8)
              Text(Format.duration(minutes: flight.durationMinutes, lang)).font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
              Spacer(minLength: 8)
              VStack(alignment: .trailing, spacing: 2) {
                Text(store.city(flight.destination)).font(.caption).foregroundStyle(Ink.secondary).lineLimit(1)
                if !flight.arrive.isEmpty { Text(flight.arrive + (flight.arrivalDayOffset > 0 ? " +\(flight.arrivalDayOffset)" : "")).font(.bodyStrong).monospacedDigit() }
              }
            }
          }
          if let line = sky.flatMap(store.skyLine) {
            Text(line).font(.caption).foregroundStyle(Ink.secondary)
          }
          HStack(spacing: 8) {
            AirlineMark(code: flight.airline, size: 18)
            Text(detail).font(.caption).monospacedDigit().foregroundStyle(Ink.secondary).lineLimit(1)
          }
          if let reading { Text(reading).font(.caption).foregroundStyle(Ink.tertiary) }
        }
        .padding(18)
        .background(
          RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(LinearGradient(colors: [livery.opacity(0.2), Color.white.opacity(0.035)], startPoint: .topLeading, endPoint: .bottomTrailing))
        )
      }
      .contentShape(.rect)
    }
    .buttonStyle(Press())
  }

  private var detail: String {
    let date = Format.date(flight.date, store.lang, year: false)
    let weekday = Format.weekday(flight.date, store.lang)
    let day = store.lang.isChinese ? "\(date) \(weekday)" : "\(weekday) \(date)"
    return "\(flight.flight) · \(day)"
  }

  private var reading: String? {
    var lines: [String] = []
    if store.isFirstVisit(flight), let iso = store.place(flight.destination)?.country {
      lines.append(store.lang.t("第一次去\(store.country(iso))", "第一次去\(store.country(iso))", "First time in \(store.country(iso))"))
    } else {
      let count = store.timesFlown(before: flight)
      lines.append(count == 0 ? store.lang.t("第一次飞这条航线", "第一次飛這條航線", "First time on this route")
                   : store.lang.t("之前飞过 \(count) 次", "之前飛過 \(count) 次", "Flown \(count) times before"))
    }
    if more > 0 { lines.append(store.lang.t("之后还有 \(more) 程", "之後還有 \(more) 程", "\(more) more booked")) }
    return lines.joined(separator: " · ")
  }
}

// How long until a flight leaves, or lands while it is in the air; nil once it has landed.
func flightCountdown(_ flight: Flight, at now: Date, _ lang: Lang) -> String? {
  if flight.hasLanded(at: now) { return nil }
  if flight.isAirborne(at: now), let arriveAt = flight.arriveAt {
    let minutes = Int((arriveAt / 1000 - now.timeIntervalSince1970) / 60)
    return lang.t("还有 \(Format.duration(minutes: minutes, lang))落地", "還有 \(Format.duration(minutes: minutes, lang))落地", "Lands in \(Format.duration(minutes: minutes, lang))")
  }
  guard let departAt = flight.departAt else { return nil }
  let minutes = Int((departAt / 1000 - now.timeIntervalSince1970) / 60)
  if minutes < 24 * 60 { return lang.t("还有 \(Format.duration(minutes: max(0, minutes), lang))", "還有 \(Format.duration(minutes: max(0, minutes), lang))", "in \(Format.duration(minutes: max(0, minutes), lang))") }
  let days = Int((Double(minutes) / 1440).rounded(.up))
  return days == 1 ? lang.t("明天", "明天", "Tomorrow") : lang.t("还有 \(days) 天", "還有 \(days) 天", "in \(days) days")
}

// Every year as a column of its flights; a tap turns the dial to it.
struct YearBars: View {
  @Environment(Store.self) private var store
  @Binding var year: Int?

  var body: some View {
    let years = store.years
    let counts = years.map { y in store.landed(in: y).count }
    let ahead = years.map { y in store.flights(in: y).count - store.landed(in: y).count }
    let most = Double(max(1, zip(counts, ahead).map { $0 + $1 }.max() ?? 1))
    let busiest = counts.max() ?? 0
    let label = years.count > 10 ? 2 : 1
    VStack(alignment: .leading, spacing: 10) {
      SectionTitle(text: store.lang.t("每年", "每年", "Each year"))
      HStack(alignment: .bottom, spacing: 0) {
        ForEach(Array(years.enumerated()), id: \.element) { index, y in
          Button { withAnimation(.snappy(duration: 0.3)) { year = y } } label: {
            VStack(spacing: 6) {
              if counts[index] == busiest {
                Text(String(counts[index])).font(.micro).monospacedDigit().foregroundStyle(Ink.secondary)
              }
              VStack(spacing: 2) {
                if ahead[index] > 0 {
                  Capsule().fill(store.tone.opacity(0.28)).frame(width: 6, height: max(6, 72 * Double(ahead[index]) / most))
                }
                Capsule().fill(store.tone.opacity(counts[index] == busiest ? 0.95 : 0.6))
                  .frame(width: 6, height: max(6, 72 * Double(counts[index]) / most))
                  .shadow(color: counts[index] == busiest ? store.tone.opacity(0.6) : .clear, radius: 4)
              }
              Text(index % label == (years.count - 1) % label ? "'" + String(y).suffix(2) : " ")
                .font(.micro).monospacedDigit().foregroundStyle(Ink.tertiary)
            }
            .frame(maxWidth: years.count < 8 ? 44 : .infinity)
            .contentShape(.rect)
          }
          .buttonStyle(Press())
          .accessibilityLabel(store.lang.t("\(y) 年，\(counts[index]) 次", "\(y) 年，\(counts[index]) 次", "\(y), \(counts[index]) flights"))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .frame(height: 104, alignment: .bottom)
    }
  }
}

// The chosen year by month: a point for each flight, booked ones dim.
struct MonthStrip: View {
  @Environment(Store.self) private var store
  let year: Int

  var body: some View {
    let flights = store.flights(in: year)
    var landed = Array(repeating: 0, count: 12), booked = Array(repeating: 0, count: 12)
    for flight in flights {
      guard let month = Int(flight.date.dropFirst(5).prefix(2)), (1...12).contains(month) else { continue }
      if flight.hasLanded(at: store.now) { landed[month - 1] += 1 } else { booked[month - 1] += 1 }
    }
    let most = max(1, zip(landed, booked).map { $0 + $1 }.max() ?? 1)
    let dot = min(7, 76 / Double(most) - 2.5)
    let lang = store.lang
    return VStack(alignment: .leading, spacing: 10) {
      SectionTitle(text: lang.t("每月", "每月", "By month"))
      HStack(alignment: .bottom, spacing: 0) {
        ForEach(0..<12, id: \.self) { m in
          VStack(spacing: 6) {
            VStack(spacing: 2.5) {
              ForEach(0..<booked[m], id: \.self) { _ in Circle().fill(store.tone.opacity(0.3)).frame(width: dot, height: dot) }
              ForEach(0..<landed[m], id: \.self) { _ in Circle().fill(store.tone).frame(width: dot, height: dot) }
            }
            Text(lang.isChinese ? "\(m + 1)" : String(Calendar(identifier: .gregorian).veryShortMonthSymbols[m]))
              .font(.micro).monospacedDigit().foregroundStyle(landed[m] + booked[m] > 0 ? Ink.secondary : Ink.faint)
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(height: 96, alignment: .bottom)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel((0..<12).filter { landed[$0] + booked[$0] > 0 }.map { lang.t("\($0 + 1) 月 \(landed[$0] + booked[$0]) 次", "\($0 + 1) 月 \(landed[$0] + booked[$0]) 次", "\(Calendar(identifier: .gregorian).monthSymbols[$0]) \(landed[$0] + booked[$0])") }.joined(separator: ", "))
    }
  }
}

// What the year added: countries reached for the first time, as their flags,
// and how many cities were new.
struct YearFirsts: View {
  @Environment(Store.self) private var store
  let year: Int
  var open: (Route) -> Void

  var body: some View {
    let lang = store.lang
    let countries = store.firstCountries(in: year)
    let cities = store.firstCities(in: year)
    if !countries.isEmpty || !cities.isEmpty {
      VStack(alignment: .leading, spacing: 14) {
        SectionTitle(text: lang.t("这一年第一次去", "這一年第一次去", "First time this year"))
        if !countries.isEmpty {
          ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 20) {
              ForEach(countries, id: \.iso) { item in
                VStack(spacing: 6) {
                  CountryMark(iso: item.iso, size: 34)
                  Text(store.country(item.iso)).font(.caption).foregroundStyle(Ink.secondary).lineLimit(1)
                  Text(Format.date(item.date, lang, year: false)).font(.micro).monospacedDigit().foregroundStyle(Ink.tertiary)
                }
                .fixedSize()
              }
            }
          }
          .scrollIndicators(.hidden)
          .scrollClipDisabled()
        }
        if !cities.isEmpty {
          ScrollView(.horizontal) {
            HStack(spacing: 10) {
              ForEach(cities, id: \.self) { metro in
                Button { open(.place(metro)) } label: {
                  VStack(alignment: .leading, spacing: 6) {
                    CityImage(code: store.anchor(metro), size: CGSize(width: 92, height: 92))
                      .clipShape(.rect(cornerRadius: 14, style: .continuous))
                    Text(store.cityName(metro)).font(.caption).foregroundStyle(Ink.secondary).lineLimit(1).frame(width: 92, alignment: .leading)
                  }
                }
                .buttonStyle(Press())
              }
            }
          }
          .scrollIndicators(.hidden)
          .scrollClipDisabled()
        }
      }
    }
  }
}

// An import still being read or waiting to be checked, in the one place status shows.
struct ImportLine: View {
  @Environment(Store.self) private var store
  var action: () -> Void

  var body: some View {
    let importer = store.importer
    let lang = store.lang
    switch importer.phase {
    case .sending, .reading, .review, .saving:
      Button(action: action) {
        HStack(spacing: 10) {
          if importer.phase == .review {
            Image(systemName: "tray.full").foregroundStyle(store.tone)
            Text(importer.rows.isEmpty ? lang.t("导入没有找到航班", "匯入沒有找到航班", "The import found no flights")
                 : lang.t("找到 \(importer.rows.count) 段航班，去核对", "找到 \(importer.rows.count) 段航班，去核對", "Found \(importer.rows.count) flights; check them"))
          } else {
            ProgressView().controlSize(.small).tint(Ink.secondary)
            Text(readingLine(importer.phase, lang))
          }
          Spacer(minLength: 0)
          Image(systemName: "chevron.right").font(.captionStrong).foregroundStyle(Ink.faint)
        }
        .font(.body)
        .monospacedDigit()
        .foregroundStyle(Ink.primary)
        .frame(minHeight: 44)
        .contentShape(.rect)
      }
      .buttonStyle(Press())
    default:
      EmptyView()
    }
  }
}

struct EmptyArchive: View {
  @Environment(Store.self) private var store
  var action: () -> Void

  var body: some View {
    let lang = store.lang
    VStack(alignment: .leading, spacing: 12) {
      Text(lang.t("还没有航班", "還沒有航班", "No flights yet")).font(.large)
      Text(lang.t("航旅纵横截图、电子行程单、订票邮件或 Flighty 导出都可以。", "航旅縱橫截圖、電子行程單、訂票電郵或 Flighty 匯出都可以。", "Umetrip screenshots, e-ticket itineraries, booking emails or a Flighty export all work."))
        .font(.body).foregroundStyle(Ink.secondary)
      PrimaryButton(title: lang.t("导入航班", "匯入航班", "Import flights"), action: action).padding(.top, 8)
    }
  }
}

// The trips in scope, newest first, each with its place from above.
struct TripList: View {
  @Environment(Store.self) private var store
  let year: Int?
  var open: (Route) -> Void

  var body: some View {
    let trips = store.trips(in: year)
    let coming = trips.filter { trip in store.legs(of: trip).contains { !$0.hasLanded(at: store.now) } }.reversed()
    let comingIDs = Set(coming.map(\.id))
    let past = Dictionary(grouping: trips.filter { !comingIDs.contains($0.id) }, by: \.year).sorted { $0.key > $1.key }
    let lang = store.lang
    LazyVStack(alignment: .leading, spacing: 30) {
      if !coming.isEmpty {
        group(lang.t("接下来", "接下來", "Coming up"), Array(coming), yearInDates: true)
      }
      ForEach(past, id: \.key) { group in
        self.group(year == nil || !coming.isEmpty ? String(group.key) : lang.t("旅程", "旅程", "Trips"), group.value, yearInDates: false)
      }
    }
  }

  private func group(_ title: String, _ trips: [Trip], yearInDates: Bool) -> some View {
    LazyVStack(alignment: .leading, spacing: 14) {
      Text(title).font(.headline).monospacedDigit().foregroundStyle(Ink.tertiary)
      ForEach(trips) { trip in
        TripRow(trip: trip, yearInDates: yearInDates && trip.year != Calendar.current.component(.year, from: store.now)) { open(.trip(trip.id)) }
      }
    }
  }
}

struct TripRow: View {
  @Environment(Store.self) private var store
  let trip: Trip
  var yearInDates = false
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 14) {
        CityImage(code: trip.destination, size: CGSize(width: 52, height: 52))
          .clipShape(.rect(cornerRadius: 12, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          HStack(alignment: .firstTextBaseline) {
            Text(tripTitle(trip, store)).font(.headline).lineLimit(1)
            Spacer(minLength: 8)
            Text(Format.span(trip.start, trip.end, store.lang, year: yearInDates || trip.start.prefix(4) != trip.end.prefix(4)))
              .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary).lineLimit(1)
          }
          Text(tripFacts(trip, store)).font(.caption).foregroundStyle(Ink.secondary).lineLimit(1)
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(Press())
  }
}
