import Combine
import CryptoKit
import Foundation
import SwiftUI
import UIKit

/// Where a comment was pinned. The field names are the stored report contract (`screenComment`);
/// renaming one breaks earlier drafts and every reader of submitted reports.
public struct ScreenCommentMetadata: Codable {
    public let pinX: Double
    public let pinY: Double
    public let screenWidth: Double
    public let screenHeight: Double
    public let screenID: String
    public let elementID: String?
    public let elementClass: String
    public let anchorKind: String
    public let anchorX: Double
    public let anchorY: Double
    public let osVersion: String
    public let deviceModel: String
    public let buildNumber: String
    public let locale: String

    public var firestoreData: [String: Any] {
        var data: [String: Any] = [
            "pinX": pinX,
            "pinY": pinY,
            "screenWidth": screenWidth,
            "screenHeight": screenHeight,
            "screenID": screenID,
            "elementClass": elementClass,
            "anchorKind": anchorKind,
            "anchorX": anchorX,
            "anchorY": anchorY,
            "osVersion": osVersion,
            "deviceModel": deviceModel,
            "buildNumber": buildNumber,
            "locale": locale,
        ]
        if let elementID { data["elementID"] = elementID }
        return data
    }
}

@MainActor
public final class ScreenCommentLiveTarget {
    public weak var view: UIView?
    public let pointInView: CGPoint
    public let screenID: String
    public let screenPoint: CGPoint

    public init(view: UIView?, pointInView: CGPoint, screenID: String, screenPoint: CGPoint) {
        self.view = view
        self.pointInView = pointInView
        self.screenID = screenID
        self.screenPoint = screenPoint
    }

    public func position(in window: UIWindow, currentScreenID: String) -> CGPoint? {
        guard currentScreenID == screenID else { return nil }
        guard let view else { return nil }
        guard view.isDescendant(of: window) else { return nil }
        var ancestor: UIView? = view
        while let current = ancestor, current !== window {
            guard !current.isHidden, current.alpha > 0.01 else { return nil }
            ancestor = current.superview
        }
        // UIKit's coordinate conversion includes a scroll view's content offset.
        // The saved point is local to the target, never a frozen screen position.
        let point = view.convert(pointInView, to: window)
        guard window.bounds.contains(point) else { return nil }
        ancestor = view
        while let current = ancestor {
            if let scroll = current as? UIScrollView {
                let local = window.convert(point, to: scroll)
                guard scroll.bounds.contains(local) else { return nil }
            }
            ancestor = current.superview
        }
        return point
    }
}

@MainActor
public enum ScreenCommentTargetResolver {
    /// Navigation titles of the toolkit's own sheets, which never name the screen under comment. The
    /// host adds its reviewer's conversation title when AI review is on.
    public static var ownTitles: Set<String> = defaultOwnTitles
    public static let defaultOwnTitles: Set<String> = ["Add comment", "Edit comment", "Screen comments"]

    public static func screenID(in window: UIWindow, tab: String) -> String {
        let title = navigationTitle(in: window)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = title.flatMap { $0.isEmpty ? nil : $0 } ?? tab
        var presentationParts: [String] = []
        var presented = window.rootViewController?.presentedViewController
        while let controller = presented {
            guard controller.view.isDescendant(of: window),
                !controller.view.isHidden,
                controller.view.alpha > 0.01,
                !isOwnSheet(controller)
            else { break }
            let marker =
                sheetMarker(in: controller.view)
                ?? String(describing: ObjectIdentifier(controller))
            presentationParts.append("sheet\(presentationParts.count + 1):\(String(marker.prefix(32)))")
            if presentationParts.count == 3 { break }
            presented = controller.presentedViewController
        }
        let presentation = presentationParts.isEmpty ? "" : "/" + presentationParts.joined(separator: "/")
        return String("\(tab)/\(label)".prefix(max(0, 160 - presentation.count))) + presentation
    }

    /// From the touched view up to the window: the nearest view with an accessibility identifier,
    /// the nearest scroll view, and the element to pin to, which is the identified view only when it
    /// sits inside that scroll view (or there is none).
    private static func anchors(from hitView: UIView?, in window: UIWindow)
        -> (element: UIView?, scroll: UIScrollView?, identified: UIView?)
    {
        var identified: UIView?
        var scroll: UIScrollView?
        var cursor = hitView
        while let view = cursor, view !== window {
            if identified == nil, let id = view.accessibilityIdentifier, !id.isEmpty { identified = view }
            if scroll == nil, let found = view as? UIScrollView { scroll = found }
            cursor = view.superview
        }
        // A screen-level accessibility identifier often wraps a SwiftUI List. It
        // must not win over the scroll container or the pin will stay on the glass.
        let element: UIView? =
            if let identified {
                if let scroll {
                    identified !== scroll && identified.isDescendant(of: scroll)
                        ? identified : nil
                } else {
                    identified
                }
            } else { nil }
        return (element, scroll, identified)
    }

