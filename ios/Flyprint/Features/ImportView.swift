import PhotosUI
import SwiftUI

// Bringing flights in: screenshots, itineraries, exports or pasted text go up,
// the server reads them, and the reader ticks what to keep before anything is
// saved. Wording follows the web's import page.
struct ImportView: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var photos: [PhotosPickerItem] = []
  @State private var choosingFiles = false
  @FocusState private var typing: Bool
  @State private var scrolled = false

  var body: some View {
    let importer = store.importer
    let lang = store.lang
    ScrollView {
        VStack(alignment: .leading, spacing: 26) {
          switch importer.phase {
          case .idle, .failed: InputForm(photos: $photos, choosingFiles: $choosingFiles, typing: $typing)
          case .sending, .reading: ReadingState()
          case .review, .saving: ReviewList()
          case .saved(let added, let updated, let removed): SavedState(added: added, updated: updated, removed: removed) { dismiss() }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 6)
        .padding(.bottom, 24)
        .animation(.easeOut(duration: 0.2), value: importer.phase)
    }
    .scrollIndicators(.hidden)
    .scrolledOffTop($scrolled)
    .safeAreaInset(edge: .top, spacing: 0) {
      SheetHeader(title: lang.t("导入航班", "匯入航班", "Import flights"))
        .padding(.horizontal, 24).padding(.top, 18).padding(.bottom, 4)
        .background { EdgeBackdrop().opacity(scrolled ? 1 : 0) }
    }
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .bottom) { ActionBar(typing: $typing) }
    .presentationDetents([.large])
    .presentationBackground { SheetGround() }
    .presentationDragIndicator(.visible)
    .onAppear { importer.settle() }
    .onChange(of: photos) {
      let picked = photos
      photos = []
      Task {
        for item in picked {
          if let data = try? await item.loadTransferable(type: Data.self) { importer.add(photo: data) }
        }
      }
    }
    .fileImporter(isPresented: $choosingFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
      if case .success(let urls) = result { urls.forEach(importer.add(file:)) }
    }
  }
}

private struct InputForm: View {
  @Environment(Store.self) private var store
  @Binding var photos: [PhotosPickerItem]
  @Binding var choosingFiles: Bool
  var typing: FocusState<Bool>.Binding

