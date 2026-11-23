import ImageIO
import SwiftUI
import UIKit

public enum ScreenCommentCapture {
    /// The longest edge and size a saved screenshot may have.
    nonisolated public static let maximumPixelSize = 1600
    nonisolated public static let maximumBytes = 2_000_000

    nonisolated public enum Error: LocalizedError {
        case invalidImage
        public var errorDescription: String? { "That photo could not be attached. Please choose another image." }
    }

    @MainActor public static var appWindow: UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .filter { !($0 is ScreenCommentHeaderWindow) && !$0.isHidden && $0.windowLevel == .normal }
        return windows.first(where: \.isKeyWindow) ?? windows.first
    }

    @MainActor public static func currentScreen() -> UIImage? {
        guard let window = appWindow else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = window.screen.scale
        return UIGraphicsImageRenderer(size: window.bounds.size, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
        }
    }

    @MainActor public static func jpeg(from screenshot: UIImage) throws -> Data {
        guard let data = screenshot.jpegData(compressionQuality: 0.8) else {
            throw Error.invalidImage
        }
        return try boundedJPEG(from: data)
    }

    /// Re-encoding drops source metadata and bounds the upload, including large HEIC photos.
    nonisolated public static func boundedJPEG(from data: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(
                source, 0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
                ] as CFDictionary),
            let jpeg = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.8),
            !jpeg.isEmpty, jpeg.count <= maximumBytes
        else { throw Error.invalidImage }
        return jpeg
    }

    /// The reduced screenshot an AI reviewer receives: at most 1024 pixels wide, JPEG quality 0.6.
    @MainActor public static func thumbnailJPEG(_ image: UIImage) -> Data? {
        let pixelWidth = CGFloat(image.cgImage?.width ?? Int(image.size.width * image.scale))
        guard pixelWidth > 0 else { return nil }
        let ratio = min(1, 1024 / pixelWidth)
        let size = CGSize(
            width: round(pixelWidth * ratio),
            height: round(CGFloat(image.cgImage?.height ?? Int(image.size.height * image.scale)) * ratio))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.6)
    }
}

struct ScreenCommentToolbar: View {
    static let rowHeight: CGFloat = 45
    /// Review and Exit pills: the system label on an opaque system background, so text keeps its
    /// contrast in light and dark appearance whatever the app's primary color is.
    static let pillForeground = UIColor.label
    static let pillBackground = UIColor.systemBackground
    let theme: ScreenQATheme
    @ObservedObject var session: ScreenCommentSession
    let topInset: CGFloat
    let isPlacing: Bool
    let onAdd: () -> Void
    let onCancelPlacement: () -> Void
    let onReview: () -> Void
    let onSend: () -> Void
    let onExit: () -> Void

