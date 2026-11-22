import Foundation
import SwiftUI
import Testing
import simd
@testable import Flyprint

@MainActor
struct GeometryTests {
  @Test func vectorsRoundTrip() {
    for point in [LngLat(114.17, 22.32), LngLat(-73.78, 40.64), LngLat(151.18, -33.94)] {
      let back = fromVector(toVector(point))
      #expect(abs(back.lng - point.lng) < 1e-9 && abs(back.lat - point.lat) < 1e-9)
    }
  }

  // Out and back between the same two airports bow to opposite sides.
  @Test func outAndBackFormALens() {
    let hkg = LngLat(113.91, 22.31), sin = LngLat(103.99, 1.36)
    let out = bowedTrack(hkg, sin, bow: 0.07), back = bowedTrack(sin, hkg, bow: 0.07)
    let middleOut = out[out.count / 2], middleBack = back[back.count / 2]
    #expect(simd_distance(middleOut, middleBack) > 0.01)
    #expect(simd_distance(out.first!, toVector(hkg)) < 1e-9 && simd_distance(out.last!, toVector(sin)) < 1e-9)
  }

  @Test func capHoldsEveryPoint() throws {
    let points = [LngLat(121.8, 31.1), LngLat(4.76, 52.3), LngLat(103.9, 1.36)]
    let cap = try #require(enclosingCap(points))
    for point in points { #expect(angularDistance(cap.center, point) <= cap.radius + 1e-6) }
  }
}

@MainActor
struct ArchiveTests {
  // The bundled sample decodes, and every trip leg is a flight in it.
  @Test func sampleIsWhole() {
    let store = Store(restoring: false)
    #expect(store.archive.flights.count > 100)
    #expect(!store.trips.isEmpty)
    for trip in store.trips { #expect(store.legs(of: trip).count == trip.flightIds.count) }
    #expect(store.archive.flights.allSatisfy { store.position($0.origin) != nil && store.position($0.destination) != nil })
  }

  @Test func wordsFollowTheLanguage() {
    #expect(Format.duration(minutes: 185, .hans) == "3 小时 5 分")
    #expect(Format.duration(minutes: 185, .en) == "3 h 5 min")
    #expect(Format.date("2026-03-14", .en) == "14 Mar 2026")
  }
}

// The flight page says which side the sun rises or sets on; the port must give
// what the web's daylight.ts gives (reference values computed from it).
@MainActor
struct SkyTests {
  private func utc(_ y: Int, _ m: Int, _ d: Int, _ h: Int, _ min: Int) -> Double {
    var parts = DateComponents(); parts.year = y; parts.month = m; parts.day = d; parts.hour = h; parts.minute = min
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar.date(from: parts)!.timeIntervalSince1970 * 1000
  }

