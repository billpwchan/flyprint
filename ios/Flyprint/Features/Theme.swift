import SwiftUI
import UIKit

// The one visual system: light on a dark scene. No outlines, frames or rules;
// hierarchy comes from size, weight, space and how bright a thing is.

enum Ink {
  static let primary = Color.white.opacity(0.94)
  static let secondary = Color.white.opacity(0.62)
  static let tertiary = Color.white.opacity(0.42)
  static let faint = Color.white.opacity(0.22)
  static let ground = Color(red: 7 / 255, green: 8 / 255, blue: 11 / 255)
}

// The type scale: 11/13/15/17/22/30/44, scaled with the reader's text size.
extension Font {
  static func fp(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: UIFont.TextStyle = .body) -> Font {
    .system(size: UIFontMetrics(forTextStyle: style).scaledValue(for: size), weight: weight)
  }
  static let micro = fp(11, .medium, relativeTo: .caption2)
  static let caption = fp(13, relativeTo: .footnote)
  static let captionStrong = fp(13, .semibold, relativeTo: .footnote)
  static let body = fp(15, relativeTo: .subheadline)
  static let bodyStrong = fp(15, .semibold, relativeTo: .subheadline)
  static let headline = fp(17, .semibold, relativeTo: .headline)
  static let title = fp(22, .semibold, relativeTo: .title2)
  static let large = fp(30, .semibold, relativeTo: .title1)
  static let display = fp(44, .semibold, relativeTo: .largeTitle)
}

extension Palette {
  // A field or answer that needs another look, and an action that cannot be undone.
  static let warning = Color(red: 1, green: 0.62, blue: 0.4)
  static let danger = Color(red: 1, green: 0.42, blue: 0.4)
}

extension Store {
  var tone: Color { Palette.color(Palette.tone(owner.tone)) }
}

// The sheet: dark glass the globe glows through, solid enough to read on.
struct SheetGround: View {
  var body: some View {
    ZStack {
      Rectangle().fill(.ultraThinMaterial)
      Ink.ground.opacity(0.8)
    }
    .environment(\.colorScheme, .dark)
  }
}

// The top of every page under the first. Back says where it goes; held, it
// lists every page on the way down so any of them is one step away. Pages in
// a sequence show where this one sits and step to either side. It stays put
// while the page scrolls under it.
struct PageBar: View {
  @Environment(Navigator.self) private var navigator
  @Environment(Store.self) private var store
  @Environment(\.pageTitles) private var titles
  @Environment(\.pageScroll) private var scroll
  let route: Route
  // The page's name, shown small in the middle once the page's own title has scrolled away.
  var title: String? = nil
  var position: (index: Int, count: Int)? = nil
  // Off where the page itself already says which one it is.
  var counted = true
  // Opens a card of what the page shows, to send on.
  var share: (() -> Void)? = nil
  var step: ((Int) -> Void)? = nil

