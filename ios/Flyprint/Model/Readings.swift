import Foundation

// What the pages read off the archive: places as cities, a year's shape, the
// records. Counts are of flights flown; a booked flight counts once it lands.

extension Store {
  private func chronological(_ flights: [Flight]) -> [Flight] {
    flights.sorted { ($0.date, $0.depart) < ($1.date, $1.depart) }
  }

  var allInOrder: [Flight] { chronological(archive.flights) }
  var flown: [Flight] { chronological(archive.flights.filter { $0.hasLanded(at: now) }) }

  // MARK: Cities

  func airports(in metro: String) -> [String] {
    let codes = Set(archive.flights.flatMap { [$0.origin, $0.destination] }).filter { metroOf($0) == metro }
    return codes.sorted { a, b in uses(a) > uses(b) }
  }

  private func uses(_ code: String) -> Int { archive.flights.filter { $0.origin == code || $0.destination == code }.count }

  // A metro's name, through its busiest airport.
  func cityName(_ metro: String) -> String { airports(in: metro).first.map(city) ?? city(metro) }
  func anchor(_ metro: String) -> String { airports(in: metro).first ?? metro }

  struct CityReading {
    var flights: [Flight]
    var trips: [Trip]
    var nights: Int
    var first: Flight?
    var lived: [Home]
    var routes: [(metro: String, count: Int)]
    var airlines: [(code: String, count: Int)]
  }

  func reading(of metro: String) -> CityReading {
    let touching = flown.filter { metroOf($0.origin) == metro || metroOf($0.destination) == metro }
    let tripsHere = trips.filter { trip in
      metroOf(trip.destination) == metro || trip.stays.contains { metroOf($0) == metro }
    }.filter { metroOf($0.home) != metro }.sorted { $0.start > $1.start }
    let nights = trips.flatMap(\.gaps).filter { $0.kind == "stay" && metroOf($0.at) == metro }.reduce(0) { $0 + $1.nights }
    var routes: [String: Int] = [:]
    for flight in touching {
      let other = metroOf(flight.origin) == metro ? metroOf(flight.destination) : metroOf(flight.origin)
      routes[other, default: 0] += 1
    }
    var airlines: [String: Int] = [:]
    for flight in touching { airlines[flight.airline, default: 0] += 1 }
    return CityReading(
      flights: touching,
      trips: tripsHere,
      nights: nights,
      first: touching.first,
      lived: response.homes.filter { metroOf($0.code) == metro },
      routes: routes.map { ($0.key, $0.value) }.sorted { $0.1 > $1.1 || ($0.1 == $1.1 && $0.0 < $1.0) },
      airlines: airlines.map { ($0.key, $0.value) }.sorted { $0.1 > $1.1 }
    )
  }

  // MARK: A flight among the others

  // Every flight between the same two cities, either way, oldest first.
  func route(of flight: Flight) -> [Flight] {
    let pair = Set([metroOf(flight.origin), metroOf(flight.destination)])
    return allInOrder.filter { Set([metroOf($0.origin), metroOf($0.destination)]) == pair }
  }

  // Which flight this is in the person's life: 154 for their 154th.
  func ordinal(of flight: Flight) -> Int? {
    guard flight.hasLanded(at: now) else { return nil }
    return flown.firstIndex { $0.id == flight.id }.map { $0 + 1 }
  }

  // MARK: Years

  func months(of year: Int) -> [Int] {
    var counts = Array(repeating: 0, count: 12)
    for flight in landed(in: year) {
      if let month = Int(flight.date.dropFirst(5).prefix(2)), (1...12).contains(month) { counts[month - 1] += 1 }
    }
    return counts
  }

  // Countries reached for the first time, in the order they were reached.
  func firstCountries(in year: Int? = nil) -> [(iso: String, date: String)] {
    var seen = Set<String>()
    var firsts: [(String, String)] = []
    for flight in flown {
      for code in [flight.origin, flight.destination] {
        guard let iso = place(code)?.country, !seen.contains(iso) else { continue }
        seen.insert(iso)
        firsts.append((iso, flight.date))
      }
    }
    return firsts.filter { year == nil || $0.1.hasPrefix(String(year!)) }
  }

  func firstCities(in year: Int) -> [String] {
    var seen = Set<String>()
    var firsts: [String] = []
    for flight in flown {
      for code in [flight.origin, flight.destination] {
        let metro = metroOf(code)
        guard !seen.contains(metro) else { continue }
        seen.insert(metro)
        if flight.year == year { firsts.append(metro) }
      }
    }
    return firsts
  }

  // MARK: Records

  func types(in flights: [Flight]) -> [(icao: String, model: String, count: Int)] {
    var counts: [String: (String, Int)] = [:]
    for flight in flights {
      guard let aircraft = flight.aircraft, !aircraft.icao.isEmpty else { continue }
      let icao = aircraft.icao.uppercased()
      counts[icao] = (counts[icao]?.0 ?? aircraft.model, (counts[icao]?.1 ?? 0) + 1)
    }
    return counts.map { ($0.key, $0.value.0, $0.value.1) }.sorted { $0.2 > $1.2 || ($0.2 == $1.2 && $0.0 < $1.0) }
  }

  func airlines(in flights: [Flight]) -> [(code: String, count: Int)] {
    var counts: [String: Int] = [:]
    for flight in flights where !flight.airline.isEmpty { counts[flight.airline, default: 0] += 1 }
    return counts.map { ($0.key, $0.value) }.sorted { $0.1 > $1.1 || ($0.1 == $1.1 && $0.0 < $1.0) }
  }

  func countries(in flights: [Flight]) -> Set<String> {
    Set(flights.flatMap { [place($0.origin)?.country, place($0.destination)?.country] }.compactMap { $0 })
  }
}

// Around the Earth once, and out to the Moon, for scale.
let equatorKm = 40_075.0
let moonKm = 384_400.0
