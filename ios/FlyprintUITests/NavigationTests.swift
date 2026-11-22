import XCTest

// Back is one step to where the reader came from, and the system's edge swipe
// does it on every page, including pages that browse sideways.
final class NavigationTests: XCTestCase {
  @MainActor private func launch(_ arguments: [String], detent: String = "large") -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-fp.reset", "YES", "-fp.detent", detent, "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"] + arguments
    app.launch()
    return app
  }

  @MainActor private func edgeSwipe(_ app: XCUIApplication) {
    let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.6))
    start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.6)))
  }

  // The overview's figures are only on the first page.
  @MainActor private func onOverview(_ app: XCUIApplication) -> Bool {
    app.buttons.matching(NSPredicate(format: "label CONTAINS '次飞行'")).firstMatch.waitForExistence(timeout: 3)
  }

  @MainActor func testEdgeSwipeLeavesATrip() throws {
    let app = launch(["-fp.route", "trip#3"])
    XCTAssertFalse(onOverview(app))
    edgeSwipe(app)
    XCTAssertTrue(onOverview(app))
  }

  @MainActor func testBrowsingSidewaysIsNotABackStep() throws {
    let app = launch(["-fp.route", "flight#4"])
    XCTAssertFalse(onOverview(app))
    let middle = app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.6))
    middle.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.6)))
    sleep(1)
    app.buttons["下一个"].tap()
    sleep(1)
    edgeSwipe(app)
    XCTAssertTrue(onOverview(app))
  }

  // Turning the globe away offers one tap back to the framed view, which then goes away.
  @MainActor func testRecentreAfterTurningTheGlobe() throws {
    let app = launch([], detent: "peek")
    let back = app.buttons["回到原来的视角"]
    sleep(3)
    XCTAssertFalse(back.exists)
    let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.4))
    from.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.45)))
    XCTAssert(back.waitForExistence(timeout: 4))
    back.tap()
    sleep(3)
    XCTAssertFalse(back.exists)
  }
}