  var body: some View {
    @Bindable var importer = store.importer
    let lang = store.lang
    VStack(alignment: .leading, spacing: 22) {
      Text(lang.t("选截图、行程单或导出文件，也可以直接粘贴文字。读完先给你核对，确认后才保存。",
                  "選截圖、行程單或匯出檔案，也可以直接貼上文字。讀完先給你核對，確認後才儲存。",
                  "Choose screenshots, itineraries or exports, or paste text. You check what was read before anything is saved."))
        .font(.body)
        .foregroundStyle(Ink.secondary)
      if case .failed(let code) = importer.phase {
        Text(problemText(code, lang)).font(.caption).foregroundStyle(Color(red: 1, green: 0.62, blue: 0.4))
      }

      HStack(spacing: 28) {
        PhotosPicker(selection: $photos, maxSelectionCount: 40, matching: .images) {
          SourceLabel(title: lang.t("照片", "相片", "Photos"), symbol: "photo.on.rectangle.angled")
        }
        Button { choosingFiles = true } label: {
          SourceLabel(title: lang.t("文件", "檔案", "Files"), symbol: "doc.text")
        }
      }
      .buttonStyle(Press())

      // What was chosen, as itself: screenshots as pictures, files by name.
      if !importer.uploads.isEmpty {
        ScrollView(.horizontal) {
          HStack(alignment: .top, spacing: 10) {
            ForEach(importer.uploads) { upload in
              ZStack(alignment: .topTrailing) {
                Group {
                  if upload.type.hasPrefix("image/"), let image = UIImage(data: upload.data) {
                    Image(uiImage: image).resizable().scaledToFill()
                  } else {
                    VStack(alignment: .leading, spacing: 6) {
                      Image(systemName: "doc.text").font(.fp(20)).foregroundStyle(Ink.secondary)
                      Spacer(minLength: 0)
                      Text(upload.name).font(.micro).foregroundStyle(Ink.secondary).lineLimit(3)
                      Text(ByteCountFormatter.string(fromByteCount: Int64(upload.data.count), countStyle: .file))
                        .font(.micro).monospacedDigit().foregroundStyle(Ink.tertiary)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .background(Color.white.opacity(0.06))
                  }
                }
                .frame(width: 84, height: 112)
                .clipShape(.rect(cornerRadius: 12, style: .continuous))
                Button {
                  importer.uploads.removeAll { $0.id == upload.id }
                } label: {
                  Image(systemName: "xmark").font(.fp(11, .bold)).foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.9), radius: 3)
                    .frame(width: 32, height: 32).contentShape(.rect)
                }
                .buttonStyle(Press())
                .accessibilityLabel(lang.t("移除", "移除", "Remove"))
              }
            }
          }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
      }

      VStack(alignment: .leading, spacing: 8) {
        ZStack(alignment: .topLeading) {
          if importer.text.isEmpty {
            Text(lang.t("粘贴行程单、订票邮件或登机牌上的文字", "貼上行程單、訂票電郵或登機證上的文字", "Paste an itinerary, a booking email or the text of a boarding pass"))
              .font(.fp(17, relativeTo: .body))
              .foregroundStyle(Ink.tertiary)
              .padding(.top, 8)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }
          TextEditor(text: $importer.text)
            .font(.fp(17, relativeTo: .body))
            .foregroundStyle(Ink.primary)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 110)
            .focused(typing)
            .accessibilityLabel(lang.t("粘贴文字", "貼上文字", "Paste text"))
            .padding(.horizontal, -5)
        }
        Rectangle().fill(Ink.faint).frame(height: 1)
      }

      Formats()

      Text(lang.t("截图、PDF 和认不出格式的文件会交给 Anthropic 的 Claude 识别；原文件读完不保存。",
                  "截圖、PDF 和認不出格式的檔案會交給 Anthropic 的 Claude 辨識；原檔案讀完不保存。",
                  "Screenshots, PDFs and files in an unknown format are read by Anthropic's Claude. Originals are not kept once read."))
        .font(.caption)
        .foregroundStyle(Ink.tertiary)
    }
  }
}

private struct SourceLabel: View {
  @Environment(Store.self) private var store
  let title: String
  let symbol: String

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: symbol).font(.fp(18, .medium))
      Text(title).font(.bodyStrong)
    }
    .foregroundStyle(store.tone)
    .frame(minHeight: 44)
    .contentShape(.rect)
  }
}

private struct Formats: View {
  @Environment(Store.self) private var store

  var body: some View {
    let lang = store.lang
    let rows: [(String, String)] = switch lang {
    case .hans: [("航旅纵横", "行程列表截图（多张、长截图都行），电子行程单 PDF、OFD"),
                 ("航旅 App", "Flighty、Flightradar24、OpenFlights 导出的 CSV"),
                 ("登机牌与订单", "Wallet 登机牌（.pkpass）、日历（.ics）、订票邮件（.eml）、PDF"),
                 ("表格", "任何 Excel 或 CSV，列名中文英文都可以")]
    case .hant: [("航旅縱橫", "行程列表截圖（多張、長截圖都可以），電子行程單 PDF、OFD"),
                 ("航旅 App", "Flighty、Flightradar24、OpenFlights 匯出的 CSV"),
                 ("登機證與訂單", "Wallet 登機證（.pkpass）、日曆（.ics）、訂票電郵（.eml）、PDF"),
                 ("表格", "任何 Excel 或 CSV，欄名中文英文都可以")]
    case .en: [("Umetrip", "Trip list screenshots (several, or one long one) and e-ticket itineraries as PDF or OFD"),
               ("Flight apps", "CSV exports from Flighty, Flightradar24 and OpenFlights"),
               ("Passes and bookings", "Wallet boarding passes (.pkpass), calendars (.ics), booking emails (.eml), PDFs"),
               ("Spreadsheets", "Any Excel or CSV file, with headings in English or Chinese")]
    }
    VStack(alignment: .leading, spacing: 14) {
      SectionTitle(text: lang.t("能读的", "能讀的", "What it reads"))
      ForEach(rows, id: \.0) { row in
        VStack(alignment: .leading, spacing: 3) {
          Text(row.0).font(.bodyStrong)
          Text(row.1).font(.caption).foregroundStyle(Ink.secondary)
        }
      }
    }
  }
}

