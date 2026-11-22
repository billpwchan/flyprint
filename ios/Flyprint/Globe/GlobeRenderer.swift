import MetalKit
import UIKit
import simd

// A value that eases from one number to another over a duration.
private struct Tween {
  var from: Double
  var to: Double
  var start: CFTimeInterval = 0
  var duration: CFTimeInterval = 0

  init(_ value: Double) { from = value; to = value }
  func value(at t: CFTimeInterval) -> Double {
    guard duration > 0 else { return to }
    let k = min(1, max(0, (t - start) / duration))
    let eased = 1 - pow(1 - k, 3)
    return from + (to - from) * eased
  }
  func settled(at t: CFTimeInterval) -> Bool { duration == 0 || t >= start + duration }
  mutating func retarget(_ value: Double, over seconds: CFTimeInterval, at t: CFTimeInterval) {
    from = self.value(at: t); to = value; start = t; duration = seconds
  }
}

// The orbit camera: where on Earth it looks, and how far from the centre it
// is, in globe radii. A move travels on the sphere and rises on long hops.
struct OrbitCamera {
  var center = LngLat(110, 25)
  var distance = 3.6

  var eye: SIMD3<Double> { toVector(center) * distance }
}

final class GlobeRenderer: NSObject, MTKViewDelegate {
  static let verticalFOV = 36.87 * Double.pi / 180

  private let kit: GlobeKit
  private var light: MTLTexture?
  private var base = ArcBatch()
  private var focus = ArcBatch()
  private var dots: MTLBuffer?
  private var dotCount = 0

  private(set) var scene = GlobeScene()
  var insets = UIEdgeInsets.zero {
    didSet { if abs(insets.bottom - oldValue.bottom) > 0.5 || abs(insets.top - oldValue.top) > 0.5 { refit(animated: true) } }
  }
  var onSelect: ((GlobePick) -> Void)?
  // Whether the reader has turned or zoomed the globe away from what the page framed.
  var onDrift: ((Bool) -> Void)?
  private var drifted = false {
    // Told on the next turn of the run loop: frame() runs inside SwiftUI's
    // view update, where changing the caller's state would be dropped.
    didSet {
      guard drifted != oldValue else { return }
      let value = drifted
      DispatchQueue.main.async { [weak self] in self?.onDrift?(value) }
    }
  }
  weak var view: MTKView?

  private(set) var camera = OrbitCamera()
  private var flight: (from: OrbitCamera, to: OrbitCamera, start: CFTimeInterval, duration: CFTimeInterval, rise: Double)?
  private var spin = SIMD2<Double>.zero
  private var touching = false
  private var reveal = Tween(1)
  private var focusAlpha = Tween(0)
  private var labels: [String: UILabel] = [:]
  private var labelAlpha: [String: CGFloat] = [:]
  private var labelClock = CACurrentMediaTime()
  private let started = CACurrentMediaTime()
  private var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

  init?(view: MTKView) {
    guard let kit = GlobeKit.shared else { return nil }
    self.kit = kit
    view.device = kit.device
    view.colorPixelFormat = GlobeKit.pixelFormat
    view.framebufferOnly = true
    view.clearColor = MTLClearColor(red: Double(Palette.space.x), green: Double(Palette.space.y), blue: Double(Palette.space.z), alpha: 1)
    super.init()
    self.view = view
    kit.whenLoaded { [weak self] in
      self?.view?.setNeedsDisplay()
      self?.wake()
    }
  }

  // MARK: Scene

