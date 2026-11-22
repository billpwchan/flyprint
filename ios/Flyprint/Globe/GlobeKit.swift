import Compression
import MetalKit
import UIKit
import simd

// What every drawing of the globe shares: the GPU, the shaders, the ground and
// the world's airport lights. The live globe and the stills drawn for sharing
// use the one copy, so a card looks exactly like the app.

// GPU-side layouts; each matches its struct in Globe.metal.
struct FrameUniforms {
  var viewProj: simd_float4x4
  var inverseViewProj: simd_float4x4
  var camera: SIMD4<Float>
  var viewport: SIMD4<Float>
}

struct GroundUniforms {
  var ocean: SIMD4<Float>
  var land: SIMD4<Float>
  var shore: SIMD4<Float>
  var border: SIMD4<Float>
  var rim: SIMD4<Float>
  var space: SIMD4<Float>
  var spread: SIMD4<Float>
  var sun: SIMD4<Float> = .zero
  var photo: SIMD4<Float> = .zero
}

struct ArcVertex {
  var position: SIMD3<Float>
  var previous: SIMD3<Float>
  var next: SIMD3<Float>
  var ts: SIMD2<Float>
  var color: SIMD4<Float>
  var style: SIMD4<Float>
  var timing: SIMD4<Float>
}

struct ArcLook {
  var alpha: Float
  var glow: Float
  var glowGain: Float
  var additive: Float
  var pulse: Float
  var reveal: Float
  var limb: Float
  var widthScale: Float
  var directed: Float
  var clock: Float
  var shade: Float = 0
  var padding: Float = 0
}

struct DotVertex {
  var position: SIMD3<Float>
  var color: SIMD4<Float>
  var style: SIMD4<Float>
}

struct ArcBatch {
  var vertices: MTLBuffer?
  var indices: MTLBuffer?
  var indexCount = 0
  // Arc points on the CPU, for picking a flight under a finger.
  var paths: [(id: String, points: [SIMD3<Float>])] = []
}

final class GlobeKit {
  static let shared = GlobeKit()

  let device: MTLDevice
  let queue: MTLCommandQueue
  private let groundPipeline: MTLRenderPipelineState
  private let arcPipeline: MTLRenderPipelineState
  private let composePipeline: MTLRenderPipelineState
  private let dotPipeline: MTLRenderPipelineState
  private let glowPipeline: MTLRenderPipelineState
  private let sampler: MTLSamplerState
  private(set) var fields: MTLTexture
  // The photographed Earth, by day and by night; a black pixel until loaded.
  private(set) var day: MTLTexture
  private(set) var night: MTLTexture
  private(set) var lights: MTLBuffer?
  private(set) var lightCount = 0
  private var groundLoaded = false
  private var lightsLoaded = false
  private var earthLoaded = false
  // Both photographs are in; until then (or in a build without them) the
  // globe is drawn in its night style.
  private(set) var hasEarth = false
  private var waiting: [CheckedContinuation<Void, Never>] = []
  private var listeners: [() -> Void] = []

  static let pixelFormat = MTLPixelFormat.bgra8Unorm