    public static func capture(
        in window: UIWindow, point: CGPoint, hitView: UIView?, tab: String
    ) -> (ScreenCommentMetadata, ScreenCommentLiveTarget) {
        let screen = screenID(in: window, tab: tab)
        let (element, scroll, identified) = anchors(from: hitView, in: window)
        let anchorView: UIView? = element ?? scroll ?? identified
        let local = anchorView?.convert(point, from: window) ?? point
        let kind = element != nil ? "element" : (scroll != nil ? "scroll" : "screen")
        let x = anchorView == nil ? point.x : local.x
        let y = anchorView == nil ? point.y : local.y
        let metadata = ScreenCommentMetadata(
            pinX: min(1, max(0, point.x / window.bounds.width)),
            pinY: min(1, max(0, point.y / window.bounds.height)),
            screenWidth: window.bounds.width,
            screenHeight: window.bounds.height,
            screenID: screen,
            elementID: anchorView?.accessibilityIdentifier.map { String($0.prefix(160)) },
            elementClass: String(String(describing: type(of: anchorView ?? hitView ?? window)).prefix(160)),
            anchorKind: kind,
            anchorX: x,
            anchorY: y,
            osVersion: UIDevice.current.systemVersion,
            deviceModel: UIDevice.current.model,
            buildNumber: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown",
            locale: Locale.current.identifier
        )
        return (
            metadata,
            ScreenCommentLiveTarget(
                view: anchorView, pointInView: local, screenID: screen, screenPoint: point)
        )
    }

    private static func navigationTitle(in view: UIView) -> String? {
        if let bar = view as? UINavigationBar, !bar.isHidden,
            let title = bar.topItem?.title, !title.isEmpty,
            !ownTitles.contains(title)
        {
            return title
        }
        for child in view.subviews.reversed() {
            if let title = navigationTitle(in: child) { return title }
        }
        return nil
    }

    private static func isOwnSheet(_ controller: UIViewController) -> Bool {
        let titles = ownTitles
        if let title = controller.title, titles.contains(title) { return true }
        func containsTitle(_ view: UIView) -> Bool {
            if let bar = view as? UINavigationBar,
                let title = bar.topItem?.title, titles.contains(title)
            {
                return true
            }
            return view.subviews.contains(where: containsTitle)
        }
        return containsTitle(controller.view)
    }

    private static func sheetMarker(in view: UIView) -> String? {
        guard !view.isHidden, view.alpha > 0.01 else { return nil }
        if let id = view.accessibilityIdentifier,
            id.lowercased().hasSuffix("screen")
        {
            return id
        }
        for child in view.subviews.reversed() {
            if let marker = sheetMarker(in: child) { return marker }
        }
        return nil
    }
}

public struct ScreenCommentCandidate: Identifiable {
    public let id: UUID
    public let image: UIImage
    public let jpeg: Data
    public let metadata: ScreenCommentMetadata
    public let liveTarget: ScreenCommentLiveTarget
    public let capturedAt: Date
    public let snapshot: QASnapshot?

    public init(
        id: UUID = UUID(), image: UIImage, jpeg: Data, metadata: ScreenCommentMetadata,
        liveTarget: ScreenCommentLiveTarget, capturedAt: Date = Date(), snapshot: QASnapshot? = nil
    ) {
        self.id = id
        self.image = image
        self.jpeg = jpeg
        self.metadata = metadata
        self.liveTarget = liveTarget
        self.capturedAt = capturedAt
        self.snapshot = snapshot
    }
}

/// One saved comment. Its id is the submitted report's id, and the Codable keys are the on-device
/// draft format: drafts written by earlier builds (without `snapshot`, or with `qa` nil) still load.
public struct ScreenCommentRecord: Codable, Identifiable {
    public let id: String
    /// The host's report kind, stored as its raw value.
    public let kindRaw: String
    public internal(set) var message: String
    public let metadata: ScreenCommentMetadata
    public let capturedAt: Date
    public var uploaded: Bool
    // A failed request may have committed remotely. Retrying must keep its original payload.
    var sendStarted: Bool? = nil
    public var qa: ScreenCommentReviewState?
    public var snapshot: QASnapshot? = nil

    /// An existing report only confirms a retry if it contains the text being sent. Older drafts
    /// may have lost the original send's acknowledgment before the app recorded it locally.
    public static func requireMatchingSentMessage(_ stored: String?, expected: String) throws {
        guard stored == expected else { throw ScreenCommentSessionError.previouslySentDifferentText }
    }
}

public enum ScreenCommentQAStatus: String, Codable {
    case pending
    case checking
    case ready
    case question
    case unavailable
}

public struct ScreenCommentReviewState: Codable {
    public var status: ScreenCommentQAStatus = .pending
    public var question: String?
    public var handoff: String?
    public var turns: [ScreenCommentQATurn] = []
    public var repositoryContextUsed = false
    public var error: String?

    public init() {}
}

public struct ScreenCommentQATurn: Codable, Identifiable {
    public let id: String
    public let role: String
    public let text: String

    public init(role: String, text: String) {
        id = UUID().uuidString
        self.role = role
        self.text = text
    }
}

public struct ScreenCommentQAReply: Decodable {
    public let reply: String
    public let handoff: String
    public let ready: Bool
    public let question: String?
    public let repositoryContextUsed: Bool?

