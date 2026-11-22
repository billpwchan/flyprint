import SafariServices
import SwiftUI

// Who you are and the few things a person changes: the language, the name
// others see, the password, a copy of everything, and leaving.
struct SettingsView: View {
  @Environment(Store.self) private var store
  @State private var path: [Page] = []
  @State private var leaving = false
  @State private var exported: URL?
  @State private var exporting = false
  @State private var problem: String?
  @State private var web: URL?
  @State private var scrolled = false

  enum Page: Hashable { case name, password, credits, delete }

  var body: some View {
    let lang = store.lang
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: 36) {
          if let viewer = store.response.viewer { header(viewer) }
          LanguageChoice()
          ReminderChoice()
          group(lang.t("账户", "帳戶", "Account")) {
            SettingsRow(title: lang.t("名字", "名字", "Name"), value: store.response.viewer?.name) { path.append(.name) }
            SettingsRow(title: lang.t("密码", "密碼", "Password")) { path.append(.password) }
            SettingsRow(title: lang.t("导出全部航班", "匯出全部航班", "Export all flights"), kind: exporting ? .busy : .plain, action: export)
            if let problem { Text(problem).font(.caption).foregroundStyle(Palette.warning) }
          }
          group(lang.t("关于", "關於", "About")) {
            SettingsRow(title: lang.t("网页版", "網頁版", "On the web"), value: "flyprint.billpwchan.art", kind: .external) { web = API.origin }
            SettingsRow(title: lang.t("数据与影像来源", "數據與影像來源", "Data and imagery")) { path.append(.credits) }
            SettingsRow(title: lang.t("隐私政策", "私隱政策", "Privacy"), kind: .external) { web = API.origin.appending(path: "privacy") }
            SettingsRow(title: lang.t("使用条款", "使用條款", "Terms"), kind: .external) { web = API.origin.appending(path: "terms") }
          }
          VStack(alignment: .leading, spacing: 4) {
            Button { leaving = true } label: {
              Text(lang.t("退出登录", "登出", "Sign out")).font(.bodyStrong).foregroundStyle(Ink.primary)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(.rect)
            }
            .buttonStyle(Press())
            Button { path.append(.delete) } label: {
              Text(lang.t("删除账户", "刪除帳戶", "Delete account")).font(.body).foregroundStyle(Palette.danger)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(.rect)
            }
            .buttonStyle(Press())
            Text(version).font(.micro).monospacedDigit().foregroundStyle(Ink.faint).padding(.top, 18)
          }
        }
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .padding(.bottom, 40)
      }
      .scrollIndicators(.hidden)
      .scrolledOffTop($scrolled)
      .safeAreaInset(edge: .top, spacing: 0) {
        SheetHeader(title: lang.t("设置", "設定", "Settings")).padding(.horizontal, 24).padding(.top, 18).padding(.bottom, 4)
          .background { EdgeBackdrop().opacity(scrolled ? 1 : 0) }
      }
      .toolbar(.hidden, for: .navigationBar)
      .containerBackground(.clear, for: .navigation)
      .navigationDestination(for: Page.self) { page in
        Group {
          switch page {
          case .name: NameEditor()
          case .password: PasswordEditor()
          case .credits: Credits()
          case .delete: DeleteAccount()
          }
        }
        .toolbar(.hidden, for: .navigationBar)
        .containerBackground(.clear, for: .navigation)
      }
    }
    .confirmationDialog(lang.t("退出登录？", "登出？", "Sign out?"), isPresented: $leaving, titleVisibility: .visible) {
      Button(lang.t("退出登录", "登出", "Sign out"), role: .destructive) { Task { await store.signOut() } }
    } message: {
      Text(lang.t("航班都还在账户里，再登录就能看到。", "航班都還在帳戶裏，再登入就能看到。", "Your flights stay in your account for when you sign in again."))
    }
    .sheet(item: $exported) { url in ShareSheet(items: [url]).presentationDetents([.medium, .large]) }
    .sheet(item: $web) { url in WebPage(url: url).ignoresSafeArea() }
    .presentationDetents([.large])
    .presentationBackground { SheetGround() }
    .presentationDragIndicator(.visible)
  }

  private func header(_ viewer: Viewer) -> some View {
    let lang = store.lang
    let flown = store.flown
    let since = flown.map(\.year).min()
    return VStack(alignment: .leading, spacing: 6) {
      Text(viewer.name).font(.display).lineLimit(1).minimumScaleFactor(0.6)
      Text(viewer.email).font(.body).foregroundStyle(Ink.secondary).lineLimit(1).truncationMode(.middle)
      if !flown.isEmpty, let since {
        Text(lang.t("\(flown.count) 次飞行 · 自 \(String(since)) 年", "\(flown.count) 次飛行 · 自 \(String(since)) 年", "\(flown.count) flights since \(String(since))"))
          .font(.body).monospacedDigit().foregroundStyle(store.tone).padding(.top, 6)
      }
    }
  }

  private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      SectionTitle(text: title).padding(.bottom, 4)
      content()
    }
  }

  private var version: String {
    let info = Bundle.main.infoDictionary
    return "航迹 Flyprint \(info?["CFBundleShortVersionString"] as? String ?? "") (\(info?["CFBundleVersion"] as? String ?? ""))"
  }

  private func export() {
    guard !exporting else { return }
    exporting = true; problem = nil
    Task {
      defer { exporting = false }
      do { exported = try await store.exportFile() } catch {
        problem = problemText((error as? API.Failure)?.code ?? "server", store.lang)
      }
    }
  }
}

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }

// One line of settings: what it is, what it is set to, and where a tap goes.
struct SettingsRow: View {
  enum Kind { case push, external, plain, busy }
  let title: String
  var value: String? = nil
  var kind: Kind = .push
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Text(title).font(.body).foregroundStyle(Ink.primary)
        Spacer(minLength: 12)
        if let value { Text(value).font(.body).foregroundStyle(Ink.tertiary).lineLimit(1).truncationMode(.middle) }
        switch kind {
        case .push: Image(systemName: "chevron.right").font(.captionStrong).foregroundStyle(Ink.faint)
        case .external: Image(systemName: "arrow.up.right").font(.captionStrong).foregroundStyle(Ink.faint)
        case .busy: ProgressView().controlSize(.small).tint(Ink.secondary)
        case .plain: EmptyView()
        }
      }
      .frame(minHeight: 48)
      .contentShape(.rect)
    }
    .buttonStyle(Press())
    .disabled(kind == .busy)
  }
}

// Check-in and leave-for-the-airport reminders for every flight ahead.
struct ReminderChoice: View {
  @Environment(Store.self) private var store
  @AppStorage(Reminders.key) private var reminding = false
  @State private var refused = false

  var body: some View {
    let lang = store.lang
    VStack(alignment: .leading, spacing: 2) {
      SectionTitle(text: lang.t("提醒", "提醒", "Reminders")).padding(.bottom, 4)
      Toggle(isOn: Binding(get: { reminding }, set: { on in
        Task {
          if on { reminding = await Reminders.enable(); refused = !reminding; if reminding { await Reminders.schedule(store) } }
          else { await Reminders.disable(); reminding = false }
        }
      })) {
        VStack(alignment: .leading, spacing: 3) {
          Text(lang.t("行前提醒", "行前提醒", "Before each flight")).font(.body).foregroundStyle(Ink.primary)
          Text(refused
               ? lang.t("通知没有打开，可以在 iPhone 的「设置 → 通知」里打开", "通知沒有打開，可以在 iPhone 的「設定 → 通知」裏打開", "Notifications are off; turn them on in the iPhone's Settings")
               : lang.t("起飞前 24 小时提醒值机，2 到 3 小时前提醒出发", "起飛前 24 小時提醒登記，2 至 3 小時前提醒出發", "Check-in a day before, and when to leave"))
            .font(.caption).foregroundStyle(refused ? Palette.warning : Ink.tertiary)
        }
        .padding(.trailing, 12)
      }
      .tint(store.tone)
      .frame(minHeight: 56)
    }
  }
}

// The language, switched in place. Following the phone is the first choice,
// and it says which language that is.
struct LanguageChoice: View {
  @Environment(Store.self) private var store

  var body: some View {
    let lang = store.lang
    let chosen = Lang.chosen
    VStack(alignment: .leading, spacing: 2) {
      SectionTitle(text: lang.t("语言", "語言", "Language")).padding(.bottom, 4)
      option(lang.t("跟随手机", "跟隨手機", "Same as phone"), detail: Lang.system.name, selected: chosen == nil) { store.choose(nil) }
      ForEach([Lang.hans, .hant, .en], id: \.self) { item in
        option(item.name, detail: nil, selected: chosen == item) { store.choose(item) }
      }
    }
    .sensoryFeedback(.selection, trigger: chosen)
  }