  private init?() {
    guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue(),
          let library = device.makeDefaultLibrary() else { print("globe: no Metal device or library"); return nil }
    self.device = device
    self.queue = queue

    enum Blend { case none, over, accumulate }
    func pipeline(_ vertex: String, _ fragment: String, blend: Blend, format: MTLPixelFormat = GlobeKit.pixelFormat) -> MTLRenderPipelineState? {
      let descriptor = MTLRenderPipelineDescriptor()
      descriptor.vertexFunction = library.makeFunction(name: vertex)
      descriptor.fragmentFunction = library.makeFunction(name: fragment)
      let attachment = descriptor.colorAttachments[0]!
      attachment.pixelFormat = format
      if blend != .none {
        attachment.isBlendingEnabled = true
        attachment.rgbBlendOperation = .add
        attachment.alphaBlendOperation = .add
        attachment.sourceRGBBlendFactor = .one
        attachment.sourceAlphaBlendFactor = .one
        attachment.destinationRGBBlendFactor = blend == .accumulate ? .one : .oneMinusSourceAlpha
        attachment.destinationAlphaBlendFactor = blend == .accumulate ? .one : .oneMinusSourceAlpha
      }
      do { return try device.makeRenderPipelineState(descriptor: descriptor) }
      catch { print("globe: pipeline \(vertex)/\(fragment) failed: \(error)"); return nil }
    }
    guard let ground = pipeline("groundVertex", "groundFragment", blend: .none),
          let arcs = pipeline("arcVertex", "arcFragment", blend: .accumulate, format: .rgba16Float),
          let compose = pipeline("groundVertex", "composeFragment", blend: .over),
          let points = pipeline("dotVertex", "dotFragment", blend: .over),
          let glows = pipeline("dotVertex", "dotFragment", blend: .accumulate) else { return nil }
    groundPipeline = ground; arcPipeline = arcs; composePipeline = compose; dotPipeline = points; glowPipeline = glows

    let samplerDescriptor = MTLSamplerDescriptor()
    samplerDescriptor.minFilter = .linear
    samplerDescriptor.magFilter = .linear
    samplerDescriptor.mipFilter = .linear
    samplerDescriptor.sAddressMode = .repeat
    samplerDescriptor.tAddressMode = .clampToEdge
    samplerDescriptor.maxAnisotropy = 4
    sampler = device.makeSamplerState(descriptor: samplerDescriptor)!

    // Open sea until the ground has loaded.
    let blank = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rg8Unorm, width: 1, height: 1, mipmapped: false)
    fields = device.makeTexture(descriptor: blank)!
    var sea: [UInt8] = [0, 255]
    fields.replace(region: MTLRegionMake2D(0, 0, 1, 1), mipmapLevel: 0, withBytes: &sea, bytesPerRow: 2)
    let dark = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: 1, height: 1, mipmapped: false)
    day = device.makeTexture(descriptor: dark)!
    night = device.makeTexture(descriptor: dark)!
    var black: [UInt8] = [8, 14, 24, 255]
    day.replace(region: MTLRegionMake2D(0, 0, 1, 1), mipmapLevel: 0, withBytes: &black, bytesPerRow: 4)
    loadGround()
    loadLights()
    loadEarth()
  }

  // Called each time the ground or the lights arrive.
  func whenLoaded(_ listener: @escaping () -> Void) { listeners.append(listener) }

  // Both the ground and the lights, for a still that must not show open sea.
  func ready() async {
    if groundLoaded && lightsLoaded && earthLoaded { return }
    await withCheckedContinuation { waiting.append($0) }
  }

  private func loaded() {
    listeners.forEach { $0() }
    guard groundLoaded && lightsLoaded && earthLoaded else { return }
    waiting.forEach { $0.resume() }
    waiting.removeAll()
  }

  // MARK: Ground

  private func loadGround() {
    guard let url = Bundle.main.url(forResource: "globe-ground", withExtension: "bin"),
          let headerURL = Bundle.main.url(forResource: "globe-ground", withExtension: "json"),
          let header = try? JSONDecoder().decode(GroundHeader.self, from: Data(contentsOf: headerURL)) else { groundLoaded = true; return }
    let device = self.device
    Task.detached(priority: .userInitiated) {
      let texture = Self.makeGround(device: device, url: url, header: header)
      await MainActor.run { [weak self] in
        guard let self else { return }
        if let texture { self.fields = texture }
        self.groundLoaded = true
        self.loaded()
      }
    }
  }

  private struct GroundHeader: Decodable, Sendable { var width: Int; var height: Int; var bytes: Int }

  nonisolated private static func makeGround(device: MTLDevice, url: URL, header: GroundHeader) -> MTLTexture? {
    guard let packed = try? Data(contentsOf: url, options: .alwaysMapped) else { return nil }
    var texels = [UInt8](repeating: 0, count: header.bytes)
    let written = packed.withUnsafeBytes { source in
      texels.withUnsafeMutableBytes { target in
        compression_decode_buffer(target.baseAddress!.assumingMemoryBound(to: UInt8.self), header.bytes,
                                  source.baseAddress!.assumingMemoryBound(to: UInt8.self), packed.count, nil, COMPRESSION_ZLIB)
      }
    }
    guard written == header.bytes else { return nil }
    let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rg8Unorm, width: header.width, height: header.height, mipmapped: true)
    descriptor.usage = [.shaderRead]
    descriptor.storageMode = .shared
    guard let texture = device.makeTexture(descriptor: descriptor), let queue = device.makeCommandQueue() else { return nil }
    texels.withUnsafeBytes { bytes in
      texture.replace(region: MTLRegionMake2D(0, 0, header.width, header.height), mipmapLevel: 0, withBytes: bytes.baseAddress!, bytesPerRow: header.width * 2)
    }
    guard let buffer = queue.makeCommandBuffer(), let blit = buffer.makeBlitCommandEncoder() else { return nil }
    blit.generateMipmaps(for: texture)
    blit.endEncoding()
    buffer.commit()
    buffer.waitUntilCompleted()
    return texture
  }

  // MARK: Earth

  // NASA Blue Marble (December 2004) and Black Marble (2016), public domain,
  // as ASTC; see scripts/build-ios-earth.sh.
  private func loadEarth() {
    let device = self.device
    Task.detached(priority: .userInitiated) {
      let day = Self.loadTexture(device: device, name: "earth-day")
      let night = Self.loadTexture(device: device, name: "earth-night")
      if day == nil || night == nil { print("globe: earth textures missing") }
      await MainActor.run { [weak self] in
        guard let self else { return }
        if let day, let night {
          self.day = day
          self.night = night
          self.hasEarth = true
        }
        self.earthLoaded = true
        self.loaded()
      }
    }
  }

  nonisolated private static func loadTexture(device: MTLDevice, name: String) -> MTLTexture? {
    guard let url = Bundle.main.url(forResource: name, withExtension: "ktx") else { return nil }
    let options: [MTKTextureLoader.Option: Any] = [.textureStorageMode: MTLStorageMode.private.rawValue, .textureUsage: MTLTextureUsage.shaderRead.rawValue]
    return try? MTKTextureLoader(device: device).newTexture(URL: url, options: options)
  }

  // MARK: Lights

  private func loadLights() {
    guard let url = Bundle.main.url(forResource: "runways", withExtension: "json") else { lightsLoaded = true; return }
    let device = self.device
    Task.detached(priority: .utility) {
      let made = Self.makeLights(device: device, url: url)
      await MainActor.run { [weak self] in
        guard let self else { return }
        self.lights = made?.buffer
        self.lightCount = made?.count ?? 0
        self.lightsLoaded = true
        self.loaded()
      }
    }
  }

  nonisolated private static func makeLights(device: MTLDevice, url: URL) -> (buffer: MTLBuffer, count: Int)? {
    guard let data = try? Data(contentsOf: url),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let airports = root["runways"] as? [String: [[Any]]] else { return nil }
    var list: [DotVertex] = []
    list.reserveCapacity(airports.count)
    for (_, runways) in airports {
      var longest = 0.0, lng = 0.0, lat = 0.0
      for runway in runways where runway.count >= 8 {
        guard let a = runway[0] as? Double, let b = runway[1] as? Double, let c = runway[2] as? Double,
              let d = runway[3] as? Double, let length = (runway[7] as? NSNumber)?.doubleValue else { continue }
        if length > longest { longest = length; lng = (a + c) / 2; lat = (b + d) / 2 }
      }
      guard longest >= 1200 else { continue }
      let size: (radius: Float, alpha: Float) = longest >= 3500 ? (1.0, 0.38) : longest >= 2800 ? (0.85, 0.27) : longest >= 2000 ? (0.7, 0.16) : (0.55, 0.09)
      // As toVector, which is main-actor bound.
      let l = lng * .pi / 180, t = lat * .pi / 180
      let v = SIMD3<Double>(cos(t) * sin(l), sin(t), cos(t) * cos(l))
      list.append(DotVertex(position: SIMD3(Float(v.x), Float(v.y), Float(v.z)), color: SIMD4(1.0, 0.8, 0.52, size.alpha), style: SIMD4(size.radius, 1, 0, 0)))
    }
    guard !list.isEmpty, let buffer = device.makeBuffer(bytes: list, length: MemoryLayout<DotVertex>.stride * list.count) else { return nil }
    return (buffer, list.count)
  }

  // The world's lights at a share of their strength, for a still where the
  // person's own flights must stay the brightest thing.
  private var dimmed: [Float: MTLBuffer] = [:]
  func lights(at strength: Float) -> MTLBuffer? {
    guard let lights, strength < 0.999 else { return lights }
    if let cached = dimmed[strength] { return cached }
    let source = lights.contents().bindMemory(to: DotVertex.self, capacity: lightCount)
    var list = Array(UnsafeBufferPointer(start: source, count: lightCount))
    for index in list.indices { list[index].color.w *= strength }
    let buffer = device.makeBuffer(bytes: list, length: MemoryLayout<DotVertex>.stride * list.count)
    dimmed[strength] = buffer
    return buffer
  }

  // MARK: Geometry

  enum BatchStyle { case base, focus }

  func build(_ arcs: [ArcSpec], style: BatchStyle) -> ArcBatch {
    var vertices: [ArcVertex] = []
    var indices: [UInt32] = []
    var paths: [(id: String, points: [SIMD3<Float>])] = []
    vertices.reserveCapacity(arcs.count * 140)
    let count = Double(max(arcs.count, 1))
    for (order, arc) in arcs.enumerated() {
      let path = arcPath(arc.from, arc.to, bow: arc.bow).map { SIMD3<Float>(Float($0.x), Float($0.y), Float($0.z)) }
      guard path.count > 1 else { continue }
      paths.append((arc.id, path))
      let angle = acos(min(1, max(-1, simd_dot(toVector(arc.from), toVector(arc.to)))))
      let travel = 1.1 + 2.6 * sqrt(angle / .pi)
      let phase = Float(Self.hash(arc.id)), period = Float(travel / 0.3 * (0.85 + 0.3 * Self.hash(arc.id + "~")))
      let dashes = Float(11 + 30 * sqrt(angle / .pi))
      // Oldest first across the reveal; a trip's legs one after another.
      let delay = style == .base ? Float(Double(order) / count * 0.72) : Float(Double(order) / count * 0.6)
      let span: Float = style == .base ? 0.28 : Float(0.4 / count + 0.25)
      let color = SIMD4<Float>(arc.color, arc.alpha)
      let first = UInt32(vertices.count)
      for (index, point) in path.enumerated() {
        let previous = path[max(0, index - 1)], next = path[min(path.count - 1, index + 1)]
        let t = Float(index) / Float(path.count - 1)
        for side: Float in [-1, 1] {
          vertices.append(ArcVertex(position: point, previous: previous, next: next, ts: SIMD2(t, side), color: color,
                                    style: SIMD4(arc.width, phase, period, 0), timing: SIMD4(delay, span, arc.plan, dashes)))
        }
      }
      for segment in 0..<UInt32(path.count - 1) {
        let a = first + segment * 2
        indices += [a, a + 1, a + 2, a + 1, a + 3, a + 2]
      }
    }
    guard !vertices.isEmpty else { return ArcBatch() }
    return ArcBatch(
      vertices: device.makeBuffer(bytes: vertices, length: MemoryLayout<ArcVertex>.stride * vertices.count),
      indices: device.makeBuffer(bytes: indices, length: MemoryLayout<UInt32>.stride * indices.count),
      indexCount: indices.count, paths: paths)
  }

  func dots(_ specs: [DotSpec]) -> (buffer: MTLBuffer?, count: Int) {
    let list = specs.map { spec -> DotVertex in
      let v = toVector(spec.at)
      return DotVertex(position: SIMD3(Float(v.x), Float(v.y), Float(v.z)), color: SIMD4(0.93, 0.94, 0.95, spec.alpha), style: SIMD4(spec.radius, 0, 0, 0))
    }
    return (list.isEmpty ? nil : device.makeBuffer(bytes: list, length: MemoryLayout<DotVertex>.stride * list.count), list.count)
  }

  static func hash(_ key: String) -> Double {
    var value: UInt32 = 2166136261
    for unit in key.utf16 { value = (value ^ UInt32(unit)) &* 16777619 }
    return Double(value % 10007) / 10007
  }

  // The float buffer the arcs' light adds up in, the size of the target.
  func lightTarget(_ width: Int, _ height: Int, reusing light: MTLTexture?) -> MTLTexture? {
    let width = max(1, width), height = max(1, height)
    if let light, light.width == width, light.height == height { return light }
    let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba16Float, width: width, height: height, mipmapped: false)
    descriptor.usage = [.renderTarget, .shaderRead]
    descriptor.storageMode = .private
    return device.makeTexture(descriptor: descriptor)
  }

  static func ground(rim: Float = 0.42, land: SIMD3<Float> = Palette.land, shore: Float = 0.34, border: Float = 0.075, soften: Float = 0) -> GroundUniforms {
    GroundUniforms(ocean: SIMD4(Palette.ocean, 1), land: SIMD4(land, 1), shore: SIMD4(Palette.shore, shore),
                   border: SIMD4(1, 1, 1, border), rim: SIMD4(SIMD3<Float>(hex: 0x6F8FB8), rim), space: SIMD4(Palette.space, 1),
                   spread: SIMD4(soften / 48, soften / 12, 0, 0))
  }

  // The photographed Earth with the sun where it is at `instant` (ms since 1970).
  static func photographed(sun: SIMD3<Double>, exposure: Float = 1.9, border: Float = 0.035) -> GroundUniforms {
    var ground = ground(border: border)
    ground.sun = SIMD4(Float(sun.x), Float(sun.y), Float(sun.z), 1)
    ground.photo = SIMD4(exposure, 2.2, 0.004, 0.10)
    return ground
  }

  // MARK: Drawing

  // Arcs add up in `light`; then the ground, the world's lights, the arcs'
  // light and the airports are laid down in `pass`.
  func encode(_ buffer: MTLCommandBuffer, pass: MTLRenderPassDescriptor, light: MTLTexture, frame: FrameUniforms,
              ground: GroundUniforms, arcs: [(ArcBatch, ArcLook)], dots: MTLBuffer?, dotCount: Int, worldLights: Float = 1) {
    var frame = frame
    var ground = ground
    ground.spread.z = Float(fields.width)
    ground.spread.w = Float(fields.height)
    let lightPass = MTLRenderPassDescriptor()
    lightPass.colorAttachments[0].texture = light
    lightPass.colorAttachments[0].loadAction = .clear
    lightPass.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
    lightPass.colorAttachments[0].storeAction = .store
    guard let encoder = buffer.makeRenderCommandEncoder(descriptor: lightPass) else { return }
    encoder.setRenderPipelineState(arcPipeline)
    encoder.setVertexBytes(&frame, length: MemoryLayout<FrameUniforms>.stride, index: 1)
    encoder.setFragmentBytes(&frame, length: MemoryLayout<FrameUniforms>.stride, index: 1)
    for (batch, look) in arcs {
      guard let vertices = batch.vertices, let indices = batch.indices, look.alpha > 0.002 else { continue }
      var look = look
      encoder.setVertexBuffer(vertices, offset: 0, index: 0)
      encoder.setVertexBytes(&look, length: MemoryLayout<ArcLook>.stride, index: 2)
      encoder.setFragmentBytes(&look, length: MemoryLayout<ArcLook>.stride, index: 2)
      encoder.drawIndexedPrimitives(type: .triangle, indexCount: batch.indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
    }
    encoder.endEncoding()

    guard let screen = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
    screen.setRenderPipelineState(groundPipeline)
    screen.setFragmentBytes(&frame, length: MemoryLayout<FrameUniforms>.stride, index: 0)
    screen.setFragmentBytes(&ground, length: MemoryLayout<GroundUniforms>.stride, index: 1)
    screen.setFragmentTexture(fields, index: 0)
    screen.setFragmentTexture(day, index: 1)
    screen.setFragmentTexture(night, index: 2)
    screen.setFragmentSamplerState(sampler, index: 0)
    screen.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
    if let lights = lights(at: worldLights), lightCount > 0, worldLights > 0 {
      screen.setRenderPipelineState(glowPipeline)
      screen.setVertexBuffer(lights, offset: 0, index: 0)
      screen.setVertexBytes(&frame, length: MemoryLayout<FrameUniforms>.stride, index: 1)
      screen.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4, instanceCount: lightCount)
    }
    screen.setRenderPipelineState(composePipeline)
    screen.setFragmentTexture(light, index: 0)
    screen.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
    if let dots, dotCount > 0 {
      screen.setRenderPipelineState(dotPipeline)
      screen.setVertexBuffer(dots, offset: 0, index: 0)
      screen.setVertexBytes(&frame, length: MemoryLayout<FrameUniforms>.stride, index: 1)
      screen.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4, instanceCount: dotCount)
    }
    screen.endEncoding()
  }
}