  var body: some View {
    let depth = navigator.path.lastIndex(of: route) ?? max(0, navigator.path.count - 1)
    let back = titles.indices.contains(depth) ? titles[depth] : ""
    let scrolled = scroll?.scrolled ?? false
    let titled = scroll?.titled ?? false
    HStack(spacing: 0) {
      Menu {
        ForEach(Array(titles.prefix(depth + 1).enumerated()).reversed(), id: \.offset) { index, title in
          Button(title) { navigator.pop(to: index) }
        }
      } label: {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left").font(.fp(15, .semibold))
          Text(back).font(.body).lineLimit(1)
        }
        .foregroundStyle(Ink.primary)
        .frame(minHeight: 44)
        .padding(.trailing, 8)
        .contentShape(.rect)
      } primaryAction: {
        navigator.pop(to: depth)
      }
      .accessibilityLabel(Text(back))
      .accessibilityHint(Text(store.lang.t("返回；长按可跳到更早的页面", "返回；長按可跳到更早的頁面", "Goes back; hold for earlier pages")))
      Spacer(minLength: 12)
      if let share {
        Button(action: share) {
          Image(systemName: "square.and.arrow.up").font(.fp(15, .semibold)).foregroundStyle(Ink.primary)
            .frame(width: 40, height: 44).contentShape(.rect)
        }
        .buttonStyle(Press())
        .accessibilityLabel(Text(store.lang.t("分享图片", "分享圖片", "Share image")))
      }
      if let position, let step, position.count > 1 {
        HStack(spacing: 0) {
          stepButton("chevron.left", enabled: position.index > 0, label: store.lang.t("上一个", "上一個", "Previous")) { step(-1) }
          if counted {
            Text("\(position.index + 1) / \(position.count)")
              .font(.caption).monospacedDigit().foregroundStyle(Ink.tertiary)
              .contentTransition(.numericText())
              .accessibilityHidden(true)
          }
          stepButton("chevron.right", enabled: position.index < position.count - 1, label: store.lang.t("下一个", "下一個", "Next")) { step(1) }
        }
      }
    }
    .overlay {
      if let title {
        Text(title).font(.bodyStrong).foregroundStyle(Ink.primary).lineLimit(1)
          .frame(maxWidth: 190)
          .padding(.top, 8)
          .opacity(titled ? 1 : 0)
          .offset(y: titled ? 0 : 6)
          .accessibilityHidden(!titled)
      }
    }
    .padding(.leading, 14)
    .padding(.trailing, 6)
    .padding(.top, 8)
    .shadow(color: .black.opacity(scrolled ? 0 : 0.55), radius: 8)
    .background(alignment: .top) {
      ZStack(alignment: .top) {
        // Over a picture at rest: just enough shade to read the bar.
        LinearGradient(stops: [.init(color: Ink.ground.opacity(0.9), location: 0), .init(color: Ink.ground.opacity(0.6), location: 0.55), .init(color: .clear, location: 1)],
                       startPoint: .top, endPoint: .bottom)
          .frame(height: 84)
          .opacity(scrolled ? 0 : 1)
        EdgeBackdrop(height: pageBarHeight).opacity(scrolled ? 1 : 0)
      }
      .allowsHitTesting(false)
    }
    .animation(.easeOut(duration: 0.2), value: scrolled)
    .animation(.easeOut(duration: 0.2), value: titled)
  }

  private func stepButton(_ symbol: String, enabled: Bool, label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol).font(.fp(15, .semibold))
        .foregroundStyle(enabled ? Ink.primary : Ink.faint)
        .frame(width: 40, height: 44).contentShape(.rect)
    }
    .buttonStyle(Press())
    .disabled(!enabled)
    .accessibilityLabel(Text(label))
  }
}

extension EnvironmentValues {
  // The names of the pages in the stack, the overview first.
  @Entry var pageTitles: [String] = []
  // How far the page under a bar has scrolled; nil where nothing listens.
  @Entry var pageScroll: PageScroll? = nil
  // False for the pages beside the one shown in a pager.
  @Entry var isCurrentPage: Bool = true
}

// A single page under its bar, the bar told how the page scrolls.
struct PageHost<Content: View>: View {
  let route: Route
  var title: String?
  @ViewBuilder var content: Content
  @State private var scroll = PageScroll()

  var body: some View {
    content
      .overlay(alignment: .top) { PageBar(route: route, title: title) }
      .environment(\.pageScroll, scroll)
  }
}

// What a page's bar needs to know about the page's scroll: whether anything
// has gone under the bar, and whether the page's own title has.
@Observable final class PageScroll {
  var scrolled = false
  var titled = false
}

extension View {
  // Reports this scroll view to the bar above it; `titleAfter` is how far
  // down the page's own title ends.
  func reportsPageScroll(titleAfter: CGFloat) -> some View { modifier(ReportsPageScroll(titleAfter: titleAfter)) }

  // Whether a scroll view has moved off its top, for a header's backdrop.
  func scrolledOffTop(_ scrolled: Binding<Bool>) -> some View {
    onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 2 } action: { _, value in
      withAnimation(.easeOut(duration: 0.2)) { scrolled.wrappedValue = value }
    }
  }
}

private struct ReportsPageScroll: ViewModifier {
  @Environment(\.pageScroll) private var scroll
  @Environment(\.isCurrentPage) private var current
  let titleAfter: CGFloat
  @State private var state = (scrolled: false, titled: false)

  func body(content: Content) -> some View {
    content
      .onScrollGeometryChange(for: [Bool].self) { geometry in
        let y = geometry.contentOffset.y + geometry.contentInsets.top
        return [y > 2, y > titleAfter]
      } action: { _, value in
        state = (value[0], value[1])
        if current { scroll?.scrolled = value[0]; scroll?.titled = value[1] }
      }
      .onChange(of: current) { if current { scroll?.scrolled = state.scrolled; scroll?.titled = state.titled } }
  }
}