    public init(reply: String, handoff: String, ready: Bool, question: String?, repositoryContextUsed: Bool?) {
        self.reply = reply
        self.handoff = handoff
        self.ready = ready
        self.question = question
        self.repositoryContextUsed = repositoryContextUsed
    }
}

/// Optional AI review of each saved comment. A host opts in by passing one to the session; without
/// it the toolkit never starts a review, and Send All works as before.
@MainActor
public protocol ScreenCommentReviewer {
    /// The reviewer's name in status copy ("Sample Reviewer").
    var name: String { get }
    /// The navigation title of `conversation`, which the target resolver must ignore.
    var conversationTitle: String { get }
    func review(record: ScreenCommentRecord, image: UIImage?, turns: [ScreenCommentQATurn]) async throws
        -> ScreenCommentQAReply
    /// The clarifying conversation for one comment, pushed from Review.
    func conversation(session: ScreenCommentSession, recordID: String, onSend: @escaping () -> Void) -> AnyView
}

/// A finite background assertion that keeps a send running briefly after the app leaves the
/// foreground. The host may substitute its own.
@MainActor
public protocol ScreenQABackgroundRuntime: AnyObject {
    @discardableResult
    func beginFallback(name: String, expirationHandler: @escaping @Sendable () -> Void) -> Bool
    func endFallback()
}

@MainActor
public final class UIKitScreenQABackgroundRuntime: ScreenQABackgroundRuntime {
    private var identifier = UIBackgroundTaskIdentifier.invalid

    public init() {}

    @discardableResult
    public func beginFallback(name: String, expirationHandler: @escaping @Sendable () -> Void) -> Bool {
        guard identifier == .invalid else { return false }
        identifier = UIApplication.shared.beginBackgroundTask(withName: name, expirationHandler: expirationHandler)
        return identifier != .invalid
    }

    public func endFallback() {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
        identifier = .invalid
    }
}

private struct ScreenCommentManifest: Codable {
    let sessionID: String
    var records: [ScreenCommentRecord]
    var notes: String?
    /// The batch handoff chosen at send time. Keep the original key for saved drafts.
    var handoffOption: Bool?

    enum CodingKeys: String, CodingKey {
        case sessionID, records, notes
        case handoffOption = "factoryFeatureFlag"
    }
}

public enum ScreenCommentSessionError: LocalizedError, Equatable {
    case wrongAccount
    case developerModeRequired
    case noImage
    case draftUnavailable
    case previouslySentDifferentText
    case tooManyComments
    case uploadInProgress(appName: String)
    case uploadStalled(appName: String)

    public var errorDescription: String? {
        switch self {
        case .wrongAccount: "Sign in with the account that created these comments to send them."
        case .developerModeRequired: "Turn on Developer Mode to send screen comments."
        case .draftUnavailable: "This comment is no longer available to edit."
        case .previouslySentDifferentText:
            "The first unsent comment was already sent with different text. Copy its revised text, remove that draft, and add a new comment to send the correction."
        case .noImage: "The saved screenshot is missing. Remove that comment and try again."
        case .tooManyComments: "Send this session before adding more than 20 comments."
        case .uploadInProgress(let app): "Keep \(app) open until the comments finish uploading."
        case .uploadStalled(let app):
            "Sending is taking longer than usual. \(app) keeps trying; tap Send again to check on it."
        }
    }
}

@MainActor
public final class ScreenCommentSession: ObservableObject {
    @Published public private(set) var records: [ScreenCommentRecord] = []
    @Published public var isActive = false
    @Published public private(set) var isUploading = false
    @Published public private(set) var uploadProgress = 0.0
    @Published public var uploadError: String?
    @Published public var didComplete = false
    /// The comment being sent right now, for its row's status.
    @Published public private(set) var sendingRecordID: String?
    @Published public private(set) var notes = ""
    static let notesLimit = 2_000
    /// A batch handoff chosen at send time (its one option's value), kept with the draft until the
    /// batch has been both uploaded and handed off. While set, the batch is frozen: no comment can
    /// be added or removed, so the handoff covers exactly the reports the person chose it for.
    @Published public private(set) var handoffOption: Bool?
    /// Whether the last completed send also handed the batch off, for the completion message.
    public private(set) var didQueueHandoff = false

    /// The original batch is on the server. Only its elected handoff still needs confirmation.
    public var isHandoffPending: Bool {
        handoffOption != nil && !records.isEmpty && records.allSatisfy(\.uploaded) && !didQueueHandoff
    }
    /// The app's name in progress and error copy.
    public let appName: String
    /// The raw report kind new comments are saved as.
    public let recordKind: String
    /// The optional AI reviewer; nil means no review is ever requested.
    public let reviewer: (any ScreenCommentReviewer)?
    /// The Application Support folder that holds each account's protected draft.
    private let folderName: String
    private let makeBackgroundRuntime: @MainActor () -> any ScreenQABackgroundRuntime
    /// How long a send may go without any progress before the screen stops waiting on it. The
    /// send itself is never cancelled: Storage and Firestore keep retrying, and every stage is
    /// idempotent on the report's stable id, so a later Send joins or finishes it.
    public var uploadStallTimeout: TimeInterval = 45
    private var uploadTask: Task<Void, Error>?
    /// Names the send `uploadTask` holds. A discard or account change detaches it: it may still
    /// finish its current report on its own, but it no longer touches this session's state.
    private var uploadToken: UUID?
    /// The submit whose wait currently owns `isUploading`.
    private var activeWaiter: UUID?
    private var lastUploadActivity = Date()
    public private(set) var sessionID = UUID().uuidString
    public private(set) var startedUptime = ProcessInfo.processInfo.systemUptime
    private var userID: String?
    private var liveTargets: [String: ScreenCommentLiveTarget] = [:]
    private var reviewTasks: [String: Task<Void, Never>] = [:]
    private var reviewTaskTokens: [String: UUID] = [:]