private struct ReadingState: View {
  @Environment(Store.self) private var store

  var body: some View {
    let lang = store.lang
    VStack(alignment: .leading, spacing: 14) {
      Text(stage).font(.headline).monospacedDigit()
      if case .reading(let progress?) = store.importer.phase, progress.stage == "extracting", progress.total > 0 {
        ProgressView(value: Double(progress.done), total: Double(progress.total)).tint(store.tone)
      } else {
        ProgressView().progressViewStyle(.linear).tint(store.tone)
      }
      Text(lang.t("截图和 PDF 每批大约要半分钟。可以先去别处看看，回来接着核对。",
                  "截圖和 PDF 每批大約要半分鐘。可以先去別處看看，回來接著核對。",
                  "Screenshots and PDFs take about half a minute a batch. You can look around and come back to check them."))
        .font(.caption)
        .foregroundStyle(Ink.tertiary)
    }
  }

  private var stage: String { readingLine(store.importer.phase, store.lang) }
}

func readingLine(_ phase: Importer.Phase, _ lang: Lang) -> String {
  guard case .reading(let progress?) = phase else { return lang.t("正在读取文件", "正在讀取檔案", "Reading files") }
  switch progress.stage {
  case "extracting": return lang.t("正在识别 \(progress.done)/\(progress.total)", "正在辨識 \(progress.done)/\(progress.total)", "Reading \(progress.done) of \(progress.total)")
  case "naming": return lang.t("正在整理机场和航司", "正在整理機場和航空公司", "Naming airports and airlines")
  case "checking": return lang.t("正在和已有记录核对", "正在和已有記錄核對", "Checking against your log")
  default: return lang.t("正在读取文件", "正在讀取檔案", "Reading files")
  }
}

private struct ReviewList: View {
  @Environment(Store.self) private var store

  var body: some View {
    let importer = store.importer
    let lang = store.lang
    VStack(alignment: .leading, spacing: 18) {
      if importer.rows.isEmpty {
        Text(lang.t("没有找到航班。换一张更清楚的截图，或者试试电子行程单。", "沒有找到航班。換一張更清楚的截圖，或者試試電子行程單。", "No flights found. Try a sharper screenshot or the itinerary PDF."))
          .font(.body)
          .foregroundStyle(Ink.secondary)
      } else {
        Text(foundLine)
          .font(.body)
          .foregroundStyle(Ink.secondary)
          .monospacedDigit()
        if let notice = importer.notice {
          Text(problemText(notice, lang)).font(.caption).foregroundStyle(Color(red: 1, green: 0.62, blue: 0.4))
        }
        VStack(alignment: .leading, spacing: 4) {
          ForEach(importer.rows) { row in DraftRowView(row: row) }
        }
      }
    }
  }

  private var foundLine: String {
    let rows = store.importer.rows, lang = store.lang
    let chosen = store.importer.chosen.count
    if rows.contains(where: { $0.state == "update" || $0.state == "remove" }) {
      return lang.t("找到 \(rows.count) 段航班，\(chosen) 段要保存", "找到 \(rows.count) 段航班，\(chosen) 段要儲存", "Found \(rows.count) flights, \(chosen) to save")
    }
    return lang.t("找到 \(rows.count) 段航班，\(chosen) 段可以加入", "找到 \(rows.count) 段航班，\(chosen) 段可以加入", "Found \(rows.count) flights, \(chosen) new")
  }
}

private struct DraftRowView: View {
  @Environment(Store.self) private var store
  let row: DraftRow

