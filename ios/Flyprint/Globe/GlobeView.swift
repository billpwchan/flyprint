import MetalKit
import SwiftUI

// The globe as a SwiftUI view. Pages describe what it shows; it answers
// touches in place: drag to turn, pinch or double-tap to come closer, tap a
// flight to open it.
struct GlobeView: UIViewRepresentable {
  var scene: GlobeScene
  var insets: EdgeInsets
  var onSelect: (GlobePick) -> Void
  var onDrift: (Bool) -> Void = { _ in }

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> MTKView {
    let view = MTKView()
    view.backgroundColor = UIColor(red: CGFloat(Palette.space.x), green: CGFloat(Palette.space.y), blue: CGFloat(Palette.space.z), alpha: 1)
    view.isOpaque = true
    view.preferredFramesPerSecond = 120
    view.enableSetNeedsDisplay = false
    guard let renderer = GlobeRenderer(view: view) else { return view }
    view.delegate = renderer
    context.coordinator.renderer = renderer

    let coordinator = context.coordinator
    let pan = UIPanGestureRecognizer(target: coordinator, action: #selector(Coordinator.pan(_:)))
    pan.maximumNumberOfTouches = 1
    let pinch = UIPinchGestureRecognizer(target: coordinator, action: #selector(Coordinator.pinch(_:)))
    let double = UITapGestureRecognizer(target: coordinator, action: #selector(Coordinator.doubleTap(_:)))
    double.numberOfTapsRequired = 2
    let single = UITapGestureRecognizer(target: coordinator, action: #selector(Coordinator.tap(_:)))
    single.require(toFail: double)
    pan.delegate = coordinator
    pinch.delegate = coordinator
    [pan, pinch, double, single].forEach(view.addGestureRecognizer)
    return view
  }

  func updateUIView(_ view: MTKView, context: Context) {
    guard let renderer = context.coordinator.renderer else { return }
    renderer.onSelect = onSelect
    renderer.onDrift = onDrift
    renderer.insets = UIEdgeInsets(top: insets.top, left: insets.leading, bottom: insets.bottom, right: insets.trailing)
    renderer.apply(scene)
  }

  final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    var renderer: GlobeRenderer?
    private var lastScale: CGFloat = 1

    @objc func pan(_ gesture: UIPanGestureRecognizer) {
      let translation = gesture.translation(in: gesture.view)
      gesture.setTranslation(.zero, in: gesture.view)
      renderer?.pan(translation, velocity: gesture.velocity(in: gesture.view), state: gesture.state)
    }

    @objc func pinch(_ gesture: UIPinchGestureRecognizer) {
      if gesture.state == .began { lastScale = 1 }
      renderer?.pinch(gesture.scale / lastScale, state: gesture.state)
      lastScale = gesture.scale
    }

    @objc func doubleTap(_ gesture: UITapGestureRecognizer) {
      renderer?.zoom(in: gesture.location(in: gesture.view))
    }

    @objc func tap(_ gesture: UITapGestureRecognizer) {
      renderer?.tap(at: gesture.location(in: gesture.view))
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
      true
    }
  }
}
