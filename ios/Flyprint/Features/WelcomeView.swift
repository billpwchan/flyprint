import SwiftUI

enum AuthMode: Hashable { case signIn, signUp }

// Signed out, the app opens on the globe with a sample life of flights on it.
// Three short beats say what it does with yours, each shown on the globe, and
// the ways in stay under them throughout.
struct WelcomeView: View {
  @Environment(Store.self) private var store
  @Binding var beat: Int
  @Binding var path: [AuthMode]
  var explore: () -> Void

  var body: some View {
    NavigationStack(path: $path) {
      home
        .toolbar(.hidden, for: .navigationBar)
        .containerBackground(.clear, for: .navigation)
        .navigationDestination(for: AuthMode.self) { mode in
          AuthPage(mode: mode) { path = [mode == .signIn ? .signUp : .signIn] }
            .toolbar(.hidden, for: .navigationBar)
            .containerBackground(.clear, for: .navigation)
        }
    }
  }

  private var home: some View {
    let lang = store.lang
    return VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text(lang.t("航迹", "航跡", "Flyprint")).font(.headline)
        Spacer()
        LanguageSwitch()
      }
      .padding(.leading, 24)
      .padding(.trailing, 12)
      .shadow(color: .black.opacity(0.8), radius: 8)
      Spacer(minLength: 0)
      VStack(alignment: .leading, spacing: 22) {
        TabView(selection: $beat) {
          ForEach(0..<3, id: \.self) { index in
            BeatView(index: index).tag(index).padding(.horizontal, 24)
          }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .frame(height: 196)
        .sensoryFeedback(.selection, trigger: beat)
        HStack(spacing: 7) {
          ForEach(0..<3, id: \.self) { index in
            Capsule().fill(index == beat ? Ink.primary : Ink.faint)
              .frame(width: index == beat ? 18 : 6, height: 6)
              .onTapGesture { withAnimation(.snappy(duration: 0.3)) { beat = index } }
          }
        }
        .animation(.snappy(duration: 0.25), value: beat)
        .padding(.horizontal, 24)
        .accessibilityHidden(true)
        VStack(spacing: 6) {
          PrimaryButton(title: lang.t("创建账户", "建立帳戶", "Create an account")) { path = [.signUp] }
          Button { path = [.signIn] } label: {
            Text(lang.t("我有账户，登录", "我有帳戶，登入", "I have an account")).font(.headline).foregroundStyle(Ink.primary)
              .frame(maxWidth: .infinity, minHeight: 48).contentShape(.rect)
          }
          .buttonStyle(Press())
          Button(action: explore) {
            Text(lang.t("先看看示例", "先看看示例", "Look around the sample first")).font(.body).foregroundStyle(Ink.secondary)
              .frame(maxWidth: .infinity, minHeight: 40).contentShape(.rect)
          }
          .buttonStyle(Press())
        }
        .padding(.horizontal, 24)
      }
      .padding(.top, 36)
      .padding(.bottom, 8)
      .background(alignment: .bottom) {
        LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: Ink.ground.opacity(0.82), location: 0.22), .init(color: Ink.ground.opacity(0.96), location: 1)],
                       startPoint: .top, endPoint: .bottom)
          .padding(.bottom, -60)
          .allowsHitTesting(false)
      }
    }
  }
}

// One beat: a sentence about what the app does, and that thing itself.
private struct BeatView: View {
  @Environment(Store.self) private var store
  let index: Int

