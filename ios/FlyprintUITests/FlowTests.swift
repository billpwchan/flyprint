import XCTest

// A new person's whole first session against a local server with a fresh data
// directory (FP_ORIGIN comes from the test run): the welcome, creating an
// account, the import that opens by itself, the globe, the language switched
// in settings, signing out, signing back in, and deleting the account.
final class FlowTests: XCTestCase {
  private let env = ProcessInfo.processInfo.environment

  @MainActor private func shot(_ name: String) {
    let screenshot = XCUIScreen.main.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
    if let directory = env["FP_SHOTS"] {
      try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: directory).appending(path: "\(name).png"))
    }
  }

  @MainActor private func type(_ text: String, into field: XCUIElement) {
    XCTAssert(field.waitForExistence(timeout: 5), "\(field) is missing")
    field.tap()
    field.typeText(text)
  }

  @MainActor private func button(_ label: String, _ app: XCUIApplication) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
  }

  @MainActor private func reach(_ element: XCUIElement, _ app: XCUIApplication) {
    for _ in 0..<6 where !element.isHittable { app.swipeUp() }
  }

  // The system offers to keep a new password; a person would answer it first.
  @MainActor private func dismissPasswordOffer(_ app: XCUIApplication) {
    let notNow = app.buttons.matching(NSPredicate(format: "label IN {'Not Now', '以后', '不是現在', '现在不'}")).firstMatch
    if notNow.waitForExistence(timeout: 4) { notNow.tap() }
  }

  @MainActor func testFirstSession() throws {
    let origin = try XCTUnwrap(env["FP_ORIGIN"])
    // Made up for this run on the local server only.
    let email = "flow-\(UUID().uuidString.prefix(8).lowercased())@example.test"
    let password = "pw-\(UUID().uuidString)"
    let app = XCUIApplication()
    app.launchArguments = ["-fp.origin", origin, "-fp.reset", "YES", "-fp.lang.reset", "YES", "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
    app.launch()

    XCTAssert(button("创建账户", app).waitForExistence(timeout: 10))
    shot("01-welcome")
    button("创建账户", app).tap()
    type("Flow", into: app.textFields["名字"])
    type(email, into: app.textFields["邮箱"])
    type(password, into: app.secureTextFields["密码"])
    shot("02-sign-up")
    button("创建账户", app).tap()

    // Nothing logged yet: the import opens by itself.
    let read = app.buttons["开始读取"]
    XCTAssert(read.waitForExistence(timeout: 15))
    dismissPasswordOffer(app)
    shot("03-import")
    let editor = app.textViews.firstMatch
    sleep(1)
    editor.tap()
    XCTAssert(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    editor.typeText("Date,Flight,From,To,Departure,Arrival\n2025-03-02,CX255,HKG,LHR,23:55,06:15\n2025-03-09,CX254,LHR,HKG,21:30,17:05\n2024-12-20,NH860,HND,TPE,09:00,11:45\n2024-12-27,CI222,TSA,HND,08:15,12:10")
    read.tap()
    let save = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '保存'")).firstMatch
    XCTAssert(save.waitForExistence(timeout: 60))
    shot("04-review")
    XCTAssertEqual(save.label, "保存 4 段")
    save.tap()
    let see = app.buttons["去看航班"]
    XCTAssert(see.waitForExistence(timeout: 30))
    shot("05-saved")
    see.tap()
    sleep(4)
    shot("06-globe")
    XCTAssert(app.staticTexts["伦敦"].exists || app.staticTexts["东京"].exists)

    // The language switches in place and back to following the phone.
    app.buttons["设置"].tap()
    XCTAssert(app.staticTexts["语言"].waitForExistence(timeout: 5))
    shot("07-settings")
    button("English", app).tap()
    XCTAssert(app.staticTexts["Language"].waitForExistence(timeout: 5))
    shot("08-settings-english")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Same as phone'")).firstMatch.tap()
    XCTAssert(app.staticTexts["语言"].waitForExistence(timeout: 5))

    // Signing out returns to the welcome; signing in brings the flights back.
    let row = button("退出登录", app)
    reach(row, app)
    let rowFrame = row.frame
    row.tap()
    let confirm = app.buttons.matching(NSPredicate(format: "label == '退出登录'"))
    XCTAssert(confirm.element(boundBy: 1).waitForExistence(timeout: 5))
    sleep(1)
    let option = confirm.allElementsBoundByIndex.first { $0.frame != rowFrame && $0.isHittable }
    try XCTUnwrap(option, app.debugDescription).tap()
    XCTAssert(button("创建账户", app).waitForExistence(timeout: 10))
    button("我有账户，登录", app).tap()
    type(email, into: app.textFields["邮箱"])
    type(password, into: app.secureTextFields["密码"])
    shot("09-sign-in")
    button("登录", app).tap()
    XCTAssert(app.buttons["设置"].waitForExistence(timeout: 15))
    dismissPasswordOffer(app)
    sleep(3)
    XCTAssert(app.staticTexts["伦敦"].exists || app.staticTexts["东京"].exists)

    // Deleting the account asks for the password and ends at the welcome.
    app.buttons["设置"].tap()
    XCTAssert(app.staticTexts["语言"].waitForExistence(timeout: 5))
    reach(button("删除账户", app), app)
    button("删除账户", app).tap()
    type(password, into: app.secureTextFields["输入密码确认"])
    shot("10-delete")
    button("删除账户和全部航班", app).tap()
    XCTAssert(button("创建账户", app).waitForExistence(timeout: 15))
  }
}
