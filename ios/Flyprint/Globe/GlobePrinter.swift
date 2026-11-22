import MetalKit
import UIKit
import simd

// A still of the globe for a card: the same ground, lights and arcs as the
// live globe, drawn once at print size with nothing moving.
struct GlobeStill {
  var arcs: [ArcSpec]
  var dots: [DotSpec] = []
  var camera: OrbitCamera
  // Vertical field of view in radians; narrower than the app's, so the
  // planet reads as photographed from far off rather than through a wide lens.
  var fov: Double = 22 * .pi / 180
  var size: CGSize
  var scale: CGFloat
  // Where on the card the point the camera looks at lands, in points.
  var middle: CGPoint
  // One flight with a direction (light gathering toward where it went), or many without.
  var directed = false
  var glow: Float = 5
  var glowGain: Float = 0.2
  var rim: Float = 0.42
  var lights: Float = 0.45
  // Land a step lighter than on screen, so a coast survives a chat app's compression.
  var land = SIMD3<Float>(hex: 0x1F2731)
  var shore: Float = 0.42
  var border: Float = 0.1

  var pixels: (width: Int, height: Int) { (Int((size.width * scale).rounded()), Int((size.height * scale).rounded())) }

  var matrix: simd_float4x4 {
    let aspect = Float(size.width / size.height)
    let eye = camera.eye
    let eyeF = SIMD3<Float>(Float(eye.x), Float(eye.y), Float(eye.z))
    let near = Float(max(0.005, camera.distance - 1.6)), far = Float(camera.distance + 1.2)
    let projection = perspectiveMatrix(fovy: Float(fov), aspect: aspect, near: near, far: far)
    var offset = matrix_identity_float4x4
    offset.columns.3 = SIMD4(Float(2 * middle.x / size.width - 1), Float(1 - 2 * middle.y / size.height), 0, 1)
    return offset * projection * lookAtMatrix(eye: eyeF, center: .zero, up: SIMD3(0, 1, 0))
  }

  // Where a place lands on the card, in points; nil when the planet hides it.
  func project(_ place: LngLat, lift: Double = 0.001) -> CGPoint? { project(toVector(place) * (1 + lift)) }

  func project(_ v: SIMD3<Double>) -> CGPoint? {
    let p = SIMD3<Float>(Float(v.x), Float(v.y), Float(v.z))
    let eye = camera.eye
    if sphereHides(p, from: SIMD3(Float(eye.x), Float(eye.y), Float(eye.z))) { return nil }
    let clip = matrix * SIMD4(p, 1)
    guard clip.w > 0 else { return nil }
    return CGPoint(x: CGFloat((clip.x / clip.w + 1) / 2) * size.width, y: CGFloat((1 - clip.y / clip.w) / 2) * size.height)
  }

  // The radius of the planet's disc on the card, in points.
  var discRadius: CGFloat {
    let d = camera.distance
    let angle = asin(1 / d)
    return CGFloat(tan(angle) / tan(fov / 2)) * size.height / 2
  }
}

enum GlobePrinter {
  static func print(_ still: GlobeStill) async -> CGImage? {
    guard let kit = GlobeKit.shared else { return nil }
    await kit.ready()
    let (width, height) = still.pixels
    let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: GlobeKit.pixelFormat, width: width, height: height, mipmapped: false)
    descriptor.usage = [.renderTarget, .shaderRead]
    descriptor.storageMode = .shared
    guard let target = kit.device.makeTexture(descriptor: descriptor),
          let light = kit.lightTarget(width, height, reusing: nil),
          let buffer = kit.queue.makeCommandBuffer() else { return nil }
    let pass = MTLRenderPassDescriptor()
    pass.colorAttachments[0].texture = target
    pass.colorAttachments[0].loadAction = .clear
    pass.colorAttachments[0].clearColor = MTLClearColor(red: Double(Palette.space.x), green: Double(Palette.space.y), blue: Double(Palette.space.z), alpha: 1)
    pass.colorAttachments[0].storeAction = .store
    let matrix = still.matrix
    let eye = still.camera.eye
    let frame = FrameUniforms(viewProj: matrix, inverseViewProj: matrix.inverse,
                              camera: SIMD4(Float(eye.x), Float(eye.y), Float(eye.z), Float(still.camera.distance)),
                              viewport: SIMD4(Float(width), Float(height), Float(still.scale), 0))
    let batch = kit.build(still.arcs, style: still.directed ? .focus : .base)
    let look = ArcLook(alpha: 1, glow: still.glow, glowGain: still.glowGain, additive: 0.55, pulse: 0, reveal: 1,
                       limb: still.directed ? 0.35 : 1, widthScale: 1, directed: still.directed ? 1 : 0, clock: 0)
    let dots = kit.dots(still.dots)
    kit.encode(buffer, pass: pass, light: light, frame: frame, ground: GlobeKit.ground(rim: still.rim, land: still.land, shore: still.shore, border: still.border, soften: 0.9),
               arcs: [(batch, look)], dots: dots.buffer, dotCount: dots.count, worldLights: still.lights)
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      buffer.addCompletedHandler { @Sendable _ in done.resume() }
      buffer.commit()
    }
    let rowBytes = width * 4
    var bytes = [UInt8](repeating: 0, count: rowBytes * height)
    target.getBytes(&bytes, bytesPerRow: rowBytes, from: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0)
    guard let provider = CGDataProvider(data: Data(bytes) as CFData) else { return nil }
    return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: rowBytes,
                   space: CGColorSpace(name: CGColorSpace.sRGB)!,
                   bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue),
                   provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
  }
}

