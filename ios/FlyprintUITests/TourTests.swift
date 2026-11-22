import XCTest

// A screenshot walk through every screen, at rest and step by step down each
// scroll, for checking layout by eye. Runs only when TEST_RUNNER_FP_TOUR is
// set; shots go to TEST_RUNNER_FP_SHOTS. The account half needs a local
// server in TEST_RUNNER_FP_ORIGIN.
final class TourTests: XCTestCase {
  private let env = ProcessInfo.processInfo.environment
  private var lang: String { env["FP_LANG"] ?? "zh-Hans" }

  override func setUp() async throws {
    guard ProcessInfo.processInfo.environment["FP_TOUR"] != nil else { throw XCTSkip("screenshot tour only on request") }
  }

  @MainActor private func shot(_ name: String) {
    guard let directory = env["FP_SHOTS"] else { return }
    try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appending(path: "\(name).png"))
  }

  @MainActor private func launch(_ arguments: [String]) -> XCUIApplication {
    let app = XCUIApplication()
    let locale = lang.replacingOccurrences(of: "-", with: "_")
    app.launchArguments = ["-AppleLanguages", "(\(lang))", "-AppleLocale", locale, "-fp.lang.reset", "YES"] + arguments
    app.launch()
    return app
  }

  // One drag of a third of the screen, held at the end so nothing coasts.
  @MainActor private func scrollStep(_ app: XCUIApplication, from: CGFloat = 0.8, to: CGFloat = 0.42) {
    let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: from))
    start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: to)),
                withVelocity: .slow, thenHoldForDuration: 0.3)
  }

  @MainActor private func walk(_ name: String, _ arguments: [String], steps: Int, wait: UInt32 = 5) {
    let app = launch(["-fp.reset", "YES"] + arguments)
    sleep(wait)
    shot("\(name)-0")
    for step in 1...max(1, steps) {
      scrollStep(app)
      usleep(500_000)
      shot("\(name)-\(step)")
    }
    app.terminate()
  }

  @MainActor func testSampleScreens() throws {
    let app = launch(["-fp.reset", "YES"])
    sleep(6)
    shot("welcome-0")
    let beats = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.66))
    for beat in 1...2 {
      beats.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.66)))
      sleep(3)
      shot("welcome-\(beat)")
    }
    app.terminate()

    walk("signup", ["-fp.sheet", "signup"], steps: 1, wait: 4)
    walk("signin", ["-fp.sheet", "signin"], steps: 1, wait: 4)
    walk("overview-peek", ["-fp.detent", "peek"], steps: 0, wait: 6)
    walk("overview", ["-fp.detent", "large"], steps: 7)
    walk("overview-2019", ["-fp.detent", "large", "-fp.year", "2019"], steps: 4)
    walk("trip-0", ["-fp.route", "trip#0", "-fp.detent", "large"], steps: 6)
    walk("trip-3", ["-fp.route", "trip#3", "-fp.detent", "large"], steps: 5)
    walk("flight-60", ["-fp.route", "flight#60", "-fp.detent", "large"], steps: 6)
    walk("flight-next", ["-fp.route", "flight#next", "-fp.detent", "large"], steps: 5)
    walk("place-AMS", ["-fp.route", "place#AMS", "-fp.detent", "large"], steps: 7)
    walk("place-TYO", ["-fp.route", "place#TYO", "-fp.detent", "large"], steps: 5)
    walk("flights", ["-fp.tab", "flights", "-fp.detent", "large"], steps: 8)
    walk("footprint", ["-fp.tab", "footprint", "-fp.detent", "large"], steps: 12)
    walk("footprint-peek", ["-fp.tab", "footprint", "-fp.detent", "peek"], steps: 0, wait: 6)
    walk("search", ["-fp.sheet", "search", "-fp.detent", "peek"], steps: 2, wait: 6)
    walk("trip-middle", ["-fp.route", "trip#3"], steps: 0, wait: 6)
  }

  @MainActor private func button(_ app: XCUIApplication, _ labels: [String], prefix: Bool = false) -> XCUIElement {
    let predicate = prefix
      ? NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@ OR label BEGINSWITH %@", labels[0], labels[1], labels[2])
      : NSPredicate(format: "label IN %@", labels)
    return app.buttons.matching(predicate).firstMatch
  }

  // The pager keeps the pages beside the current one; only the current page's copy is on screen.
  @MainActor private func onScreen(_ app: XCUIApplication, _ labels: [String]) -> XCUIElement? {
    let query = app.buttons.matching(NSPredicate(format: "label IN %@", labels))
    for _ in 0..<4 {
      if let shown = query.allElementsBoundByIndex.first(where: { $0.isHittable }) { return shown }
      scrollStep(app)
    }
    return nil
  }

  @MainActor private func field(_ app: XCUIApplication, _ labels: [String]) -> XCUIElement {
    app.textFields.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
  }

  // A flight typed in: the add menu, airport suggestions, the page it opens
  // on, then putting it right and deleting it.
  @MainActor private func addByHand(_ app: XCUIApplication) {
    button(app, ["添加航班", "新增航班", "Add flights"]).tap()
    sleep(1)
    shot("add-menu")
    button(app, ["添加一段航班", "新增一段航班", "Add a flight"]).tap()
    sleep(2)
    shot("editor-empty")
    field(app, ["航班号", "航班號", "Flight number"]).tap(); app.typeText("CX238")
    field(app, ["出发", "出發", "From"]).tap(); app.typeText("London")
    let heathrow = button(app, ["LHR", "LHR", "LHR"], prefix: true)
    _ = heathrow.waitForExistence(timeout: 6)
    shot("editor-suggest")
    heathrow.tap()
    app.typeText("hong kong")
    let hongKong = button(app, ["HKG", "HKG", "HKG"], prefix: true)
    if hongKong.waitForExistence(timeout: 6) { hongKong.tap() }
    field(app, ["起飞时间", "起飛時間", "Departs"]).tap(); app.typeText("23:55")
    field(app, ["降落时间", "降落時間", "Arrives"]).tap(); app.typeText("19:00")
    shot("editor-filled")
    button(app, ["保存", "儲存", "Save"]).tap()
    sleep(4)
    shot("added-flight")
    let calendar = button(app, ["加到日历", "加到日曆", "Add to Calendar"])
    if calendar.waitForExistence(timeout: 3) {
      calendar.tap(); sleep(2); shot("calendar")
      let cancel = app.buttons.matching(NSPredicate(format: "label IN {'取消', 'Cancel', 'Close', '关闭', '關閉'}")).firstMatch
      if cancel.waitForExistence(timeout: 3) { cancel.tap() }
      let discard = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Discard' OR label CONTAINS '放弃' OR label CONTAINS '捨棄'")).firstMatch
      if discard.waitForExistence(timeout: 2) { discard.tap() }
      sleep(2)
    }
    let editLabels = ["修改或删除这段航班", "修改或刪除這段航班", "Edit or delete this flight"]
    onScreen(app, editLabels)?.tap()
    sleep(2)
    shot("editor-edit")
    field(app, ["座位", "座位", "Seat"]).tap(); app.typeText("12A")
    button(app, ["保存", "儲存", "Save"]).tap()
    sleep(4)
    shot("edited-flight")
    onScreen(app, editLabels)?.tap()
    sleep(2)
    onScreen(app, ["删除这段航班", "刪除這段航班", "Delete this flight"])?.tap()
    sleep(1)
    shot("delete-confirm")
    let confirm = app.buttons.matching(NSPredicate(format: "label IN {'删除', '刪除', 'Delete'}")).allElementsBoundByIndex.first { $0.isHittable }
    confirm?.tap()
    sleep(4)
    shot("deleted")
  }

  @MainActor func testAccountScreens() throws {
    let origin = try XCTUnwrap(env["FP_ORIGIN"])
    let email = "tour-\(UUID().uuidString.prefix(8).lowercased())@example.test"
    let password = "pw-\(UUID().uuidString)"
    let app = launch(["-fp.origin", origin, "-fp.reset", "YES", "-fp.sheet", "signup"])
    let fields = app.textFields
    XCTAssert(fields.firstMatch.waitForExistence(timeout: 10))
    fields.element(boundBy: 0).tap(); fields.element(boundBy: 0).typeText("Tour")
    fields.element(boundBy: 1).tap(); fields.element(boundBy: 1).typeText(email)
    app.secureTextFields.firstMatch.tap(); app.secureTextFields.firstMatch.typeText(password)
    app.buttons.matching(NSPredicate(format: "label IN {'创建账户', '建立帳戶', 'Create account'}")).firstMatch.tap()

    // The empty account: the import opens by itself.
    // The system's own "Save Password?" comes from outside the app, sometimes late.
    // On iOS 26 it is hosted by one of several system services, depending on the device.
    let notNow = NSPredicate(format: "label IN {'Not Now', '以后', '现在不', '以後', '不是現在', '暂不', '暫不'}")
    // The sheet runs in SafariViewService (seen with launchctl on the simulator).
    let hosts = ["com.apple.SafariViewService", "com.apple.springboard"].map { XCUIApplication(bundleIdentifier: $0) }
    let monitor = addUIInterruptionMonitor(withDescription: "Save Password") { alert in
      let button = alert.buttons.matching(notNow).firstMatch
      guard button.exists else { return false }
      button.tap(); return true
    }
    defer { removeUIInterruptionMonitor(monitor) }
    for _ in 0..<12 {
      let candidates = [app] + hosts
      // isHittable cannot see a sheet from another process, so only finding the offer ends the wait.
      if let offer = candidates.map({ $0.buttons.matching(notNow).firstMatch }).first(where: { $0.exists }) {
        print("FP tour: password offer in \(offer.debugDescription.prefix(120))")
        offer.tap(); break
      }
      sleep(1)
    }
    // Anything still in front: an interaction lets the interruption monitor answer it.
    if !app.textViews.firstMatch.isHittable { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.02)).tap(); sleep(1) }
    sleep(1)
    shot("import-empty")
    let editor = app.textViews.firstMatch
    XCTAssert(editor.waitForExistence(timeout: 10))
    editor.tap()
    editor.typeText("Date,Flight,From,To,Departure,Arrival\n2025-03-02,CX255,HKG,LHR,23:55,06:15\n2025-03-09,CX254,LHR,HKG,21:30,17:05\n2024-12-20,NH860,HND,TPE,09:00,11:45\n2024-12-27,CI222,TSA,HND,08:15,12:10")
    shot("import-typed")
    app.buttons.matching(NSPredicate(format: "label IN {'开始读取', '開始讀取', 'Read'}")).firstMatch.tap()
    let save = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '保存' OR label BEGINSWITH '儲存' OR label BEGINSWITH 'Save'")).firstMatch
    XCTAssert(save.waitForExistence(timeout: 60))
    shot("import-review")
    scrollStep(app); shot("import-review-1")
    save.tap()
    sleep(3)
    shot("import-saved")
    app.buttons.matching(NSPredicate(format: "label IN {'去看航班', '去看航班', 'See your flights'}")).firstMatch.tap()
    sleep(4)
    shot("account-overview")
    addByHand(app)
    app.terminate()

    // Settings and each of its pages, signed in, step by step down.
    let again = launch(["-fp.origin", origin, "-fp.sheet", "account"])
    sleep(4)
    shot("settings-0")
    for step in 1...3 { scrollStep(again); usleep(500_000); shot("settings-\(step)") }
    let rows: [(String, [String])] = [("name", ["名字", "名字", "Name"]), ("password", ["密码", "密碼", "Password"]),
                                      ("credits", ["数据与影像来源", "數據與影像來源", "Data and imagery"]), ("delete", ["删除账户", "刪除帳戶", "Delete account"])]
    for (name, labels) in rows {
      let row = again.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@ OR label BEGINSWITH %@", labels[0], labels[1], labels[2])).firstMatch
      for _ in 0..<4 where !row.isHittable { scrollStep(again) }
      row.tap()
      sleep(2)
      shot("settings-\(name)-0")
      scrollStep(again); usleep(500_000); shot("settings-\(name)-1")
      // The globe's own settings button sits under the sheet with the same name.
      if let back = again.buttons.matching(NSPredicate(format: "label IN {'设置', '設定', 'Settings'}")).allElementsBoundByIndex.first(where: { $0.isHittable }) { back.tap() } else { again.swipeRight() }
      sleep(1)
    }
  }
}