// What scrolled content passes under at the top of a sheet: the sheet's own
// glass, ending in a short fade rather than a line. It reaches up through
// the sheet's top edge.
struct EdgeBackdrop: View {
  // Nil fills whatever it sits behind, the fade then hanging below it.
  var height: CGFloat? = nil

  var body: some View {
    VStack(spacing: 0) {
      SheetGround().frame(height: height)
      LinearGradient(colors: [Ink.ground.opacity(0.75), Ink.ground.opacity(0)], startPoint: .top, endPoint: .bottom)
        .frame(height: 16)
    }
    .padding(.bottom, height == nil ? -16 : 0)
    .ignoresSafeArea(edges: .top)
    .allowsHitTesting(false)
  }
}

// The same ground under a bar pinned to the bottom, fading upward so
// content passing under it goes soft instead of being cut.
struct BottomBackdrop: View {
  var body: some View {
    VStack(spacing: 0) {
      LinearGradient(colors: [Ink.ground.opacity(0), Ink.ground.opacity(0.85)], startPoint: .top, endPoint: .bottom)
        .frame(height: 18)
      SheetGround()
    }
    .padding(.top, -18)
    .ignoresSafeArea(edges: .bottom)
    .allowsHitTesting(false)
  }
}

// Room at the top of a page for its bar.
let pageBarHeight: CGFloat = 52

struct SectionTitle: View {
  let text: String
  var body: some View {
    Text(text).font(.captionStrong).foregroundStyle(Ink.tertiary)
  }
}

extension View {
  // Screenshots of long pages: -fp.scroll 0.6 opens the page 60% of the way down.
  @ViewBuilder func debugScroll() -> some View {
    #if DEBUG
    if let value = UserDefaults.standard.string(forKey: "fp.scroll"), let y = Double(value) {
      defaultScrollAnchor(UnitPoint(x: 0.5, y: y))
    } else { self }
    #else
    self
    #endif
  }
}

// A press that answers: a slight give, no highlight box.
struct Press: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .opacity(configuration.isPressed ? 0.8 : 1)
      .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
  }
}

// The one filled control on a screen: light on dark.
struct PrimaryButton: View {
  let title: String
  var busy = false
  var action: () -> Void
  @Environment(\.isEnabled) private var enabled

  var body: some View {
    Button(action: action) {
      ZStack {
        Text(title).opacity(busy ? 0 : 1)
        if busy { ProgressView().tint(.black) }
      }
      .font(.headline)
      .foregroundStyle(.black)
      .frame(maxWidth: .infinity, minHeight: 52)
      .background(Capsule().fill(Ink.primary))
      .opacity(enabled ? 1 : 0.32)
      .contentShape(.capsule)
    }
    .buttonStyle(Press())
  }
}

struct SheetAction {
  var title: String
  var enabled = true
  var busy = false
  var perform: () -> Void
}

// The top of a sheet: its name, and the way out as a bare cross.
struct SheetHeader: View {
  let title: String
  // A form's one action, kept up here where the keyboard never covers it.
  var action: SheetAction? = nil
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title).font(.large)
      Spacer(minLength: 12)
      if let action {
        Button(action: action.perform) {
          ZStack {
            Text(action.title).opacity(action.busy ? 0 : 1)
            if action.busy { ProgressView().controlSize(.small).tint(.black) }
          }
          .font(.bodyStrong)
          .foregroundStyle(.black)
          .padding(.horizontal, 16)
          .frame(minWidth: 64, minHeight: 34)
          .background(Capsule().fill(Ink.primary))
          .opacity(action.enabled ? 1 : 0.32)
          .contentShape(.capsule)
        }
        .buttonStyle(Press())
        .disabled(!action.enabled || action.busy)
        .offset(x: 4)
      }
      Button { dismiss() } label: {
        Image(systemName: "xmark").font(.fp(17, .semibold)).foregroundStyle(Ink.secondary)
          .frame(width: 44, height: 44).contentShape(.rect)
      }
      .buttonStyle(Press())
      .accessibilityLabel(Text("Close"))
      .offset(x: 12)
    }
  }
}

// Pages side by side: swipe to the one before or after; the selection follows,
// and setting the selection pages to it. A swipe that starts at the screen's
// left edge is the system's back, never a page turn.
struct Pager<ID: Hashable, Page: View>: View {
  let ids: [ID]
  @Binding var selection: ID
  @ViewBuilder var page: (ID) -> Page
  @State private var position: ID?