// MARK: Framing

extension GlobeStill {
  // Looks at a set of flights so that as much of their length as possible is
  // in view: a region close up when it fits on one face of the planet, else
  // the whole disc turned to the side where most of the flying was.
  static func framing(_ arcs: [ArcSpec], size: CGSize, scale: CGFloat, middle: CGPoint, reach: CGFloat, fov: Double = 22 * .pi / 180) -> OrbitCamera {
    var points: [LngLat] = []
    var weighted: [(SIMD3<Double>, Double)] = []
    for arc in arcs {
      let path = arcPath(arc.from, arc.to, bow: arc.bow)
      guard path.count > 1 else { continue }
      let step = max(1, path.count / 16)
      let length = acos(min(1, max(-1, simd_dot(simd_normalize(path[0]), simd_normalize(path[path.count - 1])))))
      for index in stride(from: 0, to: path.count, by: step) {
        let unit = simd_normalize(path[index])
        points.append(fromVector(unit))
        weighted.append((unit, length / Double(path.count / step + 1)))
      }
      points.append(fromVector(simd_normalize(path[path.count - 1])))
    }
    let half = tan(fov / 2) * Double(reach) / Double(size.height / 2)
    guard let cap = enclosingCap(points) else { return OrbitCamera(center: LngLat(110, 25), distance: sqrt(1 + 1 / (half * half))) }
    let whole = sqrt(1 + 1 / (half * half))
    if cap.radius < 1.12 {
      let radius = min(cap.radius * 1.06 + 0.03 + liftOf(cap.radius * 2) * 0.5, .pi / 2)
      var center = cap.center
      center.lat = max(-70, min(75, center.lat))
      // No nearer than where the ground's own detail still holds: closer, the
      // coast is a few texels magnified into steps.
      let nearest = 1.6
      var camera = OrbitCamera(center: center, distance: max(nearest, min(whole, cos(radius) + sin(radius) / half)))
      // Then fit what is actually drawn, arcs at their height included, to the
      // band left for it, with room at the sides for the names.
      let lifted = arcs.flatMap { arc in arcPath(arc.from, arc.to, bow: arc.bow) }
      // Names sit beside or over the ends, so keep clear of the band's edges.
      let room = CGSize(width: size.width - 120, height: reach * 2 - 36)
      for _ in 0..<5 {
        let trial = GlobeStill(arcs: [], camera: camera, fov: fov, size: size, scale: scale, middle: middle)
        let projected = lifted.compactMap(trial.project)
        guard let minX = projected.map(\.x).min(), let maxX = projected.map(\.x).max(),
              let minY = projected.map(\.y).min(), let maxY = projected.map(\.y).max() else { break }
        let k = min(room.width / max(1, maxX - minX), room.height / max(1, maxY - minY))
        if abs(k - 1) < 0.03 { break }
        camera.distance = max(nearest, min(whole, 1 + (camera.distance - 1) / Double(k)))
      }
      return camera
    }
    // Too wide for one face: of every way the planet could face, the one that
    // shows the most of the year's flying, nudged toward where most of it was.
    let mean = simd_normalize(weighted.reduce(SIMD3<Double>.zero) { $0 + $1.0 * $1.1 } + SIMD3(0, 1e-6, 0))
    let horizon = 1 / whole
    var best: (center: SIMD3<Double>, score: Double) = (mean, -1)
    for lat in stride(from: -50.0, through: 72.0, by: 3) {
      for lng in stride(from: -180.0, to: 180.0, by: 3) {
        let c = toVector(LngLat(lng, lat))
        var seen = 0.0
        for (p, w) in weighted where simd_dot(p, c) > horizon + 0.04 { seen += w }
        let score = seen + 0.02 * simd_dot(c, mean)
        if score > best.score { best = (c, score) }
      }
    }
    return OrbitCamera(center: fromVector(best.center), distance: whole)
  }
}