  @Test func matchesTheWeb() {
    let cases: [(String, LngLat, LngLat, Double, Int, [(SkyEvent.Kind, Int, Bool)], [Double])] = [
      ("MUC-AMS", LngLat(11.786, 48.354), LngLat(4.764, 52.308), utc(2026, 10, 13, 16, 20), 90, [(.sunset, 39, true)], [1.305, 1.728, -0.738, -3.689, -8.961]),
      ("LHR-HKG", LngLat(-0.4543, 51.47), LngLat(113.915, 22.309), utc(2025, 3, 9, 21, 30), 760, [(.sunrise, 288, true)], [-31.073, -22.089, 22.737, 46.912, 5.002]),
      ("HKG-LHR", LngLat(113.915, 22.309), LngLat(-0.4543, 51.47), utc(2025, 3, 2, 15, 55), 795, [], [-70.846, -47.029, -25.115, -16.685, -14.322]),
      ("SFO-SIN", LngLat(-122.375, 37.619), LngLat(103.994, 1.364), utc(2025, 6, 21, 6, 0), 1020, [(.sunrise, 993, true)], [-20.754, -14.623, -20.343, -20.702, 0.001]),
    ]
    for (name, from, to, at, minutes, events, light) in cases {
      let sky = skyAlong(from: from, to: to, departAt: at, minutes: minutes)
      #expect(sky.events.count == events.count, "\(name)")
      for (event, expected) in zip(sky.events, events) {
        #expect(event.kind == expected.0 && event.minute == expected.1 && event.left == expected.2, "\(name)")
      }
      for (index, degrees) in zip([0, 18, 36, 54, 72], light) {
        #expect(abs(sky.light[index].degrees - degrees) < 0.01, "\(name) sample \(index): \(sky.light[index].degrees)")
      }
    }
  }
}

// City dots land inside their country's outline box.
@MainActor
struct CountryTests {
  @Test func citiesSitInsideTheirCountry() throws {
    for (iso, city) in [("JP", LngLat(139.69, 35.69)), ("NL", LngLat(4.90, 52.37)), ("CN", LngLat(104.07, 30.57)), ("GB", LngLat(-0.13, 51.51))] {
      let shape = try #require(Countries.shape(iso), "\(iso)")
      let point = try #require(Countries.place(iso, city), "\(iso)")
      #expect(shape.box.insetBy(dx: -1, dy: -1).contains(point), "\(iso) \(point) in \(shape.box)")
      #expect(shape.path.boundingRect.insetBy(dx: -2, dy: -2).contains(point), "\(iso)")
    }
  }
}

// A trip card's title fits the card: smaller first, then two lines at a break.
struct CardTitleTests {
  @Test @MainActor func longTitlesWrapInsteadOfRunningOff() {
    #expect(TripPoster.titleLines("Munich").lines == ["Munich"])
    #expect(TripPoster.titleLines("Munich").size == 40)
    let three = TripPoster.titleLines("Honolulu · New York · San Francisco")
    #expect(three.lines == ["Honolulu · New York", "San Francisco"])
    #expect(three.size >= 24 && three.size <= 32)
    #expect(TripPoster.titleLines("Moved to San Francisco").lines.count == 1)
    #expect(TripPoster.titleLines("Moved to Santa Cruz de la Sierra").lines == ["Moved to", "Santa Cruz de la Sierra"])
    let long = TripPoster.titleLines("Santa Cruz de la Sierra")
    #expect(long.lines.count <= 2 && long.size >= 24)
  }
}

@Suite struct BoardingPassTests {
  private func day(_ iso: String) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let parts = iso.split(separator: "-").map { Int($0)! }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
  }

  private static let example = "M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100"

  // Resolution 792's own example: one leg, no conditional items.
  @Test func readsTheStandardExample() throws {
    let pass = try #require(BoardingPass.read(Self.example, today: day("2026-11-20")))
    #expect(pass.passenger == "DESMARAIS/LUC")
    #expect(!pass.yearKnown)
    #expect(pass.legs == [.init(carrier: "AC", number: "834", origin: "YUL", destination: "FRA", date: "2026-11-22", cabin: "business", seat: "1A")])
  }

  // Day 326 seen in spring is last November's, not the coming one.
  @Test func aPassWithoutAYearIsTheNearestPastDay() throws {
    let pass = try #require(BoardingPass.read(Self.example, today: day("2027-03-01")))
    #expect(pass.legs.first?.date == "2026-11-22")
  }

  // Day 60 seen in November: next March is over 60 days off, so it is the
  // March just gone, not the one two years back.
  @Test func aFarDayAcrossNewYearIsTheYearBefore() throws {
    let pass = try #require(BoardingPass.read(Self.example.replacingOccurrences(of: " 326J", with: " 060J"), today: day("2026-11-20")))
    #expect(pass.legs.first?.date == "2026-03-01")
  }

  // Two legs; the first carries the issue date 2019 day 180 as "9180".
  @Test func twoLegsWithAnIssueDate() throws {
    let header = "M2" + "LIN/THEO".padding(toLength: 20, withPad: " ", startingAt: 0) + "E"
    let conditional = ">5" + "07" + "0OO" + "9180"
    let first = "XYZ789 " + "HKGTPE" + "CX " + "0400 " + "185" + "Y" + "032K" + "0012 " + "1" + String(format: "%02X", conditional.count) + conditional
    let second = "XYZ789 " + "TPENRT" + "BR " + "0198 " + "186" + "C" + "004A" + "0013 " + "1" + "00"
    let pass = try #require(BoardingPass.read(header + first + second, today: day("2026-11-20")))
    #expect(pass.yearKnown)
    #expect(pass.legs.map(\.flight) == ["CX400", "BR198"])
    #expect(pass.legs.map(\.date) == ["2019-07-04", "2019-07-05"])
    #expect(pass.legs.map(\.cabin) == ["economy", "business"])
    #expect(pass.legs.map(\.seat) == ["32K", "4A"])
  }

  @Test func rejectsOtherBarcodes() {
    #expect(BoardingPass.read("https://example.com/not-a-pass") == nil)
    #expect(BoardingPass.read(String(repeating: "M1", count: 40)) == nil)
  }
}