  private func option(_ title: String, detail: String?, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Text(title).font(selected ? .bodyStrong : .body).foregroundStyle(selected ? Ink.primary : Ink.secondary)
        if let detail { Text(detail).font(.caption).foregroundStyle(Ink.tertiary) }
        Spacer(minLength: 12)
        if selected { Image(systemName: "checkmark").font(.captionStrong).foregroundStyle(store.tone) }
      }
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(Press())
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

// A page inside the settings: back, a title, then its few fields.
struct SettingsPage<Content: View>: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  let title: String
  @ViewBuilder var content: Content

  @State private var scrolled = false
  @State private var titled = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        Text(title).font(.large)
        content
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 24)
      .padding(.top, 6)
      .padding(.bottom, 40)
    }
    .scrollIndicators(.hidden)
    .scrollDismissesKeyboard(.interactively)
    .onScrollGeometryChange(for: [Bool].self) { geometry in
      let y = geometry.contentOffset.y + geometry.contentInsets.top
      return [y > 2, y > 34]
    } action: { _, value in
      withAnimation(.easeOut(duration: 0.2)) { scrolled = value[0]; titled = value[1] }
    }
    .safeAreaInset(edge: .top, spacing: 0) {
      // Back stays put; the page's name joins it once the big title has gone under.
      Button { dismiss() } label: {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left").font(.fp(15, .semibold))
          Text(store.lang.t("设置", "設定", "Settings")).font(.body)
        }
        .foregroundStyle(Ink.primary).frame(minHeight: 44).contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(store.lang.t("设置", "設定", "Settings")))
      .accessibilityHint(Text(store.lang.t("返回", "返回", "Goes back")))
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay {
        Text(title).font(.bodyStrong).foregroundStyle(Ink.primary).lineLimit(1).frame(maxWidth: 200)
          .opacity(titled ? 1 : 0).offset(y: titled ? 0 : 6).accessibilityHidden(!titled)
      }
      .padding(.horizontal, 20)
      .padding(.top, 18)
      .background { EdgeBackdrop().opacity(scrolled ? 1 : 0) }
    }
  }
}

struct NameEditor: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var working = false
  @State private var problem: String?
  @FocusState private var focused: Bool

  var body: some View {
    let lang = store.lang
    SettingsPage(title: lang.t("名字", "名字", "Name")) {
      Text(lang.t("同飞的人看到的是这个名字。", "同飛的人看到的是這個名字。", "This is the name people you fly with see."))
        .font(.body).foregroundStyle(Ink.secondary)
      Field(label: lang.t("名字", "名字", "Name"), text: $name, problem: problem, active: focused)
        .textContentType(.name)
        .focused($focused)
        .submitLabel(.done)
        .onSubmit(save)
      PrimaryButton(title: lang.t("保存", "儲存", "Save"), busy: working, action: save)
        .disabled(working || name.trimmingCharacters(in: .whitespaces).isEmpty || name == store.response.viewer?.name)
    }
    .onAppear { name = store.response.viewer?.name ?? ""; focused = true }
  }

  private func save() {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    guard !working, !trimmed.isEmpty else { return }
    working = true; problem = nil
    Task {
      defer { working = false }
      do { try await store.rename(trimmed); dismiss() } catch {
        problem = problemText((error as? API.Failure)?.code ?? "server", store.lang)
      }
    }
  }
}

