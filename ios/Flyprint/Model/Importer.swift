import Foundation
import Observation
import UIKit
import UniformTypeIdentifiers

// An import as the server reads it: files and text go up, the server reads
// them in the background, and the reader ticks what to save. It runs on while
// the sheet is closed, so reading never holds the person on one screen.

struct DraftFields: Codable, Equatable {
  var date, flight, origin, destination, depart, arrive, seat, cabin: String
}

struct DraftChange: Decodable, Equatable {
  var field: String
  var from: String
  var to: String
}

struct DraftRow: Decodable, Identifiable, Equatable {
  var key: String
  var include: Bool
  var state: String
  var problems: [String]
  var fields: DraftFields
  var airline: String
  var upcoming: Bool
  var likely: Bool?
  var changes: [DraftChange]?
  var id: String { key }
  var canSave: Bool { state != "problem" && !(state == "duplicate" && likely != true) }
}

struct Atlas: Decodable {
  var places: [String: Place]
  var carriers: [String: Names]
  var countries: [String: Names]
}

struct ImportProgress: Decodable, Equatable {
  var stage: String
  var done: Int
  var total: Int
}

private struct ImportRecord: Decodable {
  var status: String
  var rows: [DraftRow]
  var progress: ImportProgress?
  var error: String?
  var atlas: Atlas?
}

private struct SaveAnswer: Decodable {
  var changed: Bool?
  var rows: [DraftRow]?
  var atlas: Atlas?
  var added: Int?
  var updated: Int?
  var removed: Int?
}

struct Upload: Identifiable {
  let id = UUID()
  var name: String
  var data: Data
  var type: String
}

@Observable
final class Importer {
  enum Phase: Equatable {
    case idle
    case sending
    case reading(ImportProgress?)
    case review
    case saving
    case saved(added: Int, updated: Int, removed: Int)
    case failed(String)
  }

  private(set) var phase = Phase.idle
  private(set) var rows: [DraftRow] = []
  private(set) var atlas: Atlas?
  private(set) var notice: String?
  var uploads: [Upload] = []
  var text = ""

  private var importID: String?
  private var polling: Task<Void, Never>?
  private let api: API
  private let token: () -> String?
  private let saved: () async -> Void

  init(api: API, token: @escaping () -> String?, saved: @escaping () async -> Void) {
    self.api = api
    self.token = token
    self.saved = saved
  }

  var isBusy: Bool {
    switch phase { case .sending, .reading, .review, .saving: true; default: false }
  }

  var chosen: [DraftRow] { rows.filter { $0.include && $0.canSave } }

  // MARK: Input

  func add(photo data: Data) {
    guard let jpeg = Self.jpeg(data) else { return }
    uploads.append(Upload(name: "photo-\(uploads.count + 1).jpg", data: jpeg, type: "image/jpeg"))
  }

  func add(file url: URL) {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard let data = try? Data(contentsOf: url) else { return }
    let type = UTType(filenameExtension: url.pathExtension)
    // The reader takes PNG, JPEG, WebP and GIF; other pictures (HEIC) go up as JPEG.
    if let type, type.conforms(to: .image), ![UTType.png, .jpeg, .webP, .gif].contains(type), let jpeg = Self.jpeg(data) {
      uploads.append(Upload(name: url.deletingPathExtension().lastPathComponent + ".jpg", data: jpeg, type: "image/jpeg"))
      return
    }
    uploads.append(Upload(name: url.lastPathComponent, data: data, type: type?.preferredMIMEType ?? "application/octet-stream"))
  }

  // Under the reader's 5 MB a picture; long screenshots keep their full height.
  private static func jpeg(_ data: Data) -> Data? {
    guard var image = UIImage(data: data) else { return nil }
    var quality: CGFloat = 0.85
    while true {
      guard let out = image.jpegData(compressionQuality: quality) else { return nil }
      if out.count < 4_800_000 { return out }
      if quality > 0.6 { quality -= 0.1; continue }
      let size = CGSize(width: image.size.width * 0.8, height: image.size.height * 0.8)
      image = UIGraphicsImageRenderer(size: size, format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; return f }()).image { _ in
        image.draw(in: CGRect(origin: .zero, size: size))
      }
    }
  }

  // MARK: Reading

  func start() {
    guard !isBusy, let token = token() else { return }
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !uploads.isEmpty || !text.isEmpty else { return }
    phase = .sending
    notice = nil
    let uploads = uploads
    polling = Task {
      do {
        let id = try await api.startImport(token: token, text: text, uploads: uploads)
        importID = id
        phase = .reading(nil)
        await poll(id: id, token: token)
      } catch let failure as API.Failure {
        phase = .failed(failure.code)
      } catch {
        phase = .failed("server")
      }
    }
  }

  // An import still being read, or read and waiting to be checked (started on
  // the web, or before the app was closed), picks up where it is.
  func resume() {
    guard phase == .idle, polling == nil, let token = token() else { return }
    polling = Task {
      defer { polling = nil }
      guard let open = try? await api.imports(token: token).first(where: { $0.status == "reading" || $0.status == "ready" }),
            phase == .idle else { return }
      importID = open.id
      phase = .reading(nil)
      await poll(id: open.id, token: token)
    }
  }

  private func poll(id: String, token: String) async {
    var misses = 0
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(1.5))
      guard let data = try? await api.importRecord(token: token, id: id),
            let record = try? JSONDecoder().decode(ImportRecord.self, from: data) else {
        misses += 1
        if misses > 20 { phase = .failed("network"); return }
        continue
      }
      misses = 0
      switch record.status {
      case "reading":
        phase = .reading(record.progress)
      case "ready":
        rows = record.rows
        atlas = record.atlas
        phase = .review
        return
      default:
        phase = .failed(record.error ?? "server")
        return
      }
    }
  }

  func toggle(_ row: DraftRow) {
    guard row.canSave, let index = rows.firstIndex(where: { $0.key == row.key }) else { return }
    rows[index].include.toggle()
  }

  func save() {
    guard phase == .review, let id = importID, let token = token() else { return }
    phase = .saving
    let edits: [[String: Any]] = rows.map { ["key": $0.key, "include": $0.include, "fields": [String: String](), "seen": $0.state] }
    Task {
      do {
        let data = try await api.saveImport(token: token, id: id, edits: edits)
        let answer = try JSONDecoder().decode(SaveAnswer.self, from: data)
        if answer.changed == true, let next = answer.rows {
          rows = next
          if let atlas = answer.atlas { self.atlas = atlas }
          notice = "changed"
          phase = .review
          return
        }
        phase = .saved(added: answer.added ?? 0, updated: answer.updated ?? 0, removed: answer.removed ?? 0)
        uploads = []
        self.text = ""
        await saved()
      } catch let failure as API.Failure {
        notice = failure.code
        phase = .review
      } catch {
        notice = "server"
        phase = .review
      }
    }
  }

  func discard() {
    polling?.cancel()
    if let id = importID, let token = token(), phase == .review || phase == .saving {
      Task { await api.discardImport(token: token, id: id) }
    }
    reset()
  }

  func reset() {
    polling?.cancel()
    polling = nil
    importID = nil
    rows = []
    atlas = nil
    notice = nil
    phase = .idle
  }

  // Once its outcome has been seen, a finished or failed import makes way for the next.
  func settle() {
    if case .saved = phase { reset() }
    if case .failed = phase { reset() }
  }
}
