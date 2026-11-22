import Foundation

// The shapes `GET /api/app/archive` answers with. They mirror app/lib/data.ts
// and app/lib/trips.ts on the server, which works out trips and homes with the
// same code as the web pages, so both say the same thing about a person.

struct ArchiveResponse: Codable, Sendable {
  var viewer: Viewer?
  var sample: Bool
  var archive: Archive
  var trips: [Trip]
  var homes: [Home]
}

struct Viewer: Codable, Sendable, Hashable {
  var id: String
  var name: String
  var email: String
  var label: String
  var invites: Int
}

struct Person: Codable, Sendable, Hashable {
  var id: String
  var name: String
  var label: String
  var tone: Int
}

struct Link: Codable, Sendable, Hashable, Identifiable {
  var id: String
  var name: String
  var label: String
  var tone: Int
  var together: Int
  var mine: String
  var theirs: String
}

// Names in the three interface languages: Simplified, Traditional, English.
typealias Names = [String]

struct Place: Codable, Sendable, Hashable {
  var city: Names
  var name: Names
  var country: String
  var coordinates: [Double]

  var lngLat: LngLat { LngLat(coordinates[0], coordinates[1]) }
}

struct Archive: Codable, Sendable {
  var owner: Person
  var links: [Link]
  var flights: [Flight]
  var asOf: Double
  var places: [String: Place]
  var carriers: [String: Names]
  var countries: [String: Names]
}

struct Aircraft: Codable, Sendable, Hashable {
  var model: String
  var icao: String
  var registration: String?
  // operated: flown by this airframe; scheduled: the type on the schedule;
  // typical: the type the route usually sees.
  var source: String
  var body: String
}

struct Operation: Codable, Sendable, Hashable {
  var airline: String
  var flight: String
  var source: String
}

// Local times are "HH:MM" at each airport, empty when the source did not say.
// departAt / arriveAt are instants in ms; arriveAt is present only on flights
// still ahead or landed in the last few days.
struct Flight: Codable, Sendable, Hashable, Identifiable {
  var id: String
  var date: String
  var year: Int
  var airline: String
  var flight: String
  var origin: String
  var destination: String
  var depart: String
  var arrive: String
  var arrivalDayOffset: Int
  var durationMinutes: Int
  var timeSource: String
  var km: Double
  var departAt: Double?
  var arriveAt: Double?
  var aircraft: Aircraft?
  var operation: Operation?
  var seat: String?
  var cabin: String?
  var with: [String]?
  var side: String?

  func hasLanded(at now: Date) -> Bool {
    guard let arriveAt else { return true }
    return arriveAt <= now.timeIntervalSince1970 * 1000
  }

  func isAirborne(at now: Date) -> Bool {
    guard !hasLanded(at: now), let departAt else { return false }
    return departAt <= now.timeIntervalSince1970 * 1000
  }

  // Share of the way flown, 0 before take-off and 1 once landed.
  func progress(at now: Date) -> Double {
    guard let departAt, let arriveAt else { return hasLanded(at: now) ? 1 : 0 }
    let t = now.timeIntervalSince1970 * 1000
    return min(1, max(0, (t - departAt) / max(1, arriveAt - departAt)))
  }
}

struct Gap: Codable, Sendable, Hashable {
  var at: String
  var to: String
  var nights: Int
  var minutes: Int?
  // connection: on within half a day; stay: longer; ground: left from another city.
  var kind: String
}

struct Trip: Codable, Sendable, Hashable, Identifiable {
  var id: String
  var flightIds: [String]
  var origin: String
  var home: String
  var homeAfter: String
  var stays: [String]
  var destination: String
  var gaps: [Gap]
  var start: String
  var end: String
  var nights: Int
  var km: Double
  var minutes: Int
  // round, move, outbound, return, oneway
  var kind: String
  var year: Int
}

struct Home: Codable, Sendable, Hashable {
  var code: String
  var from: String
  var to: String?
  var nights: Int
}