  var body: some View {
    let kept = row.include && row.canSave
    Button { store.importer.toggle(row) } label: {
      HStack(alignment: .top, spacing: 14) {
        AirlineMark(code: row.airline, size: 28).padding(.top, 2)
        VStack(alignment: .leading, spacing: 3) {
          Text("\(city(row.fields.origin)) → \(city(row.fields.destination))")
            .font(.headline)
          Text(detail)
            .font(.caption)
            .monospacedDigit()
            .foregroundStyle(Ink.secondary)
          if let note {
            Text(note)
              .font(.caption)
              .foregroundStyle(row.state == "problem" ? Color(red: 1, green: 0.62, blue: 0.4) : Ink.tertiary)
          }
        }
        Spacer(minLength: 8)
        Image(systemName: "checkmark")
          .font(.fp(15, .bold))
          .foregroundStyle(store.tone)
          .opacity(kept ? 1 : 0)
          .padding(.top, 4)
      }
      .padding(.vertical, 10)
      .contentShape(.rect)
      .opacity(row.canSave ? (kept ? 1 : 0.45) : 0.4)
    }
    .buttonStyle(.plain)
    .disabled(!row.canSave || store.importer.phase == .saving)
    .sensoryFeedback(.selection, trigger: row.include)
  }

  private func city(_ code: String) -> String {
    guard !code.isEmpty else { return "—" }
    return store.lang.pick(store.importer.atlas?.places[code]?.city) ?? store.city(code)
  }

  private var detail: String {
    let lang = store.lang, f = row.fields
    var parts = [f.date.isEmpty ? "—" : Format.date(f.date, lang), f.flight].filter { !$0.isEmpty }
    if !f.depart.isEmpty { parts.append(f.arrive.isEmpty ? f.depart : "\(f.depart) → \(f.arrive)") }
    if row.upcoming { parts.append(lang.t("未出行", "未出行", "Upcoming")) }
    return parts.joined(separator: " · ")
  }

  private var note: String? {
    let lang = store.lang
    switch row.state {
    case "problem":
      return row.problems.map { problemNote($0, lang) }.joined(separator: lang.isChinese ? "；" : "; ")
    case "duplicate":
      return row.likely == true
        ? lang.t("可能已在记录里，确认是另一次飞行再勾选", "可能已在記錄裏，確認是另一次飛行再勾選", "Possibly logged already; tick it only if it was another flight")
        : lang.t("已在记录里", "已在記錄裏", "Already logged")
    case "update":
      let changes = (row.changes ?? []).map { "\(fieldName($0.field, lang)) \($0.from.isEmpty ? "—" : $0.from) → \($0.to)" }
      return ([lang.t("有变更", "有變更", "Changed")] + changes).joined(separator: " · ")
    case "remove": return lang.t("已取消，会移除", "已取消，會移除", "Cancelled; will be removed")
    case "cancelled": return lang.t("已取消", "已取消", "Cancelled")
    default: return nil
    }
  }

  private func fieldName(_ field: String, _ lang: Lang) -> String {
    switch field {
    case "depart": lang.t("起飞", "起飛", "Departs")
    case "arrive": lang.t("到达", "到達", "Arrives")
    case "seat": lang.t("座位", "座位", "Seat")
    default: lang.t("舱位", "艙位", "Cabin")
    }
  }

  private func problemNote(_ problem: String, _ lang: Lang) -> String {
    switch problem {
    case "date": lang.t("日期不对", "日期不對", "The date is not valid")
    case "origin": lang.t("认不出出发机场", "認不出出發機場", "Departure airport not recognised")
    case "destination": lang.t("认不出到达机场", "認不出到達機場", "Arrival airport not recognised")
    case "same_airport": lang.t("出发和到达是同一个机场", "出發和到達是同一個機場", "Departure and arrival are the same airport")
    case "flight": lang.t("航班号不对", "航班號不對", "The flight number is not valid")
    default: lang.t("时刻和航程对不上，飞行时长按距离估算", "時刻和航程對不上，飛行時長按距離估算", "The times don't fit the distance; flight time is estimated")
    }
  }
}

