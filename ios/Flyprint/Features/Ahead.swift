import EventKit
import EventKitUI
import SwiftUI
import UserNotifications

// For a flight still ahead: put it in the calendar, and be reminded when
// check-in opens and when it is time to leave. Both run on the phone alone;
// times come from the logged schedule, so they move only when the flight is
// put right or re-imported.
enum Reminders {
  static let key = "fp.reminders"
  private static let prefix = "fp.flight."
  // iOS keeps at most 64 pending; two per flight leaves room.
  private static let most = 24

  static var enabled: Bool { UserDefaults.standard.bool(forKey: key) }

  // Asks once; a refusal leaves the switch off.
  static func enable() async -> Bool {
    let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    UserDefaults.standard.set(granted, forKey: key)
    return granted
  }

  static func disable() async {
    UserDefaults.standard.set(false, forKey: key)
    await clear()
  }

  private static func clear() async {
    let center = UNUserNotificationCenter.current()
    let ours = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
    center.removePendingNotificationRequests(withIdentifiers: ours)
  }

  // Everything pending is redrawn from the flights as they are now.
  static func schedule(_ store: Store) async {
    await clear()
    guard enabled, !store.isSample else { return }
    let center = UNUserNotificationCenter.current()
    let now = Date()
    let lang = store.lang
    let timed = store.ahead.filter { ($0.departAt ?? 0) / 1000 > now.timeIntervalSince1970 }
    for flight in timed.prefix(most) {
      // A newer change has started its own pass; this one stops adding.
      guard !Task.isCancelled, let departAt = flight.departAt else { return }
      let departure = Date(timeIntervalSince1970: departAt / 1000)
      let abroad = store.place(flight.origin)?.country != store.place(flight.destination)?.country
      let leadHours = abroad ? 3 : 2
      let route = "\(store.city(flight.origin)) → \(store.city(flight.destination))"
      let airport = lang.pick(store.place(flight.origin)?.name) ?? flight.origin
      let named = flight.flight.isEmpty ? route : flight.flight
      let reminders: [(String, Date, String, String)] = [
        ("checkin", departure.addingTimeInterval(-24 * 3600),
         lang.t("\(named) 明天 \(flight.depart) 起飞", "\(named) 明天 \(flight.depart) 起飛", "\(named) leaves tomorrow at \(flight.depart)"),
         lang.t("\(route)。网上值机通常已经开放。", "\(route)。網上登記通常已經開放。", "\(route). Online check-in is usually open now.")),
        ("leave", departure.addingTimeInterval(-Double(leadHours) * 3600),
         lang.t("\(named) \(leadHours) 小时后起飞", "\(named) \(leadHours) 小時後起飛", "\(named) leaves in \(leadHours) hours"),
         lang.t("\(flight.depart) 从\(airport)起飞，该去机场了。", "\(flight.depart) 從\(airport)起飛，該去機場了。", "\(flight.depart) from \(airport). Time to head to the airport.")),
      ]
      for (kind, when, title, body) in reminders where when > now && !Task.isCancelled {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = flight.id
        content.userInfo = ["flight": flight.id]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: when.timeIntervalSince(now), repeats: false)
        try? await center.add(UNNotificationRequest(identifier: "\(prefix)\(flight.id).\(kind)", content: content, trigger: trigger))
      }
    }
  }
}

// Calendar and reminders, side by side under the board of a flight ahead.
struct AheadActions: View {
  @Environment(Store.self) private var store
  let flight: Flight
  @AppStorage(Reminders.key) private var reminding = false
  @State private var calendar = false
  @State private var refused = false

