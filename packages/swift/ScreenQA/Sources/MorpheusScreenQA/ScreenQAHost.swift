import Combine
import SwiftUI
import UIKit

private struct ScreenQAInactiveLauncherTrailingInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    /// Full-screen controls that lay out against the hardware inset can add this row above themselves.
    @Entry public var screenQAActiveToolbarHeight: CGFloat = 0

    /// Horizontal room for an inactive QA tile in a custom full-screen header. Consumers that
    /// use this space can lay out against the hardware safe area rather than a modal's QA inset.
    /// Keep the reservation during capture so hiding QA chrome does not move the underlying UI.
    public var screenQAInactiveLauncherTrailingInset: CGFloat {
        get { self[ScreenQAInactiveLauncherTrailingInsetKey.self] }
        set { self[ScreenQAInactiveLauncherTrailingInsetKey.self] = newValue }
    }
}

extension View {
    /// Reserves the launcher's row on screens whose headers cannot share its trailing slot.
    public func screenQAReserveLauncherRow(when needed: Bool = true, background: Color = .clear) -> some View {
        modifier(ScreenQALauncherRow(needed: needed, background: background))
    }
}

private struct ScreenQALauncherRow: ViewModifier {
    @Environment(\.screenQAInactiveLauncherTrailingInset) private var launcherInset
    let needed: Bool
    let background: Color

    func body(content: Content) -> some View {
        let reservesRow = needed && launcherInset > 0
        content
            .padding(.top, reservesRow ? ScreenCommentLauncher.reservedRowHeight : 0)
            .background {
                if reservesRow { background.ignoresSafeArea(edges: .top) }
            }
    }
}

/// The host app's colours for the QA chrome, editor and Review.
public struct ScreenQATheme {
    public var primary: Color
    public var onPrimary: Color
    public var danger: Color
    public var background: Color
    public var surface: Color
    public var secondaryText: Color
    /// The app's appearance override, applied to the QA windows so they match it.
    public var colorScheme: ColorScheme?

    public init(
        primary: Color, onPrimary: Color, danger: Color, background: Color, surface: Color, secondaryText: Color,
        colorScheme: ColorScheme? = nil
    ) {
        self.primary = primary
        self.onPrimary = onPrimary
        self.danger = danger
        self.background = background
        self.surface = surface
        self.secondaryText = secondaryText
        self.colorScheme = colorScheme
    }

    public static let standard = ScreenQATheme(
        primary: .accentColor, onPrimary: .white, danger: .red,
        background: Color(uiColor: .systemGroupedBackground),
        surface: Color(uiColor: .secondarySystemGroupedBackground), secondaryText: .secondary)
}

/// What the host's diagnostics adapter sees when a pin is placed, before the screenshot is taken.
public struct ScreenQAPinContext {
    public let id: UUID
    public let capturedAt: Date
    public let window: UIWindow
    public let metadata: ScreenCommentMetadata
    public let target: UIView?
    public let sessionID: String
    public let sessionStartedUptime: TimeInterval
}

/// An optional host action for a whole uploaded batch, offered in Review.
public struct ScreenQABatchHandoff {
    /// Whether the handoff can be offered to this account right now.
    public var isAvailable: Bool
    public var title: String
    public var detail: String
    public var optionTitle: String
    public var optionDetail: String
    public var accessibilityIdentifier: String
    public var optionAccessibilityIdentifier: String
    /// The alert after a send that also handed the batch off.
    public var completionMessage: String
    public var completionTitle: String
    /// The receipt and action when only the handoff needs to be retried.
    public var retryMessage: String
    public var retryTitle: String
    /// The largest JSON-encoded array of comment messages the handoff accepts.
    public var maximumMessageBytes: Int
    public var queue: ScreenCommentSession.HandoffQueue

    public init(
        isAvailable: Bool, title: String, detail: String, optionTitle: String, optionDetail: String,
        accessibilityIdentifier: String, optionAccessibilityIdentifier: String, completionMessage: String,
        maximumMessageBytes: Int, completionTitle: String = "Comments saved",
        retryMessage: String = "Comments saved. The next step still needs confirmation.",
        retryTitle: String = "Retry handoff", queue: @escaping ScreenCommentSession.HandoffQueue
    ) {
        self.isAvailable = isAvailable
        self.title = title
        self.detail = detail
        self.optionTitle = optionTitle
        self.optionDetail = optionDetail
        self.accessibilityIdentifier = accessibilityIdentifier
        self.optionAccessibilityIdentifier = optionAccessibilityIdentifier
        self.completionMessage = completionMessage
        self.completionTitle = completionTitle
        self.retryMessage = retryMessage
        self.retryTitle = retryTitle
        self.maximumMessageBytes = maximumMessageBytes
        self.queue = queue
    }
}

