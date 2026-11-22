import SwiftUI

// An airliner's side view from the same measured outlines the web draws
// (scripts/build-ios-aircraft.mjs): light-drawn line art on the dark sheet,
// strokes one point wide at any size.

private struct AircraftDrawing: Decodable {
  var maker: String
  var name: String
  var length: Double
  var top: Double
  var bottom: Double
  var half: Double
  var parts: [[String]]
}

enum Fleet {
  private static let drawings: [String: AircraftDrawing] = {
    guard let url = Bundle.main.url(forResource: "aircraft", withExtension: "json"),
          let data = try? Data(contentsOf: url) else { return [:] }
    return (try? JSONDecoder().decode([String: AircraftDrawing].self, from: data)) ?? [:]
  }()
  private static var paths: [String: [(kind: String, path: Path)]] = [:]

  static func canDraw(_ icao: String) -> Bool { drawings[icao.uppercased()] != nil }

  static func length(_ icao: String) -> Double? { drawings[icao.uppercased()]?.length }

  fileprivate static func drawing(_ icao: String) -> (AircraftDrawing, [(kind: String, path: Path)])? {
    let key = icao.uppercased()
    guard let drawing = drawings[key] else { return nil }
    if let parsed = paths[key] { return (drawing, parsed) }
    let parsed = drawing.parts.compactMap { part in part.count == 2 ? (kind: part[0], path: svgPath(part[1])) : nil }
    paths[key] = parsed
    return (drawing, parsed)
  }

  // 空客 A320 / 空中巴士 A320 / Airbus A320
  static func localModel(_ model: String, _ lang: Lang) -> String {
    for (maker, names) in [("Airbus", ("空客", "空中巴士", "Airbus")), ("Boeing", ("波音", "波音", "Boeing"))] where model.hasPrefix(maker + " ") {
      return lang.t(names.0, names.1, names.2) + model.dropFirst(maker.count)
    }
    return model
  }
}

// Absolute M, L, C, Q and Z: the only commands the outlines use.
func svgPath(_ d: String) -> Path {
  var path = Path()
  var numbers: [Double] = []
  var command: Character = "M"
  func flush() {
    switch command {
    case "M":
      var i = 0
      while i + 1 < numbers.count {
        let p = CGPoint(x: numbers[i], y: numbers[i + 1])
        if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        i += 2
      }
    case "L":
      stride(from: 0, to: numbers.count - 1, by: 2).forEach { path.addLine(to: CGPoint(x: numbers[$0], y: numbers[$0 + 1])) }
    case "C":
      stride(from: 0, to: numbers.count - 5, by: 6).forEach { i in
        path.addCurve(to: CGPoint(x: numbers[i + 4], y: numbers[i + 5]),
                      control1: CGPoint(x: numbers[i], y: numbers[i + 1]), control2: CGPoint(x: numbers[i + 2], y: numbers[i + 3]))
      }
    case "Q":
      stride(from: 0, to: numbers.count - 3, by: 4).forEach { i in
        path.addQuadCurve(to: CGPoint(x: numbers[i + 2], y: numbers[i + 3]), control: CGPoint(x: numbers[i], y: numbers[i + 1]))
      }
    case "Z":
      path.closeSubpath()
    default:
      break
    }
    numbers.removeAll(keepingCapacity: true)
  }
  var token = ""
  func number() { if let value = Double(token) { numbers.append(value) }; token = "" }
  for character in d {
    if character.isLetter && character != "e" {
      number(); flush(); command = character
    } else if character == "," || character == " " {
      number()
    } else if character == "-" && !token.isEmpty && token.last != "e" {
      number(); token = "-"
    } else {
      token.append(character)
    }
  }
  number(); flush()
  return path
}

struct AircraftProfile: View {
  @Environment(Store.self) private var store
  let icao: String
  var tentative = false
  var measured = true

  private let pad = 0.4

  var body: some View {
    if let (drawing, parts) = Fleet.drawing(icao) {
      let width = drawing.length + pad * 2
      let height = drawing.top - drawing.bottom + pad * 2
      VStack(spacing: 8) {
        Canvas { context, size in
          let k = size.width / width
          let place = CGAffineTransform(translationX: pad * k, y: (drawing.top + pad) * k).scaledBy(x: k, y: k)
          let lit = Gradient(colors: [Color(red: 0x1a / 255, green: 0x20 / 255, blue: 0x29 / 255), Color(red: 0x0f / 255, green: 0x12 / 255, blue: 0x17 / 255), Color(red: 0x09 / 255, green: 0x0b / 255, blue: 0x0e / 255)])
          let from = CGPoint(x: 0, y: (-drawing.half + drawing.top + pad) * k), to = CGPoint(x: 0, y: (drawing.half + drawing.top + pad) * k)
          let ink = Color(red: 228 / 255, green: 236 / 255, blue: 247 / 255)
          let stroke = StrokeStyle(lineWidth: 1, lineCap: .round, lineJoin: .round)
          for part in parts {
            let shape = part.path.applying(place)
            switch part.kind {
            case "body": context.fill(shape, with: .linearGradient(lit, startPoint: from, endPoint: to))
            case "line": context.stroke(shape, with: .color(ink.opacity(0.82)), style: stroke)
            case "detail": context.stroke(shape, with: .color(ink.opacity(0.26)), lineWidth: 1)
            case "glass":
              context.fill(shape, with: .color(Color(red: 135 / 255, green: 174 / 255, blue: 221 / 255).opacity(0.2)))
              context.stroke(shape, with: .color(ink.opacity(0.5)), lineWidth: 1)
            case "window": context.fill(shape, with: .color(Color(red: 232 / 255, green: 238 / 255, blue: 246 / 255).opacity(0.42)))
            default: break
            }
          }
        }
        .aspectRatio(width / height, contentMode: .fit)
        // Nose to tail, the figure in a gap in the line.
        if measured {
        GeometryReader { geometry in
          HStack(spacing: 8) {
            tick(leading: true)
            Text(store.lang.t("\(Format.decimal(drawing.length, store.lang)) 米", "\(Format.decimal(drawing.length, store.lang)) 米", "\(Format.decimal(drawing.length, store.lang)) m"))
              .font(.micro)
              .monospacedDigit()
              .foregroundStyle(Ink.tertiary)
            tick(leading: false)
          }
          .padding(.horizontal, geometry.size.width * pad / width)
        }
        .frame(height: 14)
        }
      }
      .opacity(tentative ? 0.5 : 1)
      .accessibilityHidden(true)
    }
  }

  private func tick(leading: Bool) -> some View {
    Rectangle().fill(.white.opacity(0.18)).frame(height: 1)
      .overlay(alignment: leading ? .leading : .trailing) {
        Rectangle().fill(.white.opacity(0.18)).frame(width: 1, height: 7)
      }
  }
}