    /// - Parameters:
    ///   - appName: the app's name in progress and error copy.
    ///   - recordKind: the raw report kind for new comments.
    ///   - folderName: the Application Support folder for drafts; an existing app keeps its own.
    ///   - reviewer: optional AI review; leave nil to never request one.
    ///   - backgroundRuntime: makes the finite background assertion held during a send.
    public init(
        appName: String = "this app", recordKind: String = "Bug report", folderName: String = "ScreenComments",
        reviewer: (any ScreenCommentReviewer)? = nil,
        backgroundRuntime: (@MainActor () -> any ScreenQABackgroundRuntime)? = nil
    ) {
        self.appName = appName
        self.recordKind = recordKind
        self.folderName = folderName
        self.reviewer = reviewer
        makeBackgroundRuntime = backgroundRuntime ?? { UIKitScreenQABackgroundRuntime() }
    }

    /// Whether this batch can be handed off: one to 20 comments of this session's own kind whose
    /// messages, as a JSON array, fit the host's byte limit.
    public func supportsHandoffBatch(maximumMessageBytes: Int) -> Bool {
        guard !records.isEmpty, records.count <= 20, records.allSatisfy({ $0.kindRaw == recordKind }) else {
            return false
        }
        let messages = records.map { $0.message.trimmingCharacters(in: .whitespacesAndNewlines) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .withoutEscapingSlashes
        return ((try? encoder.encode(messages))?.count ?? Int.max) <= maximumMessageBytes
    }

    public var hasUnansweredQuestion: Bool {
        records.contains { $0.qa?.status == .question }
    }

    public func qa(for recordID: String) -> ScreenCommentReviewState {
        records.first(where: { $0.id == recordID })?.qa ?? ScreenCommentReviewState()
    }

    public func useAccount(_ uid: String?) {
        guard userID != uid else { return }
        detachUpload()
        // The previous account's waiting submit, if any, no longer holds this screen.
        activeWaiter = nil
        isUploading = false
        uploadError = nil
        didComplete = false
        for task in reviewTasks.values { task.cancel() }
        reviewTasks = [:]
        reviewTaskTokens = [:]
        userID = uid
        handoffOption = nil
        notes = ""
        didQueueHandoff = false
        startedUptime = ProcessInfo.processInfo.systemUptime
        records = []
        liveTargets = [:]
        isActive = false
        sessionID = UUID().uuidString
        guard let uid, let data = try? Data(contentsOf: manifestURL(for: uid)),
            let saved = try? JSONDecoder().decode(ScreenCommentManifest.self, from: data)
        else { return }
        sessionID = saved.sessionID
        records = saved.records
        handoffOption = saved.handoffOption
        notes = saved.notes ?? ""
    }

    var canEditNotes: Bool {
        userID != nil && !isUploading && uploadTask == nil && handoffOption == nil
            && !records.contains { $0.sendStarted == true || $0.uploaded }
    }

    func updateNotes(_ value: String) {
        guard canEditNotes else { return }
        let bounded = String(decoding: value.utf16.prefix(Self.notesLimit), as: UTF16.self)
        guard bounded != notes else { return }
        let previous = notes
        notes = bounded
        do { try persist() } catch {
            notes = previous
            uploadError = error.localizedDescription
        }
    }

    public func activate() {
        guard userID != nil else { return }
        isActive = true
        uploadError = nil
    }

    public func close() {
        isActive = false
    }

    public func add(_ candidate: ScreenCommentCandidate, message: String) throws {
        guard handoffOption == nil else { throw ScreenCommentSessionError.uploadInProgress(appName: appName) }
        guard let uid = userID else { throw ScreenCommentSessionError.wrongAccount }
        guard !isUploading else { throw ScreenCommentSessionError.uploadInProgress(appName: appName) }
        guard records.count < 20 else { throw ScreenCommentSessionError.tooManyComments }
        let record = ScreenCommentRecord(
            id: candidate.id.uuidString,
            kindRaw: recordKind,
            message: message,
            metadata: candidate.metadata,
            capturedAt: candidate.capturedAt,
            uploaded: false,
            qa: reviewer == nil ? nil : ScreenCommentReviewState(),
            snapshot: candidate.snapshot
        )
        let folder = folderURL(for: uid)
        try FileManager.default.createDirectory(
            at: folder, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        try candidate.jpeg.write(to: imageURL(for: record, uid: uid), options: .atomic)
        try protect(imageURL(for: record, uid: uid))
        records.append(record)
        liveTargets[record.id] = candidate.liveTarget
        do { try persist() } catch {
            records.removeLast()
            liveTargets.removeValue(forKey: record.id)
            try? FileManager.default.removeItem(at: imageURL(for: record, uid: uid))
            throw error
        }
    }

    func canEdit(_ record: ScreenCommentRecord) -> Bool {
        userID != nil && !isUploading && uploadTask == nil && handoffOption == nil
            && !record.uploaded && record.sendStarted != true
    }

    func updateMessage(for recordID: String, message: String, reviewAllowed: Bool) throws {
        guard let index = records.firstIndex(where: { $0.id == recordID }), canEdit(records[index])
        else { throw ScreenCommentSessionError.draftUnavailable }
        let original = records[index]
        guard message != original.message else { return }
        records[index].message = message
        records[index].qa = reviewer == nil ? nil : ScreenCommentReviewState()
        do { try persist() } catch {
            records[index] = original
            throw error
        }
        reviewTasks.removeValue(forKey: recordID)?.cancel()
        reviewTaskTokens.removeValue(forKey: recordID)
        if reviewAllowed { startReview(for: recordID) }
    }

    public func image(for record: ScreenCommentRecord) -> UIImage? {
        guard let uid = userID,
            let data = try? Data(contentsOf: imageURL(for: record, uid: uid))
        else { return nil }
        return UIImage(data: data)
    }

    public func livePosition(for record: ScreenCommentRecord, in window: UIWindow, tab: String) -> CGPoint? {
        let current = ScreenCommentTargetResolver.screenID(in: window, tab: tab)
        guard current == record.metadata.screenID else { return nil }
        if record.metadata.anchorKind == "screen" {
            return CGPoint(
                x: record.metadata.pinX * window.bounds.width,
                y: record.metadata.pinY * window.bounds.height)
        }
        if let target = liveTargets[record.id],
            let view = target.view, view.isDescendant(of: window)
        {
            return target.position(in: window, currentScreenID: current)
        }
        let replacement: UIView? =
            if let id = record.metadata.elementID {
                Self.findView(with: id, in: window)
            } else if record.metadata.anchorKind == "scroll" {
                Self.findScrollView(at: record.metadata, in: window)
            } else { nil }
        if let replacement {
            liveTargets[record.id] = ScreenCommentLiveTarget(
                view: replacement,
                pointInView: CGPoint(x: record.metadata.anchorX, y: record.metadata.anchorY),
                screenID: current,
                screenPoint: CGPoint(
                    x: record.metadata.pinX * window.bounds.width,
                    y: record.metadata.pinY * window.bounds.height))
            return liveTargets[record.id]?.position(in: window, currentScreenID: current)
        }
        // A detached control belongs to a dismissed sheet or another screen.
        // Wait until its matching live anchor returns instead of showing a pin
        // over unrelated content at the old screen coordinates.
        return nil
    }

    private static func findScrollView(at metadata: ScreenCommentMetadata, in window: UIWindow) -> UIScrollView? {
        let point = CGPoint(
            x: metadata.pinX * window.bounds.width,
            y: metadata.pinY * window.bounds.height)
        var candidates: [UIScrollView] = []
        func visit(_ view: UIView) {
            guard view === window || (!view.isHidden && view.alpha > 0.01) else { return }
            if let scroll = view as? UIScrollView,
                let parent = scroll.superview,
                parent.convert(scroll.frame, to: window).contains(point)
            {
                candidates.append(scroll)
            }
            view.subviews.forEach(visit)
        }
        visit(window)
        return candidates.min { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height }
    }

    private static func findView(with identifier: String, in view: UIView) -> UIView? {
        guard !view.isHidden, view.alpha > 0.01 else { return nil }
        if view.accessibilityIdentifier == identifier { return view }
        for child in view.subviews.reversed() {
            if let match = findView(with: identifier, in: child) { return match }
        }
        return nil
    }

    public func remove(_ record: ScreenCommentRecord) throws {
        guard let uid = userID else { throw ScreenCommentSessionError.wrongAccount }
        guard handoffOption == nil else { return }
        guard !isUploading, !record.uploaded, sendingRecordID != record.id else { return }
        reviewTasks.removeValue(forKey: record.id)?.cancel()
        reviewTaskTokens.removeValue(forKey: record.id)
        records.removeAll { $0.id == record.id }
        liveTargets.removeValue(forKey: record.id)
        try persist()
        try? FileManager.default.removeItem(at: imageURL(for: record, uid: uid))
    }

    public func discard() throws {
        guard !isUploading else { throw ScreenCommentSessionError.uploadInProgress(appName: appName) }
        try clearSession()
    }

    private func clearSession() throws {
        guard let uid = userID else { throw ScreenCommentSessionError.wrongAccount }
        for task in reviewTasks.values { task.cancel() }
        reviewTasks = [:]
        reviewTaskTokens = [:]
        let folder = folderURL(for: uid)
        if FileManager.default.fileExists(atPath: folder.path) {
            try FileManager.default.removeItem(at: folder)
        }
        records = []
        handoffOption = nil
        notes = ""
        liveTargets = [:]
        sessionID = UUID().uuidString
        detachUpload()
        uploadProgress = 0
        close()
    }

    public func resumeAutomaticReviews(isAllowed: Bool) {
        guard reviewer != nil, isAllowed, !isUploading else { return }
        for record in records where !record.uploaded {
            let status = record.qa?.status ?? .pending
            if status == .pending || (status == .checking && reviewTasks[record.id] == nil) {
                startReview(for: record.id)
            }
        }
    }

    public func suspendAutomaticReviews() {
        for task in reviewTasks.values { task.cancel() }
        reviewTasks = [:]
        reviewTaskTokens = [:]
        for index in records.indices where records[index].qa?.status == .checking {
            records[index].qa?.status = .pending
        }
        try? persist()
    }

    public func retryReview(for recordID: String) {
        guard reviewer != nil, !isUploading, let index = records.firstIndex(where: { $0.id == recordID }),
            !records[index].uploaded
        else { return }
        reviewTasks.removeValue(forKey: recordID)?.cancel()
        reviewTaskTokens.removeValue(forKey: recordID)
        var qa = records[index].qa ?? ScreenCommentReviewState()
        qa.status = .pending
        qa.error = nil
        records[index].qa = qa
        try? persist()
        startReview(for: recordID)
    }

    public func replyToReviewer(for recordID: String, message: String) {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard reviewer != nil, !trimmed.isEmpty, !isUploading, reviewTasks[recordID] == nil,
            let index = records.firstIndex(where: { $0.id == recordID }),
            !records[index].uploaded
        else { return }
        var qa = records[index].qa ?? ScreenCommentReviewState()
        qa.turns.append(ScreenCommentQATurn(role: "user", text: String(trimmed.prefix(3000))))
        qa.question = nil
        records[index].qa = qa
        try? persist()
        startReview(for: recordID)
    }

    private func startReview(for recordID: String) {
        guard reviewer != nil, reviewTasks[recordID] == nil,
            let index = records.firstIndex(where: { $0.id == recordID }),
            !records[index].uploaded
        else { return }
        var qa = records[index].qa ?? ScreenCommentReviewState()
        qa.status = .checking
        qa.error = nil
        records[index].qa = qa
        try? persist()
        let token = UUID()
        reviewTaskTokens[recordID] = token
        reviewTasks[recordID] = Task { [weak self] in
            guard let self else { return }
            await self.performReview(for: recordID, token: token)
        }
    }

    private func performReview(for recordID: String, token: UUID) async {
        defer {
            if reviewTaskTokens[recordID] == token {
                reviewTasks.removeValue(forKey: recordID)
                reviewTaskTokens.removeValue(forKey: recordID)
            }
        }
        guard let reviewer, let record = records.first(where: { $0.id == recordID }), let uid = userID
        else { return }
        let turns = record.qa?.turns ?? []
        do {
            let response = try await reviewer.review(record: record, image: image(for: record), turns: turns)
            guard !Task.isCancelled, userID == uid,
                let index = records.firstIndex(where: { $0.id == recordID })
            else { return }
            var qa = records[index].qa ?? ScreenCommentReviewState()
            qa.status = response.question == nil ? .ready : .question
            qa.question = response.question
            qa.handoff = response.handoff
            qa.repositoryContextUsed = response.repositoryContextUsed ?? false
            qa.turns.append(ScreenCommentQATurn(role: "assistant", text: response.reply))
            qa.error = nil
            records[index].qa = qa
            try? persist()
        } catch {
            guard !Task.isCancelled, userID == uid,
                let index = records.firstIndex(where: { $0.id == recordID })
            else { return }
            var qa = records[index].qa ?? ScreenCommentReviewState()
            qa.status = .unavailable
            qa.error = error.localizedDescription
            records[index].qa = qa
            try? persist()
        }
    }

    /// The host's transport: stores one comment as a report under its stable id. A retry may call it
    /// again for the same report. If the id exists, verify the stored session ID and message
    /// before reporting success. Use `ScreenCommentRecord.requireMatchingSentMessage` for the text.
    public typealias Sender =
        @MainActor (
            _ record: ScreenCommentRecord, _ photo: Data, _ sessionID: String, _ notes: String?,
            _ qaReview: [String: Any]?,
            _ onPhotoProgress: @escaping @MainActor (Double) -> Void
        ) async throws -> Void

    /// The host's optional batch handoff, called once every comment is uploaded: the session id,
    /// the report ids in order, and the chosen option. It must be idempotent on the session id.
    public typealias HandoffQueue =
        @MainActor (_ sessionID: String, _ reportIDs: [String], _ option: Bool) async throws -> Void

    /// Sends every comment not yet uploaded, one at a time, marking each uploaded on disk as it
    /// lands. Sending again while an earlier send is still running joins it instead of starting a
    /// second one, and a send that makes no progress for `uploadStallTimeout` stops holding the
    /// screen (with its draft intact) without being cancelled.
    ///
    /// `handoff` chooses a batch handoff for a batch that supports one (nil: none, or keep the one
    /// already chosen); a chosen handoff persists with the draft, so a retry after a failure or a
    /// relaunch hands off without sending any report again. `queue` performs it.
    public func submit(
        currentUserID: String?, isAllowed: Bool, handoff: Bool? = nil, maximumHandoffMessageBytes: Int = .max,
        queue: HandoffQueue? = nil, send: @escaping Sender
    ) async {
        guard !isUploading else { return }
        guard let uid = userID, currentUserID == uid else {
            uploadError = ScreenCommentSessionError.wrongAccount.localizedDescription
            return
        }
        guard isAllowed else {
            uploadError = ScreenCommentSessionError.developerModeRequired.localizedDescription
            return
        }
        do { try prepareHandoff(handoff, maximumMessageBytes: maximumHandoffMessageBytes) } catch {
            uploadError = error.localizedDescription
            return
        }
        isUploading = true
        uploadError = nil
        let uploadedCount = Double(records.filter(\.uploaded).count)
        uploadProgress = uploadTask == nil ? uploadedCount : max(uploadProgress, uploadedCount)
        lastUploadActivity = Date()
        let waitingSessionID = sessionID
        let waiter = UUID()
        activeWaiter = waiter
        let task = uploadTask ?? startUpload(uid: uid, sessionID: sessionID, queue: queue, send: send)
        let outcome = await wait(for: task)
        // An account change hands the screen to the next account: this wait no longer owns it,
        // and must not end another submit's upload state. (A completed send clears its session,
        // which changes the session id, but its waiter still owns the flag.)
        guard activeWaiter == waiter else { return }
        activeWaiter = nil
        isUploading = false
        // A session discarded or an account changed meanwhile has nothing to report.
        guard userID == uid, sessionID == waitingSessionID else { return }
        switch outcome {
        case .finished:
            break
        case .failed(let error):
            uploadError = error.localizedDescription
        case .stalled:
            uploadError = ScreenCommentSessionError.uploadStalled(appName: appName).localizedDescription
        }
    }

    private func prepareHandoff(_ choice: Bool?, maximumMessageBytes: Int) throws {
        guard uploadTask == nil else { return }
        didQueueHandoff = false
        guard let choice, handoffOption == nil, supportsHandoffBatch(maximumMessageBytes: maximumMessageBytes)
        else { return }
        try saveHandoffOption(choice)
    }

    private func saveHandoffOption(_ choice: Bool?) throws {
        let previous = handoffOption
        handoffOption = choice
        do { try persist() } catch {
            handoffOption = previous
            throw error
        }
    }

    private func startUpload(
        uid: String, sessionID uploadSessionID: String, queue: HandoffQueue?, send: @escaping Sender
    ) -> Task<Void, Error> {
        let token = UUID()
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer {
                if self.uploadToken == token { self.detachUpload() }
            }
            do {
                try await self.uploadPending(
                    uid: uid, sessionID: uploadSessionID, token: token, queue: queue, send: send)
            } catch {
                guard self.uploadToken == token else { throw error }
                // A different message for this ID cannot be retried. Release a chosen handoff
                // so the tester can remove that one draft and send the rest.
                if error as? ScreenCommentSessionError == .previouslySentDifferentText, self.handoffOption != nil {
                    try self.saveHandoffOption(nil)
                }
                // A send nobody waits on any more (it stalled) still reports how it ended.
                if !self.isUploading { self.uploadError = error.localizedDescription }
                throw error
            }
        }
        uploadTask = task
        uploadToken = token
        return task
    }

    private func detachUpload() {
        uploadTask = nil
        uploadToken = nil
        sendingRecordID = nil
    }

    /// Gives an in-flight check up to three seconds to finish. Answers are never required.
    private func waitBrieflyForChecks() async throws {
        guard reviewer != nil else { return }
        let deadline = Date().addingTimeInterval(3)
        while records.contains(where: { $0.qa?.status == .checking }) && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
    }

    /// Records a sent comment as uploaded, on disk and in the progress; false when the account or
    /// session changed or the comment is gone, which ends the send.
    private func markUploaded(
        _ record: ScreenCommentRecord, token: UUID, completedCount: Double
    ) throws -> Bool {
        guard uploadToken == token,
            let currentIndex = records.firstIndex(where: { $0.id == record.id })
        else { return false }
        records[currentIndex].uploaded = true
        try persist()
        lastUploadActivity = Date()
        uploadProgress = completedCount + 1
        return true
    }

    private func markSendStarted(at index: Int) throws {
        let original = records[index]
        guard original.sendStarted != true else { return }
        records[index].sendStarted = true
        do { try persist() } catch {
            records[index] = original
            throw error
        }
    }

    private func uploadPending(
        uid: String, sessionID uploadSessionID: String, token: UUID, queue: HandoffQueue?, send: @escaping Sender
    ) async throws {
        // UIKit's finite assertion, so locking the phone mid-send does not suspend it at once. Its
        // expiration handler ends it (exactly once, inside the handler, as UIKit requires to
        // avoid termination); the send is then suspended with the app, not cancelled, and the
        // draft and per-comment state are already on disk.
        let runtime = makeBackgroundRuntime()
        runtime.beginFallback(name: "Sending screen comments") {
            MainActor.assumeIsolated { runtime.endFallback() }
        }
        defer { runtime.endFallback() }
        let batchNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        try await waitBrieflyForChecks()
        // Comments added while this send runs are picked up before it ends.
        while let index = records.firstIndex(where: { !$0.uploaded }) {
            let record = records[index]
            let completedCount = Double(records.filter(\.uploaded).count)
            guard uploadToken == token else { return }
            guard let photo = try? Data(contentsOf: imageURL(for: record, uid: uid)) else {
                throw ScreenCommentSessionError.noImage
            }
            try markSendStarted(at: index)
            sendingRecordID = record.id
            lastUploadActivity = Date()
            try await send(
                record, photo, uploadSessionID, batchNotes.isEmpty ? nil : batchNotes, qaReviewData(for: record)
            ) { [weak self] fraction in
                guard let self, self.uploadToken == token else { return }
                self.lastUploadActivity = Date()
                self.uploadProgress = max(
                    self.uploadProgress,
                    completedCount + 0.9 * min(1, max(0, fraction)))
            }
            guard try markUploaded(record, token: token, completedCount: completedCount)
            else { return }
        }
        guard uploadToken == token, records.allSatisfy(\.uploaded) else { return }
        try await handOffIfChosen(queue, token: token, sessionID: uploadSessionID)
        guard uploadToken == token else { return }
        try clearSession()
        uploadProgress = 0
        didComplete = true
    }

    /// Hands the uploaded batch off when one was chosen; a failure keeps the uploaded draft so the
    /// next send only retries the handoff.
    private func handOffIfChosen(_ queue: HandoffQueue?, token: UUID, sessionID uploadSessionID: String) async throws {
        guard let option = handoffOption else { return }
        guard let queue else { throw ScreenCommentSessionError.developerModeRequired }
        lastUploadActivity = Date()
        try await queue(uploadSessionID, records.map(\.id), option)
        if uploadToken == token { didQueueHandoff = true }
    }

    private enum UploadWait {
        case finished
        case failed(Error)
        case stalled
    }

    /// The send's own result, or `.stalled` once it has gone `uploadStallTimeout` without
    /// progress. Waiting is all that stops; the send carries on.
    private func wait(for task: Task<Void, Error>) async -> UploadWait {
        let gate = UploadWaitGate()
        return await withCheckedContinuation { continuation in
            gate.continuation = continuation
            Task { @MainActor in
                do {
                    try await task.value
                    gate.finish(.finished)
                } catch {
                    gate.finish(.failed(error))
                }
            }
            Task { @MainActor [weak self] in
                while gate.isOpen {
                    try? await Task.sleep(for: .milliseconds(250))
                    guard let self else { return gate.finish(.stalled) }
                    if Date().timeIntervalSince(self.lastUploadActivity) > self.uploadStallTimeout {
                        gate.finish(.stalled)
                    }
                }
            }
        }
    }

    /// Resumes the wait once, with whichever outcome comes first.
    private final class UploadWaitGate {
        var continuation: CheckedContinuation<UploadWait, Never>?
        var isOpen: Bool { continuation != nil }

        func finish(_ outcome: UploadWait) {
            continuation?.resume(returning: outcome)
            continuation = nil
        }
    }

    private func qaReviewData(for record: ScreenCommentRecord) -> [String: Any]? {
        guard let qa = records.first(where: { $0.id == record.id })?.qa,
            let savedHandoff = qa.handoff, !qa.turns.isEmpty
        else { return nil }
        let handoff = qa.question.map { "\(savedHandoff)\nUnresolved question: \($0)" } ?? savedHandoff
        let reviewerName = reviewer?.name ?? "Reviewer"
        let transcript = qa.turns.map { "\($0.role == "assistant" ? reviewerName : "Developer"): \($0.text)" }
            .joined(separator: "\n")
        return [
            "handoff": String(
                (record.snapshot.map {
                    "Diagnostics: report \($0.summary.reportID), schema \($0.summary.schemaVersion), pin time \($0.summary.capturedAt). Read qaSnapshot.storagePath and primary sections \($0.summary.primarySectionIDs.joined(separator: ", ")).\n"
                } ?? "").appending(handoff).prefix(6000)),
            "transcript": String(transcript.prefix(4000)),
        ]
    }

    private func folderURL(for uid: String) -> URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let hash = SHA256.hash(data: Data(uid.utf8)).map { String(format: "%02x", $0) }.joined()
        return support.appending(path: "\(folderName)/\(hash)", directoryHint: .isDirectory)
    }

    private func manifestURL(for uid: String) -> URL {
        folderURL(for: uid).appending(path: "pending.json")
    }

    private func imageURL(for record: ScreenCommentRecord, uid: String) -> URL {
        folderURL(for: uid).appending(path: "\(record.id).jpg")
    }

    private func persist() throws {
        guard let uid = userID else { throw ScreenCommentSessionError.wrongAccount }
        let folder = folderURL(for: uid)
        try FileManager.default.createDirectory(
            at: folder, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        let data = try JSONEncoder().encode(
            ScreenCommentManifest(
                sessionID: sessionID, records: records, notes: notes.isEmpty ? nil : notes, handoffOption: handoffOption
            ))
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableFolder = folder
        try mutableFolder.setResourceValues(values)
        try data.write(to: manifestURL(for: uid), options: [.atomic, .completeFileProtection])
    }

    private func protect(_ url: URL) throws {
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
    }
}