// MARK: Camera maths, shared by the live globe and the stills

func perspectiveMatrix(fovy: Float, aspect: Float, near: Float, far: Float) -> simd_float4x4 {
  let y = 1 / tan(fovy / 2), x = y / aspect, z = far / (near - far)
  return simd_float4x4(columns: (SIMD4(x, 0, 0, 0), SIMD4(0, y, 0, 0), SIMD4(0, 0, z, -1), SIMD4(0, 0, z * near, 0)))
}

func lookAtMatrix(eye: SIMD3<Float>, center: SIMD3<Float>, up: SIMD3<Float>) -> simd_float4x4 {
  let f = simd_normalize(center - eye)
  let s = simd_normalize(simd_cross(f, up))
  let u = simd_cross(s, f)
  return simd_float4x4(columns: (SIMD4(s.x, u.x, -f.x, 0), SIMD4(s.y, u.y, -f.y, 0), SIMD4(s.z, u.z, -f.z, 0),
                                 SIMD4(-simd_dot(s, eye), -simd_dot(u, eye), simd_dot(f, eye), 1)))
}

// Whether the sphere hides a point from the camera.
func sphereHides(_ p: SIMD3<Float>, from camera: SIMD3<Float>) -> Bool {
  let d = p - camera
  let a = simd_dot(d, d), b = simd_dot(camera, d), c = simd_dot(camera, camera) - 1
  let disc = b * b - a * c
  if disc <= 0 { return false }
  return (-b - sqrt(disc)) / a <= 0.985
}
