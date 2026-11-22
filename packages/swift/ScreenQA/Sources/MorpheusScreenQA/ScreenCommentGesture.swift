import SwiftUI
import UIKit

/// Observes the app window and keeps QA controls above sheets without taking key-window ownership.
struct ScreenCommentGesture: UIViewRepresentable {
    let configuration: ScreenQAConfiguration
    let enabled: Bool
    let showsHeader: Bool
    let reservesHeaderSpace: Bool
    let showsLauncher: Bool
    let launcherEnabled: Bool
    @Binding var showingExit: Bool
    @Binding var showingAccessExplanation: Bool
    @Binding var candidate: ScreenCommentCandidate?
    @Binding var showingReview: Bool
    let onSave: (ScreenCommentCandidate, String) throws -> Void
    let onEditorDismissed: () -> Void
    let isPlacing: Bool
    @ObservedObject var session: ScreenCommentSession
    let tab: String
    let onToggle: () -> Void
    let onKeepDrafts: () -> Void
    let onDiscardDrafts: () -> Void
    let onAdd: () -> Void
    let onPlace: (CGPoint, UIView?) -> Void
    let onCancelPlacement: () -> Void
    let onReview: () -> Void
    let onSend: () -> Void
    let onExit: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WindowProbeView {
        let view = WindowProbeView()
        view.isUserInteractionEnabled = false
        view.windowDidChange = { [weak coordinator = context.coordinator] window in
            coordinator?.attach(to: window)
        }
        return view
    }

    func updateUIView(_ view: WindowProbeView, context: Context) {
        let coordinator = context.coordinator
        coordinator.configuration = self
        coordinator.attach(to: view.window)
        coordinator.updateHeader()
    }

    static func dismantleUIView(_ view: WindowProbeView, coordinator: Coordinator) {
        view.windowDidChange = nil
        coordinator.detach()
    }

    final class WindowProbeView: UIView {
        var windowDidChange: ((UIWindow?) -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            windowDidChange?(window)
        }
    }

    @MainActor
    final class Coordinator {
        private final class WeakController {
            weak var value: UIViewController?
            let originalInsets: UIEdgeInsets

            init(_ value: UIViewController) {
                self.value = value
                originalInsets = value.additionalSafeAreaInsets
            }
        }

        weak var window: UIWindow?
        var headerWindow: ScreenCommentHeaderWindow?
        private var launcherWindow: ScreenCommentHeaderWindow?
        var configuration: ScreenCommentGesture?
        private var modalInsets: [ObjectIdentifier: WeakController] = [:]
        private var modalRefreshTimer: Timer?
        private var keyboardObservers: [NSObjectProtocol] = []

