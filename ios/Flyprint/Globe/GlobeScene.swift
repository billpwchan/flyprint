import SwiftUI
import simd

// What the globe should show, described by the pages. The renderer diffs it:
// arcs are rebuilt only when their set changes, the camera moves only when the
// framing changes, and the reveal replays only when its key changes.

struct ArcSpec: Equatable, Sendable {
  var id: String
  var from: LngLat
  var to: LngLat
  var bow: Double
  var color: SIMD3<Float>
  var alpha: Float = 1
  var width: Float = 1
  // Share of the flight flown: 1 for a flight that has landed, 0 before take-off.
  var plan: Float = 1
}

struct DotSpec: Equatable, Sendable {
  var code: String
  var at: LngLat
  var radius: Float
  var alpha: Float
}

struct LabelSpec: Equatable, Sendable {
  var code: String
  var text: String
  var at: LngLat
  // Higher places first when names would collide; a name of what is open
  // always shows, the rest only where there is room.
  var rank: Int = 0
  var strong = true
}

enum GlobePick: Equatable, Sendable {
  case flight(String)
  case place(String)
}

enum Framing: Equatable, Sendable {
  case world(center: LngLat)
  case points([LngLat])
}

struct GlobeScene: Equatable, Sendable {
  var base: [ArcSpec] = []
  var focus: [ArcSpec] = []
  var dots: [DotSpec] = []
  var labels: [LabelSpec] = []
  var framing: Framing = .world(center: LngLat(110, 25))
  // Change it to draw the arcs in again, oldest first.
  var revealKey: Int = 0
  // Change it to fly back to the framing after the reader turned the globe.
  var recentreKey: Int = 0
  // The moment whose daylight the Earth shows (ms since 1970); nil is now.
  var sunAt: Double?
}

enum Palette {
  static let space = SIMD3<Float>(hex: 0x08090B)
  static let ocean = SIMD3<Float>(hex: 0x0B0F14)
  static let land = SIMD3<Float>(hex: 0x1A2129)
  static let shore = SIMD3<Float>(150, 182, 224) / 255
  static let tones: [SIMD3<Float>] = [0x87AEDD, 0xDFA58B, 0x9CCBA3, 0xB9A5E4, 0xE59CB5, 0x79C6CF].map(SIMD3<Float>.init(hex:))
  static let together = SIMD3<Float>(hex: 0xF3CF7F)
  static func tone(_ index: Int) -> SIMD3<Float> { tones[((index % tones.count) + tones.count) % tones.count] }

  static func color(_ value: SIMD3<Float>, opacity: Double = 1) -> Color {
    Color(red: Double(value.x), green: Double(value.y), blue: Double(value.z), opacity: opacity)
  }
}

extension SIMD3 where Scalar == Float {
  nonisolated init(hex: Int) {
    self.init(Float((hex >> 16) & 0xFF) / 255, Float((hex >> 8) & 0xFF) / 255, Float(hex & 0xFF) / 255)
  }
}
