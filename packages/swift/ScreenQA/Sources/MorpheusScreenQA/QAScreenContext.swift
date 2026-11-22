import SwiftUI
import UIKit

/// Explicit Release-compatible state adapters. Closures are evaluated only when a pin is captured.
@MainActor
public final class QAScreenRegistry {
    public static let shared = QAScreenRegistry()
    public struct Export {
        public let id: String
        public let entityIDs: [String]
        public let data: [String: Any]
    }
    private struct Entry {
        weak var view: UIView?
        let id: String
        let entityIDs: [String]
        let export: @MainActor () -> [String: Any]
    }
    private var entries: [UUID: Entry] = [:]

    public init() {}

    public func register(
        _ token: UUID, view: UIView, id: String, entityIDs: [String], export: @escaping @MainActor () -> [String: Any]
    ) {
        entries[token] = Entry(view: view, id: id, entityIDs: entityIDs, export: export)
    }
    public func remove(_ token: UUID) { entries[token] = nil }

    public func capture(in window: UIWindow) -> [Export] {
        entries = entries.filter { $0.value.view != nil }
        var top = window.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        let topView = top?.view
        return entries.values.compactMap { entry -> (Entry, Bool, CGFloat)? in
            guard let view = entry.view, view.window === window else { return nil }
            var ancestor: UIView? = view
            while let current = ancestor {
                if current.isHidden || current.alpha <= 0.01 { return nil }
                ancestor = current.superview
            }
            let frame = view.convert(view.bounds, to: window)
            guard !frame.isEmpty, frame.intersects(window.bounds) else { return nil }
            return (entry, topView.map { view.isDescendant(of: $0) } ?? false, frame.width * frame.height)
        }.sorted {
            if $0.1 != $1.1 { return $0.1 }
            if $0.2 != $1.2 { return $0.2 < $1.2 }
            return $0.0.id < $1.0.id
        }.prefix(12).map { entry, _, _ in
            var data = entry.export()
            data["viewID"] = entry.id
            data["entityIDs"] = entry.entityIDs
            data["providerVersion"] = 1
            return Export(id: entry.id, entityIDs: entry.entityIDs, data: data)
        }
    }
}

private struct QAScreenProbe: UIViewRepresentable {
    let id: String
    let entityIDs: [String]
    let export: @MainActor () -> [String: Any]
    func makeCoordinator() -> UUID { UUID() }
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        QAScreenRegistry.shared.register(context.coordinator, view: view, id: id, entityIDs: entityIDs, export: export)
    }
    static func dismantleUIView(_ view: UIView, coordinator: UUID) { QAScreenRegistry.shared.remove(coordinator) }
}

extension View {
    /// Registers this screen's explicit QA state, evaluated only when a pin is captured.
    public func qaSnapshotContext(
        _ id: String, enabled: Bool, entityIDs: [String] = [],
        data: @escaping @MainActor () -> [String: Any]
    ) -> some View {
        background {
            if enabled { QAScreenProbe(id: id, entityIDs: entityIDs, export: data) }
        }
    }
}