struct PasswordEditor: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var current = ""
  @State private var next = ""
  @State private var working = false
  @State private var problem: (field: Int, text: String)?
  @State private var done = false
  @FocusState private var field: Int?

  var body: some View {
    let lang = store.lang
    SettingsPage(title: lang.t("修改密码", "修改密碼", "Change password")) {
      if done {
        Label(lang.t("密码已更新。其他设备需要用新密码重新登录。", "密碼已更新。其他裝置需要用新密碼重新登入。", "Password changed. Other devices will need the new one to sign in again."), systemImage: "checkmark")
          .font(.body).foregroundStyle(Ink.primary)
      } else {
        Field(label: lang.t("现在的密码", "現在的密碼", "Current password"), text: $current, secure: true, problem: problem?.field == 0 ? problem?.text : nil, active: field == 0)
          .textContentType(.password)
          .focused($field, equals: 0)
          .submitLabel(.next)
          .onSubmit { field = 1 }
        Field(label: lang.t("新密码", "新密碼", "New password"), text: $next, secure: true,
              hint: lang.t("至少 8 位", "至少 8 位", "At least 8 characters"), problem: problem?.field == 1 ? problem?.text : nil, active: field == 1)
          .textContentType(.password)
          .focused($field, equals: 1)
          .submitLabel(.done)
          .onSubmit(save)
        PrimaryButton(title: lang.t("更新密码", "更新密碼", "Update password"), busy: working, action: save)
          .disabled(working || current.isEmpty || next.count < 8)
      }
    }
    .onAppear { field = 0 }
    .sensoryFeedback(.success, trigger: done)
    .sensoryFeedback(.error, trigger: problem?.text)
  }

  private func save() {
    guard !working, !current.isEmpty, next.count >= 8 else { return }
    working = true; problem = nil
    Task {
      defer { working = false }
      do {
        try await store.changePassword(current: current, next: next)
        withAnimation(.easeOut(duration: 0.2)) { done = true }
        field = nil
      } catch {
        let code = (error as? API.Failure)?.code ?? "server"
        problem = (code == "credentials" ? 0 : 1, problemText(code == "credentials" ? "current_password" : code, store.lang))
      }
    }
  }
}

struct DeleteAccount: View {
  @Environment(Store.self) private var store
  @State private var password = ""
  @State private var working = false
  @State private var problem: String?

  var body: some View {
    let lang = store.lang
    let count = store.archive.flights.count
    SettingsPage(title: lang.t("删除账户", "刪除帳戶", "Delete account")) {
      Text(lang.t("会删除这个账户、\(count) 段航班、所有导入记录和同飞的连接，网页版也一样，删除后无法恢复。需要的话先导出一份。",
                  "會刪除這個帳戶、\(count) 段航班、所有匯入記錄和同飛的連結，網頁版也一樣，刪除後無法恢復。需要的話先匯出一份。",
                  "This deletes the account, its \(count) flights, every import and every link with people you fly with, on the web too. It can't be undone; export a copy first if you want one."))
        .font(.body).foregroundStyle(Ink.secondary)
      Field(label: lang.t("输入密码确认", "輸入密碼確認", "Password to confirm"), text: $password, secure: true, problem: problem)
        .textContentType(.password)
        .submitLabel(.done)
      Button(action: delete) {
        ZStack {
          Text(lang.t("删除账户和全部航班", "刪除帳戶和全部航班", "Delete account and all flights")).opacity(working ? 0 : 1)
          if working { ProgressView().tint(.white) }
        }
        .font(.headline)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(Capsule().fill(Palette.danger.opacity(password.isEmpty ? 0.3 : 0.9)))
        .contentShape(.capsule)
      }
      .buttonStyle(Press())
      .disabled(working || password.isEmpty)
    }
    .sensoryFeedback(.error, trigger: problem)
  }

  private func delete() {
    guard !working, !password.isEmpty else { return }
    working = true; problem = nil
    Task {
      defer { working = false }
      do { try await store.deleteAccount(password: password) } catch {
        problem = problemText((error as? API.Failure)?.code ?? "server", store.lang)
      }
    }
  }
}

// Where the pictures and names come from.
struct Credits: View {
  @Environment(Store.self) private var store

  var body: some View {
    let lang = store.lang
    SettingsPage(title: lang.t("数据与影像来源", "數據與影像來源", "Data and imagery")) {
      VStack(alignment: .leading, spacing: 22) {
        credit(lang.t("城市与机场影像", "城市與機場影像", "City and airport imagery"), lang.t("Apple 地图卫星影像", "Apple 地圖衛星影像", "Apple Maps satellite imagery"))
        credit(lang.t("飞机照片", "飛機照片", "Aircraft photos"), lang.t("Planespotters.net，版权归各位摄影师所有", "Planespotters.net，版權歸各位攝影師所有", "Planespotters.net; each photo belongs to its photographer"))
        credit(lang.t("地球照片", "地球照片", "Earth photographs"), lang.t("NASA 的 Blue Marble（白天）与 Black Marble（夜间灯光）", "NASA 的 Blue Marble（白天）與 Black Marble（夜間燈光）", "NASA Blue Marble (day) and Black Marble (city lights)"))
        credit(lang.t("天气", "天氣", "Weather"), lang.t("Open-Meteo.com，CC BY 4.0；由航迹的服务器查询，只发出机场位置和日期", "Open-Meteo.com，CC BY 4.0；由航跡的伺服器查詢，只送出機場位置和日期", "Open-Meteo.com, CC BY 4.0; asked by Flyprint's server with only an airport's position and dates"))
        credit(lang.t("国家轮廓", "國家輪廓", "Country outlines"), "Natural Earth · world-atlas")
        credit(lang.t("航空公司标志", "航空公司標誌", "Airline marks"), lang.t("各航空公司的商标，仅用于识别", "各航空公司的商標，僅用於識別", "Trademarks of their airlines, shown to identify them"))
      }
    }
  }