    var body: some View {
        HStack(spacing: 7.5) {
            Button(action: onReview) {
                HStack(spacing: 5) {
                    Text("Review \(session.records.count)")
                    if session.hasUnansweredQuestion {
                        Circle().fill(Color.orange).frame(width: 7, height: 7)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 31.5)
            .foregroundStyle(Color(uiColor: Self.pillForeground))
            .background(Color(uiColor: Self.pillBackground), in: Capsule())
            .accessibilityIdentifier("reviewScreenComments")
            Button("Send All", action: onSend)
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity, minHeight: 31.5)
                .foregroundStyle(theme.onPrimary)
                .background(theme.primary, in: Capsule())
                .disabled(session.records.isEmpty || session.isUploading)
                .opacity(session.records.isEmpty ? 0.55 : 1)
                .accessibilityIdentifier("sendScreenCommentsFromHeader")
            Button("Exit", action: onExit)
                .frame(maxWidth: .infinity, minHeight: 31.5)
                .foregroundStyle(Color(uiColor: Self.pillForeground))
                .background(Color(uiColor: Self.pillBackground), in: Capsule())
                .disabled(session.isUploading)
                .accessibilityIdentifier("closeScreenComments")
            Button(action: isPlacing ? onCancelPlacement : onAdd) {
                Image(systemName: isPlacing ? "xmark" : "plus")
                    .font(.system(size: 16.5, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(isPlacing ? theme.danger : theme.primary, in: Circle())
            }
            .disabled(session.isUploading || session.handoffOption != nil)
            .opacity(session.isUploading || session.handoffOption != nil ? 0.6 : 1)
            .accessibilityLabel(isPlacing ? "Cancel comment placement" : "Add comment")
            .accessibilityIdentifier(isPlacing ? "cancelScreenCommentPlacement" : "addScreenComment")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(theme.primary)
        .padding(.horizontal, 10.5)
        .padding(.top, topInset)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity)
        .frame(height: topInset + Self.rowHeight)
        .background {
            Rectangle().fill(.ultraThinMaterial)
                .overlay(theme.primary.opacity(0.14))
        }
        .overlay(alignment: .bottom) { theme.primary.opacity(0.28).frame(height: 1) }
    }
}

struct ScreenCommentLauncher: View {
    let theme: ScreenQATheme
    /// The tap target; the visible circle is `diameter` inside it.
    static let size: CGFloat = 44
    static let diameter: CGFloat = 40
    /// Keep the tap target below the system status bar's touch region.
    static let trailingInset: CGFloat = 35
    static let reservedRowHeight: CGFloat = 45
    let onToggle: () -> Void

    /// Start at the safe-area boundary: the highest position with a fully tappable target.
    /// The system status row above it retains touch ownership even over an elevated window.
    static func frame(in bounds: CGRect, safeArea: UIEdgeInsets) -> CGRect {
        CGRect(
            x: bounds.maxX - safeArea.right - trailingInset - size,
            y: bounds.minY + safeArea.top,
            width: size, height: size)
    }

    var body: some View {
        Button(action: onToggle) {
            Image(systemName: "text.bubble")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(theme.primary)
                .frame(width: Self.diameter, height: Self.diameter)
                .background(theme.primary.opacity(0.06), in: Circle())
                .modifier(LauncherGlass(shape: Circle()))
                .overlay { Circle().strokeBorder(theme.primary.opacity(0.24), lineWidth: 1) }
                .frame(width: Self.size, height: Self.size)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Start QA mode")
        .accessibilityIdentifier("screenCommentLauncher")
    }

    private struct LauncherGlass: ViewModifier {
        let shape: Circle
        @ViewBuilder func body(content: Content) -> some View {
            if #available(iOS 26.0, *) {
                content.glassEffect(.regular, in: shape)
            } else {
                content.background(.thinMaterial, in: shape)
            }
        }
    }
}

struct ScreenCommentLauncherOverlay: View {
    let theme: ScreenQATheme
    let frame: CGRect
    let enabled: Bool
    let onToggle: () -> Void

    var body: some View {
        ScreenCommentLauncher(theme: theme, onToggle: onToggle)
            .disabled(!enabled)
            .opacity(enabled ? 1 : 0.6)
            .position(x: frame.midX, y: frame.midY)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
            .preferredColorScheme(theme.colorScheme)
    }
}

struct ScreenCommentOverlay: View {
    let configuration: ScreenQAConfiguration
    @ObservedObject var session: ScreenCommentSession
    let tab: String
    let topInset: CGFloat
    let showsHeader: Bool
    @Binding var showingExit: Bool
    @Binding var showingAccessExplanation: Bool
    @Binding var candidate: ScreenCommentCandidate?
    @Binding var showingReview: Bool
    let onSave: (ScreenCommentCandidate, String) throws -> Void
    let onEditorDismissed: () -> Void
    let isPlacing: Bool
    let onToggle: () -> Void
    let onKeepDrafts: () -> Void
    let onDiscardDrafts: () -> Void
    let onAdd: () -> Void
    let onPlace: (CGPoint) -> Void
    let onCancelPlacement: () -> Void
    let onReview: () -> Void
    let onSend: () -> Void
    let onExit: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            if isPlacing {
                Color.black.opacity(0.4)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("screenCommentPlacementSurface")
                    .gesture(SpatialTapGesture().onEnded { value in onPlace(value.location) })
            }
            if showsHeader {
                ScreenCommentToolbar(
                    theme: configuration.theme, session: session, topInset: topInset, isPlacing: isPlacing,
                    onAdd: onAdd, onCancelPlacement: onCancelPlacement,
                    onReview: onReview, onSend: onSend, onExit: onExit)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(.container)
        .preferredColorScheme(configuration.theme.colorScheme)
        .sheet(item: $candidate, onDismiss: onEditorDismissed) { candidate in
            configuration.decorateSheet(
                AnyView(
                    ScreenCommentEditor(
                        theme: configuration.theme, dictation: configuration.dictation,
                        image: candidate.image, metadata: candidate.metadata, number: session.records.count + 1
                    ) { message in
                        try onSave(candidate, message)
                    }))
        }
        .sheet(isPresented: $showingReview) {
            configuration.decorateSheet(
                AnyView(ScreenCommentReview(configuration: configuration, session: session)))
        }
        .alert("Leave QA mode?", isPresented: $showingExit) {
            Button("Keep drafts and exit", action: onKeepDrafts)
            Button("Discard drafts", role: .destructive, action: onDiscardDrafts)
            Button("Continue commenting", role: .cancel) {}
        } message: {
            Text("Your unsent comments and screenshots are saved on this device.")
        }
        .alert("Screen comments", isPresented: $showingAccessExplanation) {
            Button("OK") {}
        } message: {
            Text(configuration.accessExplanation)
        }
    }
}

struct ScreenCommentPinBadge: View {
    var theme = ScreenQATheme.standard
    let number: Int

    var body: some View {
        VStack(spacing: -2) {
            Text("\(number)")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(theme.danger, in: Circle())
                .overlay(Circle().stroke(.white, lineWidth: 2))
            Image(systemName: "triangle.fill")
                .font(.system(size: 9))
                .rotationEffect(.degrees(180))
                .foregroundStyle(theme.danger)
        }
        .shadow(color: .black.opacity(0.3), radius: 3, y: 2)
    }
}

/// The frozen screenshot with its numbered pin. Public so a host's reviewer conversation can show it.
public struct ScreenCommentSnapshot: View {
    let image: UIImage
    let x: Double
    let y: Double
    var number = 1
    var theme = ScreenQATheme.standard
    /// Rounds the displayed image itself; the pin overlay is never clipped.
    var cornerRadius: CGFloat = 0

    public init(
        image: UIImage, x: Double, y: Double, number: Int = 1, theme: ScreenQATheme = .standard,
        cornerRadius: CGFloat = 0
    ) {
        self.image = image
        self.x = x
        self.y = y
        self.number = number
        self.theme = theme
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        GeometryReader { geometry in
            let scale = min(
                geometry.size.width / max(1, image.size.width),
                geometry.size.height / max(1, image.size.height))
            let width = image.size.width * scale
            let height = image.size.height * scale
            Image(uiImage: image)
                .resizable()
                .frame(width: width, height: height)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
                .overlay {
                    ScreenCommentPinBadge(theme: theme, number: number)
                        .scaleEffect(0.7)
                        .position(x: width * x, y: height * y)
                        .offset(y: -13)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityLabel("Screenshot with comment location marked")
        .accessibilityValue("Pin \(number)")
        .accessibilityIdentifier("screenCommentSnapshot")
    }
}

struct ScreenCommentEditor: View {
    @Environment(\.dismiss) private var dismiss
    let theme: ScreenQATheme
    let dictation: ScreenQAConfiguration.Dictation?
    let image: UIImage?
    let metadata: ScreenCommentMetadata
    let number: Int
    let title: String
    let onSave: (String) throws -> Void
    @State private var message: String
    @State private var errorMessage: String?
    @State private var dictationBusy = false
    @FocusState private var messageFocused: Bool

    init(
        theme: ScreenQATheme, dictation: ScreenQAConfiguration.Dictation?,
        image: UIImage?, metadata: ScreenCommentMetadata, number: Int,
        savedMessage: String? = nil, onSave: @escaping (String) throws -> Void
    ) {
        self.theme = theme
        self.dictation = dictation
        self.image = image
        self.metadata = metadata
        self.number = number
        title = savedMessage == nil ? "Add comment" : "Edit comment"
        self.onSave = onSave
        _message = State(initialValue: savedMessage ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { scroll in
                Form {
                    if let image {
                        Section {
                            ScreenCommentSnapshot(
                                image: image, x: metadata.pinX, y: metadata.pinY,
                                number: number, theme: theme, cornerRadius: 12
                            )
                            .frame(height: 344)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
                        }
                    }
                    Section("Comment") {
                        VStack(spacing: 4) {
                            ZStack(alignment: .topLeading) {
                                if message.isEmpty {
                                    Text(
                                        "Add the details that matter: what happened, what you expected, and how to reproduce it. Clear comments help avoid misinterpretation."
                                    )
                                    .foregroundStyle(.secondary)
                                    .padding(.leading, 5)
                                    .padding(.top, 8)
                                    .allowsHitTesting(false)
                                }
                                TextEditor(text: $message)
                                    .scrollContentBackground(.hidden)
                                    .frame(height: 140)
                                    .focused($messageFocused)
                                    .accessibilityIdentifier("screenCommentMessage")
                            }
                            if let dictation {
                                dictation($message, $dictationBusy) { messageFocused = false }
                            }
                        }
                    }
                    .id("commentEditor")
                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(theme.danger)
                    }
                }
                .scrollDismissesKeyboard(.never)
                .onChange(of: messageFocused) { _, focused in
                    if focused { scroll.scrollTo("commentEditor", anchor: .bottom) }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                    if messageFocused { scroll.scrollTo("commentEditor", anchor: .bottom) }
                }
                .onChange(of: message) { _, _ in
                    if messageFocused { scroll.scrollTo("commentEditor", anchor: .bottom) }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        do {
                            try onSave(message.trimmingCharacters(in: .whitespacesAndNewlines))
                            dismiss()
                        } catch { errorMessage = error.localizedDescription }
                    }
                    .disabled(
                        dictationBusy || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || message.count > 5000
                    )
                    .accessibilityIdentifier("saveScreenComment")
                }
            }
        }
    }
}

struct ScreenCommentReview: View {
    @Environment(\.dismiss) private var dismiss
    let configuration: ScreenQAConfiguration
    @ObservedObject var session: ScreenCommentSession
    @State private var discardConfirmation = false
    @State private var editingRecord: ScreenCommentRecord?
    @State private var path = NavigationPath()
    /// The host's optional batch handoff, as chosen for this send.
    @State private var handOff = false
    @State private var handoffOption = false
    @State private var notesDictationBusy = false
    @FocusState private var notesFocused: Bool

    private var theme: ScreenQATheme { configuration.theme }
    private var canHandOff: Bool { configuration.canHandOff(session) }

    /// Review's own Send All, with the handoff choice when one is offered.
    private func send() {
        guard !notesDictationBusy else { return }
        let choice = canHandOff && handOff ? handoffOption : nil
        Task { await configuration.submit(session, handoff: choice) }
    }

    private var sendTitle: String {
        if session.isHandoffPending { return configuration.handoff?.retryTitle ?? "Retry handoff" }
        return "Send All · \(session.records.count) comment\(session.records.count == 1 ? "" : "s")"
    }

    private var uploadProgressTitle: String {
        if session.isHandoffPending { return "Comments saved. Confirming handoff…" }
        return "Uploading \(Int(100 * session.uploadProgress / Double(max(1, session.records.count))))%"
    }

    @ViewBuilder
    private var uploadError: some View {
        if !session.isHandoffPending, let error = session.uploadError {
            Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(theme.danger)
            Text("Your draft remains on this device.")
                .font(.caption)
        }
    }

    private var handoffReceipt: some View {
        Label(
            configuration.handoff?.retryMessage ?? "Comments saved. The next step still needs confirmation.",
            systemImage: "exclamationmark.triangle"
        )
        .font(.footnote)
        .foregroundStyle(theme.danger)
    }

    /// A reviewer conversation's Send All: sends directly, or returns here when a handoff is
    /// offered so the person makes that choice in Review.
    private func sendFromConversation() {
        if canHandOff { path = NavigationPath() } else { send() }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    batchNotes
                    if session.records.isEmpty {
                        ContentUnavailableView(
                            "No screen comments yet", systemImage: "text.bubble",
                            description: Text("Tap + in the QA header, then tap a spot to add a comment.")
                        )
                    }
                    if !session.records.isEmpty { summary }
                    if canHandOff, let handoff = configuration.handoff { handoffOptions(handoff) }
                    ForEach(Array(session.records.enumerated()), id: \.element.id) { index, record in
                        card(for: record, number: index + 1)
                    }
                    uploadError
                    Button("Discard session", role: .destructive) { discardConfirmation = true }
                        .disabled(session.isUploading)
                        .padding(.top, 9)
                }
                .padding(18)
            }
            .background(theme.background)
            .navigationTitle("Screen comments")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 7) {
                    if session.isUploading {
                        ProgressView(
                            value: session.uploadProgress,
                            total: Double(max(1, session.records.count))
                        )
                        Text(uploadProgressTitle)
                            .font(.caption.weight(.semibold))
                        Text(
                            session.isHandoffPending
                                ? "Keep \(session.appName) open until the handoff finishes."
                                : "Keep \(session.appName) open until every comment finishes uploading."
                        )
                        .font(.caption)
                    } else if !session.records.isEmpty {
                        if session.isHandoffPending { handoffReceipt }
                        Button(sendTitle, action: send)
                            .buttonStyle(.borderedProminent)
                            .tint(theme.primary)
                            .foregroundStyle(theme.onPrimary)
                            .disabled(notesDictationBusy)
                            .accessibilityIdentifier("sendScreenComments")
                        if let reviewer = session.reviewer, !session.isHandoffPending {
                            Text("You can send without answering \(reviewer.name)’s questions.")
                                .font(.caption)
                                .foregroundStyle(theme.secondaryText)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
                .padding(.bottom, 5)
                .frame(maxWidth: .infinity)
                .background(theme.background)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }.disabled(session.isUploading)
                }
            }
            .navigationDestination(for: String.self) { recordID in
                if let reviewer = session.reviewer {
                    reviewer.conversation(session: session, recordID: recordID, onSend: sendFromConversation)
                }
            }
            .sheet(item: $editingRecord) { record in
                if let index = session.records.firstIndex(where: { $0.id == record.id }) {
                    configuration.decorateSheet(
                        AnyView(
                            ScreenCommentEditor(
                                theme: theme, dictation: configuration.dictation, image: session.image(for: record),
                                metadata: record.metadata, number: index + 1, savedMessage: record.message
                            ) { message in
                                try session.updateMessage(
                                    for: record.id, message: message, reviewAllowed: configuration.canComment)
                            }))
                }
            }
            .alert("Discard comments?", isPresented: $discardConfirmation) {
                Button("Discard", role: .destructive) {
                    do {
                        try session.discard()
                        dismiss()
                    } catch { session.uploadError = error.localizedDescription }
                }
                Button("Keep", role: .cancel) {}
            } message: {
                Text("The comments and screenshots saved on this device will be deleted.")
            }
            .onChange(of: session.didComplete) { _, complete in
                if complete { dismiss() }
            }
            .interactiveDismissDisabled(session.isUploading)
        }
    }

    private var batchNotes: some View {
        let draft = Binding(get: { session.notes }, set: session.updateNotes)
        return VStack(alignment: .leading, spacing: 8) {
            Text("Notes").font(.headline)
            VStack(alignment: .leading, spacing: 6) {
                TextField("Guidance for this batch…", text: draft, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($notesFocused)
                    .accessibilityLabel("Notes")
                    .accessibilityIdentifier("screenCommentBatchNotes")
                if session.canEditNotes, let dictation = configuration.dictation {
                    dictation(draft, $notesDictationBusy) { notesFocused = false }
                }
            }
            .padding(10)
            .background(theme.surface, in: RoundedRectangle(cornerRadius: 10))
        }
        .disabled(!session.canEditNotes)
    }

    /// The host's batch handoff: a toggle, and its one option once chosen. A handoff already
    /// chosen for this draft stays shown and locked until the batch is handed off.
    private func handoffOptions(_ handoff: ScreenQABatchHandoff) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $handOff) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(handoff.title)
                    Text(handoff.detail).font(.caption).foregroundStyle(theme.secondaryText)
                }
            }
            .accessibilityIdentifier(handoff.accessibilityIdentifier)
            if handOff || session.handoffOption != nil {
                Toggle(isOn: $handoffOption) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(handoff.optionTitle)
                        Text(handoff.optionDetail).font(.caption).foregroundStyle(theme.secondaryText)
                    }
                }
                .accessibilityIdentifier(handoff.optionAccessibilityIdentifier)
            }
        }
        .disabled(session.isUploading || session.handoffOption != nil)
        .onAppear {
            if let saved = session.handoffOption {
                handOff = true
                handoffOption = saved
            }
        }
        .onChange(of: handOff) { _, enabled in
            if !enabled { handoffOption = false }
        }
    }

    /// The feedback count and, before upload, how the review checks work.
    @ViewBuilder private var summary: some View {
        let count = "\(session.records.count) comment\(session.records.count == 1 ? "" : "s")"
        Text(session.isHandoffPending ? "\(count) saved" : "\(count) to send")
            .font(.caption.weight(.bold))
            .foregroundStyle(theme.secondaryText)
        if let reviewer = session.reviewer, !session.isHandoffPending {
            Text(
                "\(reviewer.name) checks each saved comment automatically. Questions can improve the handoff, but you can send at any time."
            )
            .font(.subheadline)
            .foregroundStyle(theme.secondaryText)
        }
    }

    private func card(for record: ScreenCommentRecord, number: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Text("\(number)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(theme.danger, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(record.kindRaw) · \(record.metadata.screenID)")
                        .font(.subheadline.weight(.semibold))
                    Text("Screenshot and pinned location attached")
                        .font(.caption)
                        .foregroundStyle(theme.secondaryText)
                }
                Spacer(minLength: 4)
                if !record.uploaded && !session.isUploading && session.handoffOption == nil
                    && session.sendingRecordID != record.id
                {
                    Button("Remove", role: .destructive) {
                        do { try session.remove(record) } catch {
                            session.uploadError = error.localizedDescription
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .accessibilityIdentifier("removeScreenComment")
                }
            }
            if session.canEdit(record) {
                Button {
                    editingRecord = record
                } label: {
                    HStack(spacing: 12) {
                        commentPreview(for: record, number: number)
                        Image(systemName: "pencil")
                            .foregroundStyle(theme.primary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit comment \(number)")
                .accessibilityValue(record.message)
                .accessibilityIdentifier("editScreenComment")
            } else {
                commentPreview(for: record, number: number)
                    .textSelection(.enabled)
            }
            if let snapshot = record.snapshot {
                DisclosureGroup {
                    Text("Captured at \(snapshot.summary.capturedAt)")
                        .font(.caption).foregroundStyle(theme.secondaryText)
                    ShareLink(item: snapshot.text ?? "", subject: Text("\(session.appName) QA snapshot")) {
                        Label("Share diagnostic JSON", systemImage: "square.and.arrow.up")
                    }
                    Text(snapshot.text ?? "Snapshot unavailable")
                        .font(.system(size: 10, design: .monospaced))
                        .textSelection(.enabled)
                        .lineLimit(16)
                        .accessibilityIdentifier("screenCommentDiagnosticJSON")
                } label: {
                    Text(
                        "Diagnostics v\(snapshot.summary.schemaVersion) · \(snapshot.summary.sectionIDs.count) sections"
                    )
                }
                .font(.caption)
            }
            qaStatus(for: record)
        }
        .padding(15)
        .background(theme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private func commentPreview(for record: ScreenCommentRecord, number: Int) -> some View {
        HStack(alignment: .center, spacing: 12) {
            if let image = session.image(for: record) {
                ScreenCommentSnapshot(
                    image: image, x: record.metadata.pinX, y: record.metadata.pinY,
                    number: number, theme: theme
                )
                .frame(width: 58, height: 78)
                .background(theme.background, in: RoundedRectangle(cornerRadius: 9))
            }
            Text(record.message)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func qaStatus(for record: ScreenCommentRecord) -> some View {
        if record.uploaded {
            Label("Uploaded", systemImage: "checkmark.circle.fill")
                .foregroundStyle(theme.secondaryText)
        } else if session.sendingRecordID == record.id {
            HStack(spacing: 8) {
                ProgressView()
                Text(session.isUploading ? "Sending…" : "Still sending in the background")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(theme.secondaryText)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("screenCommentSending-\(record.id)")
        } else if let reviewer = session.reviewer {
            reviewStatus(for: record, reviewer: reviewer)
        }
    }

    /// The AI review's state for one comment; shown only when the host opted in to a reviewer.
    @ViewBuilder
    private func reviewStatus(for record: ScreenCommentRecord, reviewer: any ScreenCommentReviewer) -> some View {
        let qa = session.qa(for: record.id)
        switch qa.status {
        case .pending, .checking:
            HStack(spacing: 8) {
                ProgressView()
                Text("\(reviewer.name) is checking this comment…")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(theme.secondaryText)
            .padding(9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.background, in: RoundedRectangle(cornerRadius: 12))
        case .ready:
            Label("Ready for handoff", systemImage: "checkmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
                .padding(9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
        case .question:
            NavigationLink(value: record.id) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "questionmark.circle")
                    Text("One detail would help: \(qa.question ?? "Open \(reviewer.name)’s question")")
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .padding(9)
                .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("screenCommentQAQuestion")
        case .unavailable:
            Button {
                session.retryReview(for: record.id)
            } label: {
                Label("\(reviewer.name) couldn’t check · Retry", systemImage: "arrow.clockwise")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.secondaryText)
            }
            .accessibilityIdentifier("retryScreenCommentQA")
        }
    }
}