  func apply(_ next: GlobeScene) {
    let now = CACurrentMediaTime()
    let previous = scene
    if next.sunAt != previous.sunAt {
      sunFrom = sun(at: now)
      sunStart = now
      sunSpan = reduceMotion ? 0 : 1.6
    }
    scene = next
    if next.base != previous.base { base = kit.build(next.base, style: .base) }
    if next.focus != previous.focus {
      focus = kit.build(next.focus, style: .focus)
      focusAlpha.retarget(next.focus.isEmpty ? 0 : 1, over: reduceMotion ? 0 : 0.32, at: now)
    }
    if next.dots != previous.dots { (dots, dotCount) = kit.dots(next.dots) }
    if next.revealKey != previous.revealKey && !reduceMotion {
      reveal = Tween(0)
      reveal.retarget(1, over: next.focus.isEmpty ? 2.4 : 1.4, at: now)
    }
    if next.framing != previous.framing || next.recentreKey != previous.recentreKey {
      frame(next.framing, animated: previous.base.isEmpty == false || next.recentreKey != previous.recentreKey)
    }
    if next.labels != previous.labels { syncLabels() }
    wake()
  }

  // MARK: Camera

  // Before the first layout the view has no size; frame for a typical phone until it does.
  private var viewSize: CGSize {
    let size = view?.bounds.size ?? .zero
    return size.width > 0 && size.height > 0 ? size : CGSize(width: 402, height: 874)
  }
  private var framedSize = CGSize.zero

  // The angle off the line of sight that still lands inside the uncovered part of the screen.
  private func reach() -> Double {
    let size = viewSize
    let visibleHeight = max(120, size.height - insets.top - insets.bottom)
    let half = tan(Self.verticalFOV / 2)
    let vertical = atan(half * Double(visibleHeight) / Double(size.height))
    let horizontal = atan(half * Double(size.width - 40) / Double(size.height))
    return min(vertical, horizontal)
  }

  private func worldDistance() -> Double { 1 / sin(reach()) * 1.06 }

  private func target(for framing: Framing) -> OrbitCamera? {
    var target: OrbitCamera
    switch framing {
    case .world(let center):
      target = OrbitCamera(center: center, distance: worldDistance())
    case .points(let points):
      guard let cap = enclosingCap(points) else { return nil }
      // Arcs rise above the ground; leave room for the tallest of them.
      let radius = min(cap.radius * 1.12 + 0.035 + liftOf(cap.radius * 2) * 0.6, .pi / 2)
      var distance = cos(radius) + sin(radius) / tan(reach())
      if radius > 1.25 || distance > worldDistance() { distance = worldDistance() }
      target = OrbitCamera(center: cap.center, distance: max(1.22, distance))
    }
    target.center.lat = max(-70, min(70, target.center.lat))
    return target
  }

  func frame(_ framing: Framing, animated: Bool) {
    guard let target = target(for: framing) else { return }
    drifted = false
    guard animated, !reduceMotion else { camera = target; flight = nil; return }
    let travel = angularDistance(camera.center, target.center)
    flight = (camera, target, CACurrentMediaTime(), 0.75 + 0.35 * min(1, travel / 1.5), max(0, travel * 0.5 - abs(camera.distance - target.distance) * 0.3))
    spin = .zero
  }

  // The uncovered part of the screen changed (the sheet moved, or the first
  // layout arrived): keep looking where the camera looks, at the fitting distance.
  private func refit(animated: Bool) {
    guard !touching, var target = target(for: scene.framing) else { return }
    if case .world = scene.framing { target.center = flight?.to.center ?? camera.center }
    guard animated, !reduceMotion else { camera = target; flight = nil; wake(); return }
    flight = (camera, target, CACurrentMediaTime(), 0.35, 0)
    wake()
  }

  private func step(_ now: CFTimeInterval, dt: Double) -> Bool {
    if let flight {
      let k = min(1, (now - flight.start) / flight.duration)
      let e = k < 0.5 ? 4 * k * k * k : 1 - pow(-2 * k + 2, 3) / 2
      let a = toVector(flight.from.center), b = toVector(flight.to.center)
      let angle = acos(min(1, max(-1, simd_dot(a, b))))
      let center: SIMD3<Double> = angle < 1e-6 ? b : (a * sin((1 - e) * angle) + b * sin(e * angle)) / sin(angle)
      camera.center = fromVector(simd_normalize(center))
      camera.distance = flight.from.distance + (flight.to.distance - flight.from.distance) * e + flight.rise * sin(.pi * e)
      if k >= 1 { self.flight = nil }
      return true
    }
    if !touching && simd_length(spin) > 0.0005 {
      rotate(by: spin * dt)
      spin *= exp(-4.2 * dt)
      return true
    }
    return false
  }