/// The host's typed adapters. Rebuilt on every render, so each value is the app's current state.
public struct ScreenQAConfiguration {
    /// A dictation accessory for the comment editor: the draft, a flag the accessory sets while it
    /// is busy (Save waits for it), and a callback that ends editor focus when dictation starts.
    public typealias Dictation = (Binding<String>, Binding<Bool>, @escaping () -> Void) -> AnyView

    /// The app's name in progress and error copy.
    public var appName: String
    public var theme: ScreenQATheme
    /// The signed-in account. Drafts belong to it and only it may send them.
    public var accountID: String?
    /// Whether this account may use QA mode at all, and send. Turning false closes QA mode.
    public var isAvailable: Bool
    /// Whether the app is in the foreground. Pins and automatic reviews need it.
    public var isForeground: Bool
    /// Whether the launcher shows. It may show to people who cannot comment; they get the
    /// access explanation instead.
    public var showsLauncher: Bool
    /// The current screen or tab name that prefixes each pin's screen identity.
    public var screenName: String
    /// Why the launcher does nothing for an account without access.
    public var accessExplanation: String
    /// The transport: stores one comment as a report, idempotently on its stable id.
    public var send: ScreenCommentSession.Sender
    /// Optional app diagnostics frozen at pin time.
    public var snapshot: ((ScreenQAPinContext) -> QASnapshot?)?
    /// Optional dictation in the editor.
    public var dictation: Dictation?
    /// Wraps the toolkit's sheets, for environment the host's own views need there.
    public var decorateSheet: (AnyView) -> AnyView
    /// Optional action for a whole uploaded batch.
    public var handoff: ScreenQABatchHandoff?

    public init(
        appName: String, theme: ScreenQATheme = .standard, accountID: String?, isAvailable: Bool,
        isForeground: Bool, showsLauncher: Bool, screenName: String, accessExplanation: String,
        send: @escaping ScreenCommentSession.Sender, snapshot: ((ScreenQAPinContext) -> QASnapshot?)? = nil,
        dictation: Dictation? = nil, decorateSheet: @escaping (AnyView) -> AnyView = { $0 },
        handoff: ScreenQABatchHandoff? = nil
    ) {
        self.appName = appName
        self.theme = theme
        self.accountID = accountID
        self.isAvailable = isAvailable
        self.isForeground = isForeground
        self.showsLauncher = showsLauncher
        self.screenName = screenName
        self.accessExplanation = accessExplanation
        self.send = send
        self.snapshot = snapshot
        self.dictation = dictation
        self.decorateSheet = decorateSheet
        self.handoff = handoff
    }

    /// Whether a pin can be placed right now.
    public var canComment: Bool { isAvailable && accountID != nil && isForeground }

    /// Whether Review offers the handoff for this batch now.
    func canHandOff(_ session: ScreenCommentSession) -> Bool {
        guard let handoff, handoff.isAvailable else { return false }
        return session.supportsHandoffBatch(maximumMessageBytes: handoff.maximumMessageBytes)
    }

    /// Sends the batch. A configured handoff's queue always goes with it, so a handoff chosen
    /// earlier for this draft completes even while a new one could not be offered.
    func submit(_ session: ScreenCommentSession, handoff choice: Bool? = nil) async {
        await session.submit(
            currentUserID: accountID, isAllowed: isAvailable, handoff: choice,
            maximumHandoffMessageBytes: handoff?.maximumMessageBytes ?? .max, queue: handoff?.queue, send: send)
    }
}

/// QA mode's interaction state: placement, the editor and Review sheets, exit and access prompts.
@MainActor
public final class ScreenQAController: ObservableObject {
    public let session: ScreenCommentSession
    @Published public var placing = false
    @Published var candidate: ScreenCommentCandidate?
    @Published var showingReview = false
    @Published var capturing = false
    @Published var error: String?
    @Published var showingHint = false
    @Published var showingExit = false
    @Published var showingAccessExplanation = false
    /// The latest configuration the host rendered, read again after the capture delay.
    var configuration: ScreenQAConfiguration?

