import Foundation

// The interface language governs every string the app writes: words, dates,
// numbers and units. Wording follows the web (app/lib/copy.ts, copy-plan.ts).
enum Lang: Int, Sendable {
  case hans = 0, hant = 1, en = 2

  // The phone's language for this app (Settings › Flyprint › Language included).
  nonisolated static var system: Lang {
    let id = Bundle.main.preferredLocalizations.first ?? "zh-Hans"
    if id.hasPrefix("zh-Hant") || id == "zh-HK" || id == "zh-TW" { return .hant }
    if id.hasPrefix("zh") { return .hans }
    return .en
  }

  // The language picked in the app's own settings; nil follows the phone.
  nonisolated static var chosen: Lang? {
    get { (UserDefaults.standard.object(forKey: "fp.lang") as? Int).flatMap(Lang.init(rawValue:)) }
    set { if let newValue { UserDefaults.standard.set(newValue.rawValue, forKey: "fp.lang") } else { UserDefaults.standard.removeObject(forKey: "fp.lang") } }
  }

  nonisolated static var current: Lang { chosen ?? system }

  // Each language named in itself, as language pickers do.
  var name: String {
    switch self { case .hans: "简体中文"; case .hant: "繁體中文"; case .en: "English" }
  }

  var locale: Locale {
    switch self {
    case .hans: Locale(identifier: "zh-Hans-CN")
    case .hant: Locale(identifier: "zh-Hant-HK")
    case .en: Locale(identifier: "en-GB")
    }
  }

  var isChinese: Bool { self != .en }

  func pick(_ names: Names?) -> String? {
    guard let names, names.indices.contains(rawValue), !names[rawValue].isEmpty else { return nil }
    return names[rawValue]
  }

  func t(_ hans: String, _ hant: String, _ en: String) -> String {
    switch self { case .hans: hans; case .hant: hant; case .en: en }
  }
}

enum Format {
  private static let utc = TimeZone(identifier: "UTC")!

  static func day(_ iso: String) -> Date? {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = utc
    let parts = iso.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  private static func formatter(_ template: String, _ lang: Lang) -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = lang.locale
    formatter.timeZone = utc
    formatter.setLocalizedDateFormatFromTemplate(template)
    return formatter
  }

  // 2026年12月2日 / 2 Dec 2026
  static func date(_ iso: String, _ lang: Lang = .current, year: Bool = true) -> String {
    guard let date = day(iso) else { return iso }
    return formatter(year ? "yMMMd" : "MMMd", lang).string(from: date)
  }

  // 2024年4月 / Apr 2024
  static func month(_ iso: String, _ lang: Lang = .current) -> String {
    guard let date = day(iso) else { return iso }
    return formatter("yMMM", lang).string(from: date)
  }

  // 2024年4月5日周五 / Fri, 5 Apr 2024
  static func dayAndWeekday(_ iso: String, _ lang: Lang = .current) -> String {
    guard let date = day(iso) else { return iso }
    return formatter("yMMMdEEE", lang).string(from: date)
  }

  static func weekday(_ iso: String, _ lang: Lang = .current) -> String {
    guard let date = day(iso) else { return "" }
    return formatter("EEE", lang).string(from: date)
  }

  // A span of days, written once where the two ends share a month or year.
  static func span(_ start: String, _ end: String, _ lang: Lang = .current, year: Bool = true) -> String {
    if start == end { return date(start, lang, year: year) }
    guard let a = day(start), let b = day(end) else { return "\(start)–\(end)" }
    let interval = DateIntervalFormatter()
    interval.locale = lang.locale
    interval.timeZone = utc
    interval.dateTemplate = year ? "yMMMd" : "MMMd"
    return interval.string(from: a, to: b)
  }

  static func number(_ value: Double, _ lang: Lang = .current) -> String {
    let formatter = NumberFormatter()
    formatter.locale = lang.locale
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value.rounded())) ?? String(Int(value))
  }

  static func decimal(_ value: Double, _ lang: Lang = .current, digits: Int = 1) -> String {
    let formatter = NumberFormatter()
    formatter.locale = lang.locale
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = digits
    formatter.maximumFractionDigits = digits
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
  }

  // 3 小时 5 分 / 3 h 5 min
  static func duration(minutes: Int, _ lang: Lang = .current) -> String {
    let h = minutes / 60, m = minutes % 60
    switch lang {
    case .hans: return h > 0 ? (m > 0 ? "\(h) 小时 \(m) 分" : "\(h) 小时") : "\(m) 分钟"
    case .hant: return h > 0 ? (m > 0 ? "\(h) 小時 \(m) 分" : "\(h) 小時") : "\(m) 分鐘"
    case .en: return h > 0 ? (m > 0 ? "\(h) h \(m) min" : "\(h) h") : "\(m) min"
    }
  }

  static func hours(minutes: Int) -> Int { Int((Double(minutes) / 60).rounded()) }
}