  var body: some View {
    let lang = store.lang
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 10) {
        action(lang.t("加到日历", "加到日曆", "Add to Calendar"), symbol: "calendar.badge.plus", on: false) { calendar = true }
        action(reminding ? lang.t("行前提醒已开", "行前提醒已開", "Reminders on") : lang.t("行前提醒", "行前提醒", "Remind me"),
               symbol: reminding ? "bell.fill" : "bell", on: reminding) {
          Task {
            if reminding { await Reminders.disable(); reminding = false } else {
              let granted = await Reminders.enable()
              reminding = granted
              refused = !granted
              if granted { await Reminders.schedule(store) }
            }
          }
        }
      }
      Text(refused
           ? lang.t("通知没有打开。可以在 iPhone 的「设置 → 通知 → 航迹」里打开。", "通知沒有打開。可以在 iPhone 的「設定 → 通知 → 航跡」裏打開。", "Notifications are off for Flyprint; turn them on in the iPhone's Settings.")
           : lang.t("每段未来航班起飞前 24 小时提醒值机，起飞前 2 到 3 小时提醒出发。", "每段未來航班起飛前 24 小時提醒登記，起飛前 2 至 3 小時提醒出發。", "For every flight ahead: check-in 24 hours before, and when to leave 2 to 3 hours before."))
        .font(.micro).foregroundStyle(refused ? Palette.warning : Ink.tertiary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .sheet(isPresented: $calendar) {
      CalendarEditor(event: event()) { calendar = false }.ignoresSafeArea()
    }
  }

  private func action(_ title: String, symbol: String, on: Bool, perform: @escaping () -> Void) -> some View {
    Button(action: perform) {
      HStack(spacing: 7) {
        Image(systemName: symbol).font(.fp(14, .medium)).contentTransition(.symbolEffect(.replace))
        Text(title).font(.bodyStrong).lineLimit(1)
      }
      .foregroundStyle(on ? store.tone : Ink.primary)
      .padding(.horizontal, 14)
      .frame(height: 40)
      .background(Capsule().fill(on ? store.tone.opacity(0.16) : Ink.primary.opacity(0.08)))
      .contentShape(.capsule)
    }
    .buttonStyle(Press())
    .sensoryFeedback(.selection, trigger: on)
  }

  private func event() -> EKEvent {
    let lang = store.lang
    let event = EKEvent(eventStore: CalendarEditor.store)
    let route = "\(store.city(flight.origin)) → \(store.city(flight.destination))"
    event.title = flight.flight.isEmpty ? route : "\(flight.flight) \(route)"
    if let departAt = flight.departAt {
      event.startDate = Date(timeIntervalSince1970: departAt / 1000)
      event.endDate = flight.arriveAt.map { Date(timeIntervalSince1970: $0 / 1000) } ?? event.startDate.addingTimeInterval(Double(max(30, flight.durationMinutes)) * 60)
    } else {
      // An all-day event is read in the phone's own time zone; the date is a calendar day.
      let parts = flight.date.split(separator: "-").compactMap { Int($0) }
      event.isAllDay = true
      event.startDate = parts.count == 3 ? Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) ?? Date() : Date()
      event.endDate = event.startDate
    }
    event.location = lang.pick(store.place(flight.origin)?.name).map { "\($0) (\(flight.origin))" } ?? flight.origin
    var notes = [lang.t("\(flight.depart) 起飞 · \(flight.arrive) 降落（当地时间）", "\(flight.depart) 起飛 · \(flight.arrive) 降落（當地時間）", "Departs \(flight.depart), arrives \(flight.arrive), local times")]
    if let seat = flight.seat, !seat.isEmpty { notes.append(lang.t("座位 \(seat)", "座位 \(seat)", "Seat \(seat)")) }
    event.notes = notes.joined(separator: "\n")
    return event
  }
}

// The system's own event sheet, filled in; the reader picks the calendar and
// saves. Adding through it needs no calendar permission.
struct CalendarEditor: UIViewControllerRepresentable {
  static let store = EKEventStore()
  let event: EKEvent
  var done: () -> Void

  func makeUIViewController(context: Context) -> EKEventEditViewController {
    let controller = EKEventEditViewController()
    controller.eventStore = Self.store
    controller.event = event
    controller.editViewDelegate = context.coordinator
    controller.overrideUserInterfaceStyle = .dark
    return controller
  }

  func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}
  func makeCoordinator() -> Coordinator { Coordinator(done: done) }

  final class Coordinator: NSObject, EKEventEditViewDelegate {
    let done: () -> Void
    init(done: @escaping () -> Void) { self.done = done }
    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { done() }
  }
}