    public init(session: ScreenCommentSession) {
        self.session = session
        var titles = ScreenCommentTargetResolver.defaultOwnTitles
        if let reviewer = session.reviewer { titles.insert(reviewer.conversationTitle) }
        ScreenCommentTargetResolver.ownTitles = titles
    }

    private var canComment: Bool { configuration?.canComment ?? false }

    /// Ends QA mode and every sheet, prompt and pin it had open.
    func close() {
        session.close()
        showingExit = false
        showingAccessExplanation = false
        placing = false
        candidate = nil
        showingReview = false
    }

    func toggle() {
        if session.isActive {
            requestExit()
        } else if canComment {
            begin()
        } else {
            showingAccessExplanation = true
        }
    }

    private func begin() {
        guard canComment, !session.isActive else { return }
        session.useAccount(configuration?.accountID)
        session.activate()
        placing = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    func beginPlacement() {
        guard canComment, session.isActive, !placing, !session.isUploading else { return }
        placing = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    func showHint() {
        withAnimation(.easeOut(duration: 0.2)) { showingHint = true }
        Task {
            try? await Task.sleep(for: .seconds(2.5))
            withAnimation(.easeOut(duration: 0.2)) { showingHint = false }
        }
    }

    func requestExit() {
        placing = false
        showingHint = false
        guard !session.isUploading else {
            error = ScreenCommentSessionError.uploadInProgress(appName: session.appName).localizedDescription
            return
        }
        if session.records.contains(where: { !$0.uploaded }) {
            showingExit = true
        } else {
            session.close()
        }
    }

    /// Resolves the pin's target, freezes diagnostics at pin time, then (with the chrome hidden)
    /// captures the screen and opens the editor.
    public func addPin(at point: CGPoint, hitView: UIView?) {
        guard let configuration, configuration.canComment, session.isActive,
            let window = ScreenCommentCapture.appWindow
        else { return }
        let (metadata, liveTarget) = ScreenCommentTargetResolver.capture(
            in: window, point: point, hitView: hitView, tab: configuration.screenName)
        let captureID = UUID()
        let capturedAt = Date()
        let captureUserID = configuration.accountID
        let snapshot = configuration.snapshot?(
            ScreenQAPinContext(
                id: captureID, capturedAt: capturedAt, window: window, metadata: metadata, target: hitView,
                sessionID: session.sessionID, sessionStartedUptime: session.startedUptime))
        capturing = true
        Task {
            try? await Task.sleep(for: .milliseconds(80))
            defer { capturing = false }
            guard canComment, self.configuration?.accountID == captureUserID,
                let image = ScreenCommentCapture.currentScreen()
            else {
                error = "Could not capture this screen. Please try again."
                return
            }
            do {
                candidate = ScreenCommentCandidate(
                    id: captureID, image: image,
                    jpeg: try ScreenCommentCapture.jpeg(from: image),
                    metadata: metadata,
                    liveTarget: liveTarget, capturedAt: capturedAt,
                    snapshot: snapshot?.recordingScreenshot(at: Date())
                )
            } catch { self.error = error.localizedDescription }
        }
    }
}

/// Hosts QA mode around the app's content: the header's reserved row, the launcher and header
/// windows above every sheet, the editor and Review, and the account and availability lifecycle.
public struct ScreenQAHost<Content: View>: View {
    @ObservedObject private var controller: ScreenQAController
    @ObservedObject private var session: ScreenCommentSession
    private let configuration: ScreenQAConfiguration
    private let content: Content

    public init(
        controller: ScreenQAController, configuration: ScreenQAConfiguration, @ViewBuilder content: () -> Content
    ) {
        self.controller = controller
        session = controller.session
        self.configuration = configuration
        self.content = content()
    }

    private var reservesToolbarRow: Bool { session.isActive && configuration.canComment }
    private var offersLauncher: Bool { configuration.showsLauncher && !reservesToolbarRow }

    public var body: some View {
        controller.configuration = configuration
        return VStack(spacing: 0) {
            if reservesToolbarRow {
                Color.clear.frame(height: ScreenCommentToolbar.rowHeight)
            }
            content
        }
        .environment(
            \.screenQAInactiveLauncherTrailingInset,
            offersLauncher
                ? ScreenCommentLauncher.trailingInset + ScreenCommentLauncher.size : 0
        )
        .overlay(alignment: .bottom) {
            if controller.showingHint && session.isActive {
                Label("Tap + for another comment", systemImage: "plus.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 13)
                    .foregroundStyle(.white)
                    .background(.black.opacity(0.84), in: Capsule())
                    .padding(.bottom, 86)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .environment(\.screenQAActiveToolbarHeight, reservesToolbarRow ? ScreenCommentToolbar.rowHeight : 0)
        .background(gesture)
        .onAppear {
            session.useAccount(configuration.accountID)
            session.resumeAutomaticReviews(isAllowed: configuration.canComment)
        }
        .task(id: configuration.canComment) { session.resumeAutomaticReviews(isAllowed: configuration.canComment) }
        .onChange(of: configuration.canComment) { _, enabled in
            if enabled {
                session.resumeAutomaticReviews(isAllowed: true)
            } else {
                session.suspendAutomaticReviews()
            }
        }
        .onChange(of: configuration.accountID) { _, uid in
            session.useAccount(uid)
            session.resumeAutomaticReviews(isAllowed: configuration.canComment)
        }
        .onChange(of: configuration.isAvailable) { _, available in
            if !available { controller.close() }
        }
        .alert(
            "Screen comments",
            isPresented: Binding(
                get: { controller.error != nil },
                set: { if !$0 { controller.error = nil } }
            )
        ) {
            Button("OK") { controller.error = nil }
        } message: {
            Text(controller.error ?? "Please try again.")
        }
        .alert(completionTitle, isPresented: $session.didComplete) {
            Button("Done") {}
        } message: {
            Text(
                session.didQueueHandoff
                    ? configuration.handoff?.completionMessage ?? "All screen comments and screenshots were uploaded."
                    : "All screen comments and screenshots were uploaded.")
        }
    }

    private var completionTitle: String {
        session.didQueueHandoff ? configuration.handoff?.completionTitle ?? "Comments saved" : "Comments saved"
    }

    private var gesture: some View {
        let canComment = configuration.canComment
        let editing = controller.candidate != nil || controller.showingReview
        return ScreenCommentGesture(
            configuration: configuration,
            enabled: canComment && !editing && !controller.showingExit,
            showsHeader: canComment && session.isActive && !controller.capturing && !editing
                && !controller.showingExit,
            // Capture hides the chrome without moving the app or its sheets beneath the pin.
            reservesHeaderSpace: reservesToolbarRow,
            showsLauncher: offersLauncher && !controller.capturing,
            launcherEnabled: !editing && !session.isUploading,
            showingExit: $controller.showingExit,
            showingAccessExplanation: $controller.showingAccessExplanation,
            candidate: $controller.candidate,
            showingReview: $controller.showingReview,
            onSave: { [session] candidate, message in
                try session.add(candidate, message: message)
                session.resumeAutomaticReviews(isAllowed: canComment)
            },
            onEditorDismissed: { [controller, session] in if session.isActive { controller.showHint() } },
            isPlacing: controller.placing,
            session: session,
            tab: configuration.screenName,
            onToggle: controller.toggle,
            onKeepDrafts: { [session] in session.close() },
            onDiscardDrafts: { [controller, session] in
                do { try session.discard() } catch { controller.error = error.localizedDescription }
            },
            onAdd: controller.beginPlacement,
            onPlace: { [controller] point, hitView in
                controller.placing = false
                controller.addPin(at: point, hitView: hitView)
            },
            onCancelPlacement: { [controller] in
                controller.placing = false
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            },
            onReview: { [controller] in
                controller.placing = false
                controller.showingReview = true
            },
            onSend: { [controller, session, configuration] in
                controller.placing = false
                controller.showingReview = true
                // With a handoff on offer, or one chosen, the person decides in Review first.
                if !configuration.canHandOff(session) && session.handoffOption == nil {
                    Task { await configuration.submit(session) }
                }
            },
            onExit: controller.requestExit
        )
        .frame(width: 0, height: 0)
    }
}