// Chinese runs straight into a Han neighbour, with a space before and after Latin and digits.
func joined(_ parts: String...) -> String { parts.filter { !$0.isEmpty }.joined() }

// What a server error code means to the reader, worded as on the web (copy-account.ts).
func problemText(_ code: String, _ lang: Lang) -> String {
  let words: [String: (String, String, String)] = [
    "credentials": ("邮箱或密码不对", "電郵或密碼不對", "That email and password don't match"),
    "taken": ("这个邮箱已经注册过，直接登录吧", "這個電郵已經註冊過，直接登入吧", "That email already has an account; sign in instead"),
    "email": ("邮箱格式不对", "電郵格式不對", "That doesn't look like an email address"),
    "password_short": ("密码至少 8 位", "密碼至少 8 位", "Use at least 8 characters"),
    "password_long": ("密码太长了", "密碼太長了", "That password is too long"),
    "throttled": ("试得太多了，过一刻钟再来", "試得太多了，過一刻鐘再來", "Too many tries; wait a quarter of an hour"),
    "signed_out": ("登录已过期，请重新登录", "登入已過期，請重新登入", "You've been signed out; sign in again"),
    "busy": ("上一次导入还在读取，等它完成再来", "上一次匯入還在讀取，等它完成再來", "Your last import is still being read"),
    "site_busy": ("现在正在导入的人有点多，过一会儿再试", "現在正在匯入的人有點多，過一會兒再試", "Lots of imports right now; try again in a moment"),
    "empty": ("没有可读的文件或文字", "沒有可讀的檔案或文字", "Nothing to read"),
    "too_large": ("文件加起来太大了（上限 80 MB）", "檔案加起來太大了（上限 80 MB）", "The files are too large together (80 MB at most)"),
    "file_too_large": ("有文件超过 15 MB", "有檔案超過 15 MB", "A file is over 15 MB"),
    "too_many_files": ("一次最多 40 个文件", "一次最多 40 個檔案", "40 files at most at a time"),
    "form": ("上传没有成功，请重试", "上載沒有成功，請重試", "The upload didn't go through; try again"),
    "not_ready": ("这次导入已经处理过了", "這次匯入已經處理過了", "This import was already handled"),
    "changed": ("有几段航班在这期间变了，看一下再保存", "有幾段航班在這期間變了，看一下再儲存", "Some flights changed in the meantime; look them over and save again"),
    "not_found": ("找不到这次导入", "找不到這次匯入", "Import not found"),
    "quota": ("今天的自动识别次数用完了，明天再试", "今天的自動辨識次數用完了，明天再試", "Today's reading allowance is used up; try tomorrow"),
    "model_unavailable": ("暂时没法识别图片和文档", "暫時沒法辨識圖片和文件", "Images and documents can't be read right now"),
    "model_failed": ("识别失败，可以再试一次", "辨識失敗，可以再試一次", "Reading failed; try again"),
    "refused": ("这个文件没法识别", "這個檔案沒法辨識", "This file can't be read"),
    "too_long": ("内容太长，拆成几份再试", "內容太長，拆成幾份再試", "Too long; split it and try again"),
    "format": ("认不出这个格式", "認不出這個格式", "Unknown format"),
    "damaged": ("文件好像损坏了", "檔案好像損壞了", "The file seems damaged"),
    "big": ("文件太大，没法识别", "檔案太大，沒法辨識", "Too large to read"),
    "interrupted": ("读取被中断了，请重试", "讀取被中斷了，請重試", "Reading was interrupted; try again"),
    "too_many": ("一次要识别的内容太多，分几次导入", "一次要辨識的內容太多，分幾次匯入", "Too much to read at once; import in parts"),
    "network": ("网络断了，请重试", "網絡斷了，請重試", "Connection lost; try again"),
    "name": ("名字不能是空的", "名字不能是空的", "Your name can't be empty"),
    "current_password": ("现在的密码不对", "現在的密碼不對", "That isn't your current password"),
  ]
  let server = ("服务器出了点问题，请稍后再试", "伺服器出了點問題，請稍後再試", "Something went wrong on the server; try again shortly")
  let entry = words[code] ?? server
  return lang.t(entry.0, entry.1, entry.2)
}