private struct SavedState: View {
  @Environment(Store.self) private var store
  let added: Int, updated: Int, removed: Int
  var done: () -> Void

  var body: some View {
    let lang = store.lang
    VStack(alignment: .leading, spacing: 28) {
      VStack(alignment: .leading, spacing: 8) {
        Text(line).font(.title).monospacedDigit()
        Text(lang.t("地图和统计已经更新。", "地圖和統計已經更新。", "Your map and figures are up to date."))
          .font(.body)
          .foregroundStyle(Ink.secondary)
      }
      // The payoff: the places this import brought in, as places.
      let metros = cities
      if !metros.isEmpty {
        VStack(alignment: .leading, spacing: 12) {
          SectionTitle(text: lang.t("这次导入的城市", "這次匯入的城市", "Cities in this import"))
          LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(metros, id: \.self) { metro in CityCard(metro: metro, width: (UIScreen.main.bounds.width - 60) / 2) }
          }
          ImageryCredit()
        }
      }
    }
  }

  private var cities: [String] {
    var seen: [String] = []
    for row in store.importer.chosen {
      for code in [row.fields.destination, row.fields.origin] where !code.isEmpty && store.position(code) != nil {
        let metro = metroOf(code)
        if !seen.contains(metro) { seen.append(metro) }
      }
    }
    return Array(seen.prefix(6))
  }

  private var line: String {
    let lang = store.lang
    var parts: [String] = []
    if added > 0 { parts.append(lang.t("加入 \(added) 段", "加入 \(added) 段", "added \(added)")) }
    if updated > 0 { parts.append(lang.t("更新 \(updated) 段", "更新 \(updated) 段", "updated \(updated)")) }
    if removed > 0 { parts.append(lang.t("移除 \(removed) 段", "移除 \(removed) 段", "removed \(removed)")) }
    guard !parts.isEmpty else { return lang.t("已保存", "已儲存", "Saved") }
    if lang == .en {
      let sentence = parts.joined(separator: ", ")
      return sentence.prefix(1).uppercased() + sentence.dropFirst()
    }
    return "已" + parts.joined(separator: "、")
  }
}

// The one action for the phase, held above the keyboard and the home indicator.
private struct ActionBar: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  var typing: FocusState<Bool>.Binding

  var body: some View {
    let importer = store.importer
    let lang = store.lang
    Group {
      switch importer.phase {
      case .idle, .failed:
        let ready = !importer.uploads.isEmpty || !importer.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        primary(lang.t("开始读取", "開始讀取", "Read"), enabled: ready) { typing.wrappedValue = false; importer.start() }
      case .review, .saving:
        VStack(spacing: 6) {
          if importer.rows.isEmpty {
            primary(lang.t("重新选择文件", "重新選擇檔案", "Choose other files"), enabled: true) { importer.reset() }
          } else {
            let count = importer.chosen.count
            primary(importer.phase == .saving ? lang.t("正在保存…", "正在儲存…", "Saving…") : lang.t("保存 \(count) 段", "儲存 \(count) 段", count == 1 ? "Save 1 flight" : "Save \(count) flights"),
                    enabled: count > 0 && importer.phase == .review) { importer.save() }
            Button(lang.t("放弃这次导入", "放棄這次匯入", "Discard this import")) { importer.discard() }
              .font(.caption)
              .foregroundStyle(Ink.secondary)
              .buttonStyle(.plain)
              .frame(minHeight: 40)
          }
        }
      case .saved:
        primary(lang.t("去看航班", "去看航班", "See your flights"), enabled: true) { dismiss() }
      case .sending, .reading:
        EmptyView()
      }
    }
    .padding(.horizontal, 24)
    .padding(.top, 10)
    .padding(.bottom, 8)
    .background {
      switch importer.phase {
      case .sending, .reading: EmptyView()
      default: BottomBackdrop()
      }
    }
  }

  private func primary(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
    PrimaryButton(title: title, action: action).disabled(!enabled)
  }
}