  private func credit(_ title: String, _ detail: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.bodyStrong)
      Text(detail).font(.body).foregroundStyle(Ink.secondary)
    }
  }
}

// A field drawn as an underline that lights in the person's colour while
// typing; its name rises above it once there is text. A problem replaces the
// hint under it.
struct Field: View {
  @Environment(Store.self) private var store
  let label: String
  @Binding var text: String
  var secure = false
  var hint: String? = nil
  var problem: String? = nil
  // Whether the field has the keyboard; the caller owns the focus.
  var active = false
  @State private var revealed = false
  @State private var shake = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label).font(.caption).foregroundStyle(active ? store.tone : Ink.tertiary)
        .opacity(text.isEmpty ? 0 : 1)
        .offset(y: text.isEmpty ? 10 : 0)
        .accessibilityHidden(true)
      HStack(spacing: 8) {
        Group {
          if secure && !revealed {
            SecureField("", text: $text, prompt: Text(label).foregroundStyle(Ink.tertiary))
          } else {
            TextField("", text: $text, prompt: Text(label).foregroundStyle(Ink.tertiary))
          }
        }
        .font(.fp(18, relativeTo: .body))
        .foregroundStyle(Ink.primary)
        .tint(store.tone)
        .accessibilityLabel(Text(label))
        if secure && !text.isEmpty {
          Button { revealed.toggle() } label: {
            Image(systemName: revealed ? "eye.slash" : "eye").font(.fp(15)).foregroundStyle(Ink.tertiary)
              .frame(width: 36, height: 36).contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(store.lang.t(revealed ? "隐藏密码" : "显示密码", revealed ? "隱藏密碼" : "顯示密碼", revealed ? "Hide password" : "Show password")))
        }
      }
      .frame(minHeight: 36)
      Rectangle()
        .fill(problem != nil ? Palette.warning : (active ? store.tone : Ink.faint))
        .frame(height: active || problem != nil ? 1.5 : 1)
      if let message = problem ?? hint {
        Text(message).font(.caption).foregroundStyle(problem != nil ? Palette.warning : Ink.tertiary)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .modifier(Shake(times: shake))
    .animation(.easeOut(duration: 0.18), value: active)
    .animation(.easeOut(duration: 0.18), value: text.isEmpty)
    .onChange(of: problem) { if problem != nil { withAnimation(.linear(duration: 0.3)) { shake += 1 } } }
  }
}

// A short sideways shake for a field whose answer was wrong.
struct Shake: GeometryEffect {
  var animatableData: CGFloat
  init(times: Int) { animatableData = CGFloat(times) }

  func effectValue(size: CGSize) -> ProjectionTransform {
    ProjectionTransform(CGAffineTransform(translationX: 6 * sin(animatableData * .pi * 4), y: 0))
  }
}

struct ShareSheet: UIViewControllerRepresentable {
  let items: [Any]
  // Told whether the share went through (false when cancelled).
  var done: ((Bool) -> Void)? = nil
  func makeUIViewController(context: Context) -> UIActivityViewController {
    let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
    controller.completionWithItemsHandler = { _, completed, _, _ in done?(completed) }
    return controller
  }
  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

// A page of the website, opened inside the app.
struct WebPage: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> SFSafariViewController {
    let controller = SFSafariViewController(url: url)
    controller.preferredControlTintColor = .white
    controller.preferredBarTintColor = UIColor(red: 7 / 255, green: 8 / 255, blue: 11 / 255, alpha: 1)
    return controller
  }
  func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