        func attach(to newWindow: UIWindow?) {
            // SwiftUI briefly removes the probe while replacing tab/navigation content.
            guard let newWindow, window !== newWindow else { return }
            detach()
            window = newWindow
            for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardWillHideNotification] {
                keyboardObservers.append(
                    NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
                        [weak self] notification in
                        let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
                        MainActor.assumeIsolated {
                            QADeviceDiagnostics.keyboardFrame =
                                name == UIResponder.keyboardWillHideNotification ? nil : frame
                        }
                    })
            }
            updateHeader()
        }

        func detach() {
            restoreModalInsets()
            headerWindow?.isHidden = true
            headerWindow = nil
            launcherWindow?.isHidden = true
            launcherWindow = nil
            modalRefreshTimer?.invalidate()
            modalRefreshTimer = nil
            keyboardObservers.forEach(NotificationCenter.default.removeObserver)
            keyboardObservers = []
            QADeviceDiagnostics.keyboardFrame = nil
            window = nil
        }

        func updateHeader() {
            guard let configuration, let window, let scene = window.windowScene,
                configuration.showsLauncher || configuration.showsHeader || configuration.reservesHeaderSpace
            else {
                headerWindow?.isHidden = true
                launcherWindow?.isHidden = true
                modalRefreshTimer?.invalidate()
                modalRefreshTimer = nil
                restoreModalInsets()
                return
            }
            let frame = ScreenCommentLauncher.frame(in: window.bounds, safeArea: window.safeAreaInsets)
            if headerWindow == nil {
                let header = ScreenCommentHeaderWindow(windowScene: scene)
                header.windowLevel = .normal + 1
                header.backgroundColor = .clear
                header.rootViewController = UIHostingController(rootView: overlay(configuration: configuration))
                header.rootViewController?.view.backgroundColor = .clear
                headerWindow = header
            } else {
                (headerWindow?.rootViewController as? UIHostingController<ScreenCommentOverlay>)?
                    .rootView = overlay(configuration: configuration)
            }
            headerWindow?.isPlacing = configuration.enabled && configuration.isPlacing
            headerWindow?.showsHeader = configuration.showsHeader
            headerWindow?.headerTopInset = window.safeAreaInsets.top
            headerWindow?.showingExit = configuration.showingExit
            headerWindow?.showingAccessExplanation = configuration.showingAccessExplanation
            let showsQASheet = configuration.candidate != nil || configuration.showingReview
            headerWindow?.showsQASheet = showsQASheet
            headerWindow?.isHidden = false
            updateLauncher(
                frame: frame, scene: scene, configuration: configuration,
                visible: configuration.showsLauncher && !showsQASheet)
            if configuration.reservesHeaderSpace || configuration.showsLauncher {
                refreshModalInsets()
                if modalRefreshTimer == nil {
                    modalRefreshTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) {
                        [weak self] _ in MainActor.assumeIsolated { self?.refreshModalInsets() }
                    }
                }
            } else {
                modalRefreshTimer?.invalidate()
                modalRefreshTimer = nil
                restoreModalInsets()
            }
        }

        private func updateLauncher(
            frame: CGRect, scene: UIWindowScene, configuration: ScreenCommentGesture, visible: Bool
        ) {
            let root = ScreenCommentLauncherOverlay(
                theme: configuration.configuration.theme,
                frame: frame,
                enabled: configuration.launcherEnabled && !configuration.showingExit
                    && !configuration.showingAccessExplanation,
                onToggle: configuration.onToggle)
            if launcherWindow == nil {
                let launcher = ScreenCommentHeaderWindow(windowScene: scene)
                // Keep the tile above app presentations that can be annotated.
                launcher.windowLevel = .normal + 2
                launcher.backgroundColor = .clear
                launcher.rootViewController = UIHostingController(rootView: root)
                launcher.rootViewController?.view.backgroundColor = .clear
                launcherWindow = launcher
            } else {
                (launcherWindow?.rootViewController as? UIHostingController<ScreenCommentLauncherOverlay>)?
                    .rootView = root
            }
            launcherWindow?.launcherFrame = frame
            launcherWindow?.isHidden = !visible
        }

        private func refreshModalInsets() {
            guard let configuration, configuration.reservesHeaderSpace || configuration.showsLauncher,
                let root = window?.rootViewController
            else { return }
            // The inactive launcher also sits above sheets: keep their navigation actions below it.
            let topInset =
                configuration.reservesHeaderSpace
                ? ScreenCommentToolbar.rowHeight : ScreenCommentLauncher.reservedRowHeight
            var presented = root.presentedViewController
            var activeIDs = Set<ObjectIdentifier>()
            while let controller = presented {
                let id = ObjectIdentifier(controller)
                activeIDs.insert(id)
                if modalInsets[id] == nil { modalInsets[id] = WeakController(controller) }
                if let original = modalInsets[id]?.originalInsets {
                    controller.additionalSafeAreaInsets.top = original.top + topInset
                }
                presented = controller.presentedViewController
            }
            for (id, stored) in modalInsets where !activeIDs.contains(id) {
                stored.value?.additionalSafeAreaInsets = stored.originalInsets
                modalInsets[id] = nil
            }
        }

        private func restoreModalInsets() {
            for stored in modalInsets.values { stored.value?.additionalSafeAreaInsets = stored.originalInsets }
            modalInsets.removeAll()
        }

        private func overlay(configuration: ScreenCommentGesture) -> ScreenCommentOverlay {
            return ScreenCommentOverlay(
                configuration: configuration.configuration,
                session: configuration.session, tab: configuration.tab,
                topInset: window?.safeAreaInsets.top ?? 0,
                showsHeader: configuration.showsHeader,
                showingExit: configuration.$showingExit,
                showingAccessExplanation: configuration.$showingAccessExplanation,
                candidate: configuration.$candidate, showingReview: configuration.$showingReview,
                onSave: configuration.onSave,
                onEditorDismissed: configuration.onEditorDismissed,
                isPlacing: configuration.enabled && configuration.isPlacing,
                onToggle: configuration.onToggle,
                onKeepDrafts: configuration.onKeepDrafts,
                onDiscardDrafts: configuration.onDiscardDrafts,
                onAdd: configuration.onAdd,
                onPlace: { [weak self] point in self?.place(at: point) },
                onCancelPlacement: configuration.onCancelPlacement,
                onReview: configuration.onReview,
                onSend: configuration.onSend,
                onExit: configuration.onExit)
        }

        private func place(at overlayPoint: CGPoint) {
            guard let configuration, configuration.enabled, configuration.isPlacing,
                let window, let headerWindow
            else { return }
            let point = headerWindow.convert(overlayPoint, to: window)
            guard window.bounds.contains(point) else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            configuration.onPlace(point, window.hitTest(point, with: nil))
        }
    }
}

final class ScreenCommentHeaderWindow: UIWindow {
    var isPlacing = false
    var showsHeader = false
    var showingExit = false
    var showingAccessExplanation = false
    var showsQASheet = false
    var launcherFrame = CGRect.null
    var headerTopInset: CGFloat = 0

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        (isPlacing || showingExit || showingAccessExplanation || showsQASheet || launcherFrame.contains(point)
            || (showsHeader && point.y <= headerTopInset + ScreenCommentToolbar.rowHeight))
            && super.point(inside: point, with: event)
    }
}