  var body: some View {
    ScrollView(.horizontal) {
      LazyHStack(spacing: 0) {
        ForEach(ids, id: \.self) { id in
          page(id).containerRelativeFrame(.horizontal)
            .environment(\.isCurrentPage, id == selection)
        }
      }
      .scrollTargetLayout()
      .background(YieldToBack())
    }
    .scrollTargetBehavior(.paging)
    .scrollIndicators(.hidden)
    .scrollPosition(id: $position)
    .onAppear { position = selection }
    .onChange(of: position) { if let position, position != selection { selection = position } }
    .onChange(of: selection) { if position != selection { withAnimation(.snappy(duration: 0.32)) { position = selection } } }
  }
}

// Makes the enclosing scroll view wait for the navigation controller's edge
// swipe, so back always wins at the edge.
private struct YieldToBack: UIViewRepresentable {
  func makeUIView(context: Context) -> Probe { Probe() }
  func updateUIView(_ view: Probe, context: Context) {}

  final class Probe: UIView {
    private weak var linked: UIScrollView?

    override func didMoveToWindow() {
      super.didMoveToWindow()
      guard window != nil else { return }
      DispatchQueue.main.async { [weak self] in self?.link() }
    }

    private func link() {
      var view = superview
      while let current = view, !(current is UIScrollView) { view = current.superview }
      var responder: UIResponder? = self
      while let current = responder, (current as? UIViewController)?.navigationController == nil { responder = current.next }
      guard let scroll = view as? UIScrollView, scroll !== linked,
            let pop = (responder as? UIViewController)?.navigationController?.interactivePopGestureRecognizer else { return }
      scroll.panGestureRecognizer.require(toFail: pop)
      linked = scroll
    }
  }
}

// The airline's own colour, read from its mark: the most saturated colours
// weigh most, so a red tail wins over a white field.
enum Livery {
  private static var cache: [String: Color?] = [:]

  static func color(_ code: String) -> Color? {
    if let known = cache[code] { return known }
    let found = AirlineMark.image(code).flatMap(dominant)
    cache[code] = found
    return found
  }

  private static var lightness: [String: Double?] = [:]

  // How light the mark's inked pixels are on average, 0 black to 1 white.
  static func luminance(_ code: String) -> Double? {
    if let known = lightness[code] { return known }
    let found = AirlineMark.image(code).flatMap(averageLuminance)
    lightness[code] = found
    return found
  }

  private static func averageLuminance(_ image: UIImage) -> Double? {
    guard let cg = image.cgImage else { return nil }
    let side = 24
    var pixels = [UInt8](repeating: 0, count: side * side * 4)
    guard let context = CGContext(data: &pixels, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.draw(cg, in: CGRect(x: 0, y: 0, width: side, height: side))
    var sum = 0.0, count = 0.0
    for i in stride(from: 0, to: pixels.count, by: 4) {
      let a = Double(pixels[i + 3]) / 255
      guard a > 0.5 else { continue }
      sum += (0.2126 * Double(pixels[i]) + 0.7152 * Double(pixels[i + 1]) + 0.0722 * Double(pixels[i + 2])) / 255 / a
      count += 1
    }
    return count > 0 ? sum / count : nil
  }

  private static func dominant(_ image: UIImage) -> Color? {
    guard let cg = image.cgImage else { return nil }
    let side = 24
    var pixels = [UInt8](repeating: 0, count: side * side * 4)
    guard let context = CGContext(data: &pixels, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.draw(cg, in: CGRect(x: 0, y: 0, width: side, height: side))
    var sum = SIMD3<Double>.zero, weight = 0.0
    for i in stride(from: 0, to: pixels.count, by: 4) {
      let a = Double(pixels[i + 3]) / 255
      guard a > 0.5 else { continue }
      let c = SIMD3(Double(pixels[i]), Double(pixels[i + 1]), Double(pixels[i + 2])) / 255 / a
      let saturation = (c.max() - c.min()) / max(0.001, c.max())
      let w = a * saturation * saturation * c.max()
      sum += c * w
      weight += w
    }
    guard weight > 2 else { return nil }
    let c = sum / weight
    return Color(red: c.x, green: c.y, blue: c.z)
  }
}

// Swiping back from the left edge still works with the bar hidden.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
  override open func viewDidLoad() {
    super.viewDidLoad()
    interactivePopGestureRecognizer?.delegate = self
  }

  public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    viewControllers.count > 1
  }
}