  var body: some View {
    let lang = store.lang
    VStack(alignment: .leading, spacing: 10) {
      switch index {
      case 0:
        Text(lang.t("每一次飞行，都画在地球上", "每一次飛行，都畫在地球上", "Every flight you've taken, on one globe")).font(.title)
        Text(lang.t("这是示例旅客 \(store.owner.name) 的 \(store.flown.count) 次飞行。转动地球看看，点一条航线或一个城市。",
                    "這是示例旅客 \(store.owner.name) 的 \(store.flown.count) 次飛行。轉動地球看看，點一條航線或一個城市。",
                    "These are the \(store.flown.count) flights of \(store.owner.name), a sample traveller. Turn the globe; tap a route or a city."))
          .font(.body).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      case 1:
        Text(lang.t("自动分成一次次旅程", "自動分成一次次旅程", "Sorted into trips by itself")).font(.title)
        Text(lang.t("看你在哪里过夜，就知道每次去了哪、住了几晚、怎么回来。", "看你在哪裏過夜，就知道每次去了哪、住了幾晚、怎樣回來。", "Where you spent the nights tells it where each trip went, for how long, and how you came back."))
          .font(.body).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        if let trip = store.showcaseTrip { TripRow(trip: trip, yearInDates: true) {}.allowsHitTesting(false).padding(.top, 6) }
      default:
        Text(lang.t("截图和行程单就能导入", "截圖和行程單就能匯入", "Bring flights in from screenshots")).font(.title)
        Text(lang.t("航旅纵横截图、电子行程单、订票邮件或 Flighty 导出，读出来的航班你核对后保存。", "航旅縱橫截圖、電子行程單、訂票電郵或 Flighty 匯出，讀出來的航班你核對後儲存。", "Umetrip screenshots, e-tickets, booking emails or a Flighty export: check the flights it reads, then save."))
          .font(.body).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 0) {
          ForEach(store.showcaseFlights) { flight in
            VStack(alignment: .leading, spacing: 5) {
              AirlineMark(code: flight.airline, size: 20)
              Text("\(flight.origin)–\(flight.destination)").font(.bodyStrong).monospacedDigit()
              Text(Format.date(flight.date, lang, year: false)).font(.micro).monospacedDigit().foregroundStyle(Ink.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
        .padding(.top, 8)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
  }
}

// 简 繁 EN, as Hong Kong apps put it: each choice in its own script.
struct LanguageSwitch: View {
  @Environment(Store.self) private var store

  var body: some View {
    HStack(spacing: 0) {
      ForEach([(Lang.hans, "简"), (.hant, "繁"), (.en, "EN")], id: \.0) { item, label in
        Button { store.choose(item == Lang.system ? nil : item) } label: {
          Text(label).font(store.lang == item ? .bodyStrong : .body)
            .foregroundStyle(store.lang == item ? Ink.primary : Ink.tertiary)
            .frame(minWidth: 40, minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(Press())
        .accessibilityLabel(Text(item.name))
        .accessibilityAddTraits(store.lang == item ? .isSelected : [])
      }
    }
    .sensoryFeedback(.selection, trigger: store.lang)
  }
}

// Sign in, or create an account. The globe stays behind, darkened; the fields
// are underlines; the button rides above the keyboard; a problem shows under
// the field it belongs to.
struct AuthPage: View {
  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  let mode: AuthMode
  var swap: () -> Void
  @State private var name = ""
  @State private var email = ""
  @State private var password = ""
  @State private var working = false
  @State private var problem: (field: Spot, text: String)?
  @State private var web: URL?
  @FocusState private var focus: Spot?

  enum Spot: Hashable { case name, email, password, general }

  var body: some View {
    let lang = store.lang
    let creating = mode == .signUp
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
          Text(creating ? lang.t("创建账户", "建立帳戶", "Create your account") : lang.t("欢迎回来", "歡迎回來", "Welcome back")).font(.large)
          Text(creating ? lang.t("App 和网页版用同一个账户。", "App 和網頁版用同一個帳戶。", "One account for the app and the web.")
                        : lang.t("用你在航迹网页版的邮箱和密码登录。", "用你在航跡網頁版的電郵和密碼登入。", "Use the email and password from Flyprint on the web."))
            .font(.body).foregroundStyle(Ink.secondary)
        }
        if creating {
          Field(label: lang.t("名字", "名字", "Name"), text: $name, hint: lang.t("同飞的人会看到这个名字", "同飛的人會看到這個名字", "People you fly with see this name"),
                problem: text(for: .name), active: focus == .name)
            .textContentType(.name)
            .focused($focus, equals: .name)
            .submitLabel(.next)
            .onSubmit { focus = .email }
        }
        Field(label: lang.t("邮箱", "電郵", "Email"), text: $email, problem: text(for: .email), active: focus == .email)
          .textContentType(.username)
          .keyboardType(.emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .focused($focus, equals: .email)
          .submitLabel(.next)
          .onSubmit { focus = .password }
        Field(label: lang.t("密码", "密碼", "Password"), text: $password, secure: true,
              hint: creating ? (password.count >= 8 ? lang.t("✓ 够长了", "✓ 夠長了", "✓ Long enough") : lang.t("至少 8 位", "至少 8 位", "At least 8 characters")) : nil,
              problem: text(for: .password), active: focus == .password)
          // Not .newPassword: a generated password, kept without the website's
          // domain, would not be offered when signing in on the web.
          .textContentType(.password)
          .focused($focus, equals: .password)
          .submitLabel(.go)
          .onSubmit(submit)
        if creating { consent }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 24)
      .padding(.top, 4)
      .padding(.bottom, 24)
    }
    .scrollIndicators(.hidden)
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .top, spacing: 0) {
      Button { dismiss() } label: {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left").font(.fp(15, .semibold))
          Text(lang.t("返回", "返回", "Back")).font(.body)
        }
        .foregroundStyle(Ink.primary).frame(minHeight: 44).contentShape(.rect)
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.leading, 20)
      .padding(.bottom, 6)
      .background {
        LinearGradient(colors: [Ink.ground, Ink.ground.opacity(0)], startPoint: UnitPoint(x: 0.5, y: 0.6), endPoint: .bottom)
          .padding(.bottom, -16)
          .ignoresSafeArea()
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(spacing: 4) {
        if let general = text(for: .general) {
          Text(general).font(.caption).foregroundStyle(Palette.warning).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)
        }
        PrimaryButton(title: creating ? lang.t("创建账户", "建立帳戶", "Create account") : lang.t("登录", "登入", "Sign in"), busy: working, action: submit)
          .disabled(working || !ready)
        if focus == nil {
        Button(action: swap) {
          Text(creating ? lang.t("已经有账户了？登录", "已經有帳戶了？登入", "Already have an account? Sign in") : lang.t("还没有账户？创建一个", "還沒有帳戶？建立一個", "New here? Create an account"))
            .font(.body).foregroundStyle(Ink.secondary).frame(maxWidth: .infinity, minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(Press())
        }
      }
      .padding(.horizontal, 24)
      .padding(.top, 12)
      .padding(.bottom, 8)
      .background {
        VStack(spacing: 0) {
          LinearGradient(colors: [Ink.ground.opacity(0), Ink.ground], startPoint: .top, endPoint: .bottom).frame(height: 24)
          Ink.ground
        }
        .padding(.top, -24)
        .ignoresSafeArea()
      }
    }
    .background(Ink.ground.opacity(0.9).ignoresSafeArea())
    .sheet(item: $web) { url in WebPage(url: url).ignoresSafeArea() }
    .sensoryFeedback(.error, trigger: problem?.text)
    .onAppear { focus = creating ? .name : .email }
  }

  private var consent: some View {
    let lang = store.lang
    let terms = API.origin.appending(path: "terms"), privacy = API.origin.appending(path: "privacy")
    let line = lang.t("创建账户即表示同意[使用条款](\(terms))和[隐私政策](\(privacy))。",
                      "建立帳戶即表示同意[使用條款](\(terms))和[私隱政策](\(privacy))。",
                      "By creating an account you agree to the [Terms](\(terms)) and [Privacy Policy](\(privacy)).")
    return Text(.init(line))
      .font(.caption).foregroundStyle(Ink.tertiary).tint(Ink.secondary)
      .environment(\.openURL, OpenURLAction { url in web = url; return .handled })
  }

  private var ready: Bool {
    !email.isEmpty && !password.isEmpty && (mode == .signIn || (password.count >= 8 && !name.trimmingCharacters(in: .whitespaces).isEmpty))
  }

  private func text(for spot: Spot) -> String? { problem?.field == spot ? problem?.text : nil }

  private func submit() {
    guard !working, ready else { return }
    let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard address.contains("@"), address.contains(".") else {
      problem = (.email, problemText("email", store.lang)); focus = .email; return
    }
    working = true; problem = nil
    Task {
      defer { working = false }
      do {
        if mode == .signUp { try await store.signUp(name: name.trimmingCharacters(in: .whitespaces), email: address, password: password) }
        else { try await store.signIn(email: address, password: password) }
      } catch {
        let code = (error as? API.Failure)?.code ?? "server"
        let spot: Spot = switch code {
        case "credentials", "password_short", "password_long": .password
        case "email", "taken": .email
        case "name": .name
        default: .general
        }
        problem = (spot, problemText(code, store.lang))
        if spot != .general { focus = spot }
      }
    }
  }
}

extension Store {
  // The sample trip the welcome shows: the latest round trip of three or more flights.
  var showcaseTrip: Trip? {
    trips.filter { $0.kind == "round" && $0.flightIds.count >= 3 && legs(of: $0).allSatisfy { $0.hasLanded(at: now) } }
      .max { $0.start < $1.start }
  }

  // Three long flights of the last few years on three airlines, as an import
  // would read them: far apart on the globe, so each draws its own arc.
  var showcaseFlights: [Flight] {
    var airlines = Set<String>(), routes = Set<String>()
    let recent = flown.suffix(80).sorted { $0.km > $1.km }
    return recent.filter { airlines.insert($0.airline).inserted && routes.insert([metroOf($0.origin), metroOf($0.destination)].sorted().joined()).inserted }
      .prefix(3).sorted { $0.date < $1.date }
  }
}
