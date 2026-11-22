import SwiftUI

@main
struct FlyprintApp: App {
  @State private var store = Store()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(store)
        .environment(\.locale, store.lang.locale)
        .preferredColorScheme(.dark)
        .task { await store.refresh() }
    }
  }
}