  private var radiansPerPoint: Double {
    (camera.distance - 1) * tan(Self.verticalFOV / 2) / Double(max(1, viewSize.height) / 2)
  }

  private func rotate(by points: SIMD2<Double>) {
    let k = radiansPerPoint * 180 / .pi
    camera.center.lng -= points.x * k / max(0.25, cos(camera.center.lat * .pi / 180))
    camera.center.lat = max(-70, min(70, camera.center.lat + points.y * k))
    if camera.center.lng > 180 { camera.center.lng -= 360 }
    if camera.center.lng < -180 { camera.center.lng += 360 }
  }

  // MARK: Gestures

  func pan(_ translation: CGPoint, velocity: CGPoint, state: UIGestureRecognizer.State) {
    switch state {
    case .began:
      touching = true; flight = nil; spin = .zero
    case .changed:
      rotate(by: SIMD2(Double(translation.x), Double(translation.y)))
    default:
      touching = false
      spin = SIMD2(Double(velocity.x), Double(velocity.y))
      checkDrift(after: 0.6)
    }
    wake()
  }

  // Compare where the camera came to rest with where the page framed it.
  private func checkDrift(after seconds: Double) {
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
      guard let self, !self.touching, self.flight == nil, let target = self.target(for: self.scene.framing) else { return }
      let away = angularDistance(self.camera.center, target.center) > 0.14 || abs(self.camera.distance - target.distance) > 0.18 * max(1, target.distance - 1)
      self.drifted = away
    }
  }

  func pinch(_ scale: CGFloat, state: UIGestureRecognizer.State) {
    if state == .began { flight = nil; spin = .zero }
    let height = (camera.distance - 1) / Double(max(scale, 0.01))
    camera.distance = max(1.08, min(worldDistance() * 1.35, 1 + height))
    if state == .ended || state == .cancelled { checkDrift(after: 0.1) }
    wake()
  }

  func zoom(in point: CGPoint) {
    var target = camera
    if let hit = groundPoint(at: point) { target.center = hit }
    target.distance = max(1.15, 1 + (camera.distance - 1) * 0.45)
    flight = (camera, target, CACurrentMediaTime(), 0.45, 0)
    checkDrift(after: 0.5)
    wake()
  }

  func tap(at point: CGPoint) {
    let matrix = viewProjection()
    let eye = camera.eye
    let cameraF = SIMD3<Float>(Float(eye.x), Float(eye.y), Float(eye.z))
    // A city's light answers before the arcs that meet there.
    var nearest: (code: String, distance: CGFloat)?
    for dot in scene.dots where dot.alpha > 0.3 {
      let v = toVector(dot.at)
      let p = SIMD3<Float>(Float(v.x), Float(v.y), Float(v.z))
      guard isVisible(p, from: cameraF), let screen = project(p, matrix) else { continue }
      let d = hypot(screen.x - point.x, screen.y - point.y)
      if d < (nearest?.distance ?? 18) { nearest = (dot.code, d) }
    }
    if let nearest { onSelect?(.place(nearest.code)); return }
    var best: (id: String, distance: CGFloat)?
    // Focused arcs answer first; the rest only when no focused arc is near.
    for batch in [focus, base] {
      for (id, points) in batch.paths {
        var previous: CGPoint?
        for (index, p) in points.enumerated() where index % 2 == 0 || index == points.count - 1 {
          guard isVisible(p, from: cameraF), let screen = project(p, matrix) else { previous = nil; continue }
          if let previous {
            let d = distance(from: point, toSegment: previous, screen)
            if d < (best?.distance ?? 26) { best = (id, d) }
          }
          previous = screen
        }
      }
      if best != nil { break }
    }
    if let best { onSelect?(.flight(best.id)) }
  }

  private func groundPoint(at point: CGPoint) -> LngLat? {
    let size = viewSize
    let ndc = SIMD2<Float>(Float(point.x / size.width * 2 - 1), Float(1 - point.y / size.height * 2))
    let inverse = viewProjection().inverse
    let near = inverse * SIMD4(ndc.x, ndc.y, 0, 1), far = inverse * SIMD4(ndc.x, ndc.y, 1, 1)
    let origin = SIMD3<Double>(Double(near.x / near.w), Double(near.y / near.w), Double(near.z / near.w))
    let end = SIMD3<Double>(Double(far.x / far.w), Double(far.y / far.w), Double(far.z / far.w))
    let dir = simd_normalize(end - origin)
    let b = simd_dot(origin, dir), c = simd_dot(origin, origin) - 1
    let disc = b * b - c
    guard disc >= 0 else { return nil }
    return fromVector(simd_normalize(origin + dir * (-b - sqrt(disc))))
  }

  private func isVisible(_ p: SIMD3<Float>, from camera: SIMD3<Float>) -> Bool {
    let d = p - camera
    let a = simd_dot(d, d), b = simd_dot(camera, d), c = simd_dot(camera, camera) - 1
    let disc = b * b - a * c
    if disc <= 0 { return true }
    return (-b - sqrt(disc)) / a > 0.985
  }

  private func project(_ p: SIMD3<Float>, _ matrix: simd_float4x4) -> CGPoint? {
    let clip = matrix * SIMD4(p, 1)
    guard clip.w > 0 else { return nil }
    let size = viewSize
    return CGPoint(x: CGFloat((clip.x / clip.w + 1) / 2) * size.width, y: CGFloat((1 - clip.y / clip.w) / 2) * size.height)
  }

  private func distance(from p: CGPoint, toSegment a: CGPoint, _ b: CGPoint) -> CGFloat {
    let ab = CGPoint(x: b.x - a.x, y: b.y - a.y)
    let length = ab.x * ab.x + ab.y * ab.y
    let t = length > 0 ? max(0, min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / length)) : 0
    return hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t))
  }

  // MARK: Matrices

  private func viewProjection() -> simd_float4x4 {
    let size = viewSize
    let aspect = Float(size.width / max(size.height, 1))
    let eye = camera.eye
    let eyeF = SIMD3<Float>(Float(eye.x), Float(eye.y), Float(eye.z))
    let near = Float(max(0.005, camera.distance - 1.6)), far = Float(camera.distance + 1.2)
    let projection = perspectiveMatrix(fovy: Float(Self.verticalFOV), aspect: aspect, near: near, far: far)
    // Centre the globe in the part of the screen the sheet leaves uncovered.
    let middle = insets.top + (size.height - insets.top - insets.bottom) / 2
    let shift = Float(1 - 2 * middle / max(size.height, 1))
    var offset = matrix_identity_float4x4
    offset.columns.3 = SIMD4(0, shift, 0, 1)
    return offset * projection * lookAtMatrix(eye: eyeF, center: .zero, up: SIMD3(0, 1, 0))
  }

  // MARK: Labels

  private func syncLabels() {
    guard let view else { return }
    let wanted = Set(scene.labels.map(\.code))
    for (code, label) in labels where !wanted.contains(code) { label.removeFromSuperview(); labels[code] = nil; labelAlpha[code] = nil }
    for spec in scene.labels {
      let label = labels[spec.code] ?? {
        let label = UILabel()
        label.layer.shadowColor = UIColor.black.cgColor
        label.layer.shadowOpacity = 1
        label.layer.shadowRadius = 4
        label.layer.shadowOffset = .zero
        label.isUserInteractionEnabled = false
        label.alpha = 0
        view.addSubview(label)
        labels[spec.code] = label
        return label
      }()
      label.font = .systemFont(ofSize: spec.strong ? 12.5 : 11, weight: spec.strong ? .semibold : .medium)
      label.textColor = UIColor(white: 1, alpha: spec.strong ? 0.92 : 0.6)
      label.text = spec.text
      label.sizeToFit()
    }
  }

  // Names go where they fit: the open page's first, then the most visited,
  // each kept clear of those already placed; closer in, more of them fit.
  private func placeLabels(_ matrix: simd_float4x4) {
    let now = CACurrentMediaTime()
    let dt = min(0.1, now - labelClock)
    labelClock = now
    let eye = camera.eye
    let cameraF = SIMD3<Float>(Float(eye.x), Float(eye.y), Float(eye.z))
    let focus = CGFloat(focusAlpha.value(at: now))
    let reveal = CGFloat(reveal.value(at: now))
    var taken: [CGRect] = []
    var settling = false
    // A handful of names from afar, more as the camera comes closer.
    let closeness = max(1, (worldDistance() - 1) / max(0.05, camera.distance - 1))
    var room = min(40, Int(5 * pow(closeness, 1.1)))
    for spec in scene.labels.sorted(by: { ($0.strong ? 1 : 0, $0.rank) > ($1.strong ? 1 : 0, $1.rank) }) {
      guard let label = labels[spec.code] else { continue }
      var target: CGFloat = 0
      let v = toVector(spec.at)
      let p = SIMD3<Float>(Float(v.x), Float(v.y), Float(v.z)) * 1.001
      if isVisible(p, from: cameraF), let screen = project(p, matrix),
         screen.y > insets.top + 8, screen.y < viewSize.height - insets.bottom - 18, spec.strong || room > 0 {
        // Above the dot, else below; a name of what is open may also sit beside it.
        let w = label.bounds.width, h = label.bounds.height, lift: CGFloat = spec.strong ? 13 : 11
        var spots = [CGPoint(x: screen.x, y: screen.y - lift), CGPoint(x: screen.x, y: screen.y + lift)]
        if spec.strong { spots += [CGPoint(x: screen.x + w / 2 + 9, y: screen.y), CGPoint(x: screen.x - w / 2 - 9, y: screen.y)] }
        let fit = spots.lazy.map { center in
          (center, CGRect(x: center.x - w / 2 - 6, y: center.y - h / 2 - 3, width: w + 12, height: h + 6))
        }.first { _, box in box.minX > 4 && box.maxX < self.viewSize.width - 4 && !taken.contains(where: { $0.intersects(box) }) }
        if let (center, box) = fit {
          taken.append(box)
          if !spec.strong { room -= 1 }
          label.center = center
          target = spec.strong ? max(focus, scene.focus.isEmpty ? 1 : 0) : (1 - focus) * reveal
        }
      }
      let current = labelAlpha[spec.code] ?? 0
      let next = current + (target - current) * min(1, dt * 9)
      labelAlpha[spec.code] = abs(next - target) < 0.01 ? target : next
      if labelAlpha[spec.code] != target { settling = true }
      label.alpha = labelAlpha[spec.code] ?? 0
    }
    if settling { wake() }
  }

  // MARK: Drawing

  private var lastFrame: CFTimeInterval = CACurrentMediaTime()
  // The sun swings to a page's moment instead of jumping, so the terminator
  // sweeps across the globe.
  private var sunFrom = SIMD3<Double>(0, 0, 1)
  private var sunStart: CFTimeInterval = 0
  private var sunSpan: CFTimeInterval = 0

  private func sun(at t: CFTimeInterval) -> SIMD3<Double> {
    let target = toVector(subsolar(scene.sunAt ?? Date().timeIntervalSince1970 * 1000))
    guard sunSpan > 0, t < sunStart + sunSpan else { return target }
    let k = (t - sunStart) / sunSpan
    let eased = k < 0.5 ? 4 * k * k * k : 1 - pow(-2 * k + 2, 3) / 2
    let mixed = sunFrom * (1 - eased) + target * eased
    return simd_length(mixed) < 1e-3 ? target : simd_normalize(mixed)
  }

  func wake() {
    guard let view else { return }
    view.isPaused = false
    view.preferredFramesPerSecond = 120
  }

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

  func draw(in view: MTKView) {
    if view.bounds.size != framedSize, view.bounds.width > 0 {
      let first = framedSize == .zero
      framedSize = view.bounds.size
      if first, let target = target(for: scene.framing) {
        // The first look comes in from further out, turning onto the framing as the arcs draw in.
        if reduceMotion { camera = target; flight = nil } else {
          var start = target
          start.distance = target.distance * 1.9 + 1
          start.center.lng = target.center.lng + 55
          camera = start
          flight = (start, target, CACurrentMediaTime(), 2.1, 0)
        }
      } else if !first { refit(animated: false) }
    }
    let now = CACurrentMediaTime()
    let dt = min(0.05, now - lastFrame)
    lastFrame = now
    let moving = step(now, dt: dt)
    let animating = moving || touching || !reveal.settled(at: now) || !focusAlpha.settled(at: now) || now < sunStart + sunSpan
    // Pulses keep the scene alive; they read fine at a gentler rate.
    view.preferredFramesPerSecond = animating ? 120 : (reduceMotion ? 10 : 30)

    guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
          let light = kit.lightTarget(Int(view.drawableSize.width), Int(view.drawableSize.height), reusing: self.light),
          let buffer = kit.queue.makeCommandBuffer() else { return }
    self.light = light
    let matrix = viewProjection()
    let eye = camera.eye
    let scale = Float(view.contentScaleFactor)
    let clock = Float(now - started)
    let frame = FrameUniforms(viewProj: matrix, inverseViewProj: matrix.inverse,
                              camera: SIMD4(Float(eye.x), Float(eye.y), Float(eye.z), Float(camera.distance)),
                              viewport: SIMD4(Float(view.drawableSize.width), Float(view.drawableSize.height), scale, clock))
    let revealValue = Float(reveal.value(at: now))
    let focused = Float(focusAlpha.value(at: now))
    let pulses: Float = reduceMotion ? 0 : 1
    // The Earth as photographed, lit where the sun is now (or was at the
    // moment the page is about): day where it is up, the cities' own lights
    // where it is night. Black Marble already holds every city's glow, so the
    // airports' drawn lights stay off. Without the photographs, the night style.
    let photo = kit.hasEarth
    let additive: Float = photo ? 0.4 : 0.55
    let shade: Float = photo ? 0.75 : 0
    kit.encode(buffer, pass: pass, light: light, frame: frame,
               ground: photo ? GlobeKit.photographed(sun: sun(at: now)) : GlobeKit.ground(), arcs: [
      (base, ArcLook(alpha: 1 - 0.95 * focused, glow: 3.2, glowGain: photo ? 0.22 : 0.16, additive: additive, pulse: 0.8 * pulses * (1 - focused),
                     reveal: scene.focus.isEmpty ? revealValue : 1, limb: 1, widthScale: 1, directed: 0, clock: clock, shade: shade)),
      (focus, ArcLook(alpha: focused, glow: 7, glowGain: photo ? 0.3 : 0.24, additive: additive, pulse: pulses,
                      reveal: scene.focus.isEmpty ? 1 : revealValue, limb: 0.35, widthScale: 1, directed: 1, clock: clock, shade: shade)),
    ], dots: dots, dotCount: dotCount, worldLights: photo ? 0 : 1)
    buffer.present(drawable)
    buffer.commit()
    placeLabels(matrix)
  }
}
