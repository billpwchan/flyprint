import Foundation

// The barcode on a boarding pass (IATA BCBP, Resolution 792): carrier,
// flight, the two airports, the day of the year, compartment and seat for
// each leg. It holds no year, so the year comes from the pass's issue date
// when it has one, else from the nearest such day to today.
struct BoardingPass: Equatable {
  struct Leg: Equatable {
    var carrier: String
    var number: String
    var origin: String
    var destination: String
    var date: String      // yyyy-MM-dd
    var cabin: String     // first, business, premium, economy or empty
    var seat: String
    var flight: String { carrier + number }
  }
  var passenger: String
  var legs: [Leg]
  // Whether the pass said which year (its issue date); else the date is the nearest guess.
  var yearKnown: Bool

  static func read(_ payload: String, today: Date = Date()) -> BoardingPass? {
    let text = Array(payload)
    guard text.count >= 60, text[0] == "M", let count = Int(String(text[1])), count >= 1, count <= 4 else { return nil }
    func slice(_ start: Int, _ length: Int) -> String? {
      guard start >= 0, start + length <= text.count else { return nil }
      return String(text[start..<start + length])
    }
    guard let name = slice(2, 20) else { return nil }
    var legs: [(Leg, Int)] = []
    var cursor = 23
    var issue: (digit: Int, day: Int)?
    for index in 0..<count {
      guard let from = slice(cursor + 7, 3), let to = slice(cursor + 10, 3), let carrier = slice(cursor + 13, 3),
            let number = slice(cursor + 16, 5), let day = slice(cursor + 21, 3).flatMap({ Int($0.trimmingCharacters(in: .whitespaces)) }),
            let compartment = slice(cursor + 24, 1), let seat = slice(cursor + 25, 4),
            let size = slice(cursor + 35, 2).flatMap({ Int($0, radix: 16) }) else { return nil }
      let origin = from.trimmingCharacters(in: .whitespaces), destination = to.trimmingCharacters(in: .whitespaces)
      guard origin.count == 3, destination.count == 3, origin.allSatisfy(\.isLetter), destination.allSatisfy(\.isLetter), (1...366).contains(day) else { return nil }
      // The first leg's conditional part may carry the pass's issue date as Y + day of year.
      if index == 0, size > 0, let conditional = slice(cursor + 37, size), conditional.first == ">" {
        let chars = Array(conditional)
        if chars.count >= 4, let unique = Int(String(chars[2...3]), radix: 16), chars.count >= 4 + unique, unique >= 7 {
          let field = String(chars[(4 + 3)..<(4 + 7)])
          if let digit = Int(String(field.prefix(1))), let issued = Int(field.dropFirst()), (1...366).contains(issued) { issue = (digit, issued) }
        }
      }
      let leg = Leg(carrier: carrier.trimmingCharacters(in: .whitespaces),
                    number: String(number.trimmingCharacters(in: .whitespaces).drop { $0 == "0" }),
                    origin: origin, destination: destination, date: "",
                    cabin: cabinOf(compartment), seat: seatOf(seat))
      legs.append((leg, day))
      cursor += 37 + size
    }
    let calendar = Calendar(identifier: .gregorian)
    var utc = calendar
    utc.timeZone = TimeZone(identifier: "UTC")!
    let year = utc.component(.year, from: today)
    let resolved = legs.map { leg, day -> Leg in
      var leg = leg
      leg.date = dateOf(day: day, issue: issue, year: year, todayDay: utc.ordinality(of: .day, in: .year, for: today) ?? 1, today: today, calendar: utc)
      return leg
    }
    return BoardingPass(passenger: name.trimmingCharacters(in: .whitespaces), legs: resolved, yearKnown: issue != nil)
  }

  private static func dateOf(day: Int, issue: (digit: Int, day: Int)?, year: Int, todayDay: Int, today: Date, calendar: Calendar) -> String {
    func date(_ year: Int) -> Date? {
      var components = DateComponents(year: year, month: 1, day: 1)
      components.timeZone = calendar.timeZone
      return calendar.date(from: components).flatMap { calendar.date(byAdding: .day, value: day - 1, to: $0) }
    }
    var chosen: Date?
    if let issue {
      // The latest year ending in the issue digit in which that day has come;
      // a flight whose day comes before the issue day is in the year after.
      var issued = year
      while issued % 10 != issue.digit { issued -= 1 }
      if issued == year && issue.day > todayDay + 1 { issued -= 10 }
      chosen = date(day < issue.day ? issued + 1 : issued)
    } else {
      // The nearest such day: a pass is scanned close to its flight, or long after it.
      // More than 60 days ahead, it is more likely the same day a year before.
      let nearest = [year - 1, year, year + 1].compactMap { candidate in date(candidate).map { (candidate, $0) } }
        .min { abs($0.1.timeIntervalSince(today)) < abs($1.1.timeIntervalSince(today)) }
      if let (found, candidate) = nearest {
        chosen = candidate.timeIntervalSince(today) > 60 * 86_400 ? date(found - 1) ?? candidate : candidate
      }
    }
    guard let chosen else { return "" }
    let parts = calendar.dateComponents([.year, .month, .day], from: chosen)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  // Compartment letters as most airlines use them.
  private static func cabinOf(_ code: String) -> String {
    switch code.uppercased() {
    // Many airlines print the booking class here; letters that mean
    // different cabins at different airlines are left for the reader.
    case "F", "A": "first"
    case "J", "C", "D", "I", "Z": "business"
    case "W": "premium"
    case "", " ", "P", "R", "E": ""
    default: "economy"
    }
  }

  // "012A" → "12A"; "INF " and blanks are no seat.
  private static func seatOf(_ raw: String) -> String {
    let value = raw.trimmingCharacters(in: .whitespaces)
    guard let row = value.prefix(while: \.isNumber).nilIfEmpty, let number = Int(row) else { return "" }
    let letter = value.drop { $0.isNumber }
    return letter.count == 1 && letter.first!.isLetter ? "\(number)\(letter)" : ""
  }
}

private extension Substring {
  var nilIfEmpty: Substring? { isEmpty ? nil : self }
}
