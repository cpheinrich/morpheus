import UIKit

/// Sentry 9.26 exposes hierarchy capture only as an event attachment, not a public on-demand
/// serializer. This bounded public-API export also works when SDK delivery is disabled.
@MainActor
public enum QAViewSnapshot {
    public static func capture(window: UIWindow, target: UIView?, nodeLimit: Int = 128) -> [String: Any] {
        let start = ProcessInfo.processInfo.systemUptime
        var nodes: [[String: Any]] = []
        var visited = Set<ObjectIdentifier>()
        var truncated = false
        func append(_ object: NSObject, parent: Int?, depth: Int) {
            guard depth < 18, nodes.count < nodeLimit,
                ProcessInfo.processInfo.systemUptime - start < 0.04
            else {
                truncated = true
                return
            }
            guard visited.insert(ObjectIdentifier(object)).inserted else { return }
            guard let frame = visibleFrame(of: object, in: window) else { return }
            let index = nodes.count
            nodes.append(node(object, index: index, parent: parent, frame: frame))
            if isSecureInput(object) { return }
            if let view = object as? UIView {
                // Frontmost children first so the active sheet wins the bounded traversal.
                for child in view.subviews.reversed() { append(child, parent: index, depth: depth + 1) }
            }
            let count = object.accessibilityElementCount()
            if count > 0, count < Int.max {
                if count > nodeLimit { truncated = true }
                for i in 0..<min(count, nodeLimit) {
                    if let child = object.accessibilityElement(at: i) as? NSObject {
                        append(child, parent: index, depth: depth + 1)
                    }
                }
            }
        }
        append(window, parent: nil, depth: 0)
        var ancestors: [[String: Any]] = []
        var cursor = target
        while let view = cursor, ancestors.count < 12 {
            ancestors.append([
                "class": String(describing: type(of: view)), "identifier": view.accessibilityIdentifier ?? "",
                "framePoints": QASnapshot.rect(view.convert(view.bounds, to: window)),
            ])
            cursor = view.superview
        }
        var controllers: [[String: Any]] = []
        var controller = window.rootViewController
        while let current = controller, controllers.count < 12 {
            controllers.append([
                "class": String(describing: type(of: current)), "title": current.title ?? "",
                "navigationTitles": (current as? UINavigationController)?.viewControllers.compactMap(\.title) ?? [],
            ])
            controller = current.presentedViewController
        }
        return [
            "nodes": nodes, "nodeCount": nodes.count, "nodeLimit": nodeLimit,
            "truncated": truncated, "targetAncestors": ancestors, "presentationChain": controllers,
            "collectionDurationMilliseconds": (ProcessInfo.processInfo.systemUptime - start) * 1000,
        ]
    }

    /// The object's frame in window points, or nil when it is not something a person can see:
    /// a hidden, transparent or off-screen view, an off-screen accessibility element, or neither.
    private static func visibleFrame(of object: NSObject, in window: UIWindow) -> CGRect? {
        if let view = object as? UIView {
            guard !view.isHidden, view.alpha > 0.01 else { return nil }
            let frame = view.convert(view.bounds, to: window)
            guard view === window || (frame.intersects(window.bounds) && !frame.isEmpty) else { return nil }
            return frame
        }
        if let element = object as? UIAccessibilityElement {
            let frame = window.convert(element.accessibilityFrame, from: nil)
            return frame.intersects(window.bounds) ? frame : nil
        }
        return nil
    }

    /// Secure text is never exported, and neither is anything inside it.
    private static func isSecureInput(_ object: NSObject) -> Bool {
        (object as? UITextField)?.isSecureTextEntry == true || (object as? UITextView)?.isSecureTextEntry == true
    }

    private static func node(_ object: NSObject, index: Int, parent: Int?, frame: CGRect) -> [String: Any] {
        var item: [String: Any] = [
            "index": index, "class": String(describing: type(of: object)),
            "framePoints": QASnapshot.rect(frame), "accessibilityElement": object.isAccessibilityElement,
            "label": String((object.accessibilityLabel ?? "").prefix(1000)),
            "value": String((object.accessibilityValue ?? "").prefix(1000)),
            "traits": String(object.accessibilityTraits.rawValue),
        ]
        if let parent { item["parent"] = parent }
        if let view = object as? UIView { addViewState(of: view, to: &item) }
        return item
    }

    /// What a view adds beyond its accessibility: identifier, focus, control state, text and scroll.
    private static func addViewState(of view: UIView, to item: inout [String: Any]) {
        item["identifier"] = view.accessibilityIdentifier ?? ""
        item["focused"] = view.isFirstResponder
        if let control = view as? UIControl {
            item["enabled"] = control.isEnabled
            item["selected"] = control.isSelected
            item["highlighted"] = control.isHighlighted
        }
        if let label = view as? UILabel { item["text"] = String((label.text ?? "").prefix(1000)) }
        if let field = view as? UITextField {
            item["text"] =
                field.isSecureTextEntry ? "[secure input excluded]" : String((field.text ?? "").prefix(1000))
            item["placeholder"] = field.placeholder ?? ""
            if field.isSecureTextEntry { item["value"] = "[secure input excluded]" }
        }
        if let text = view as? UITextView {
            item["text"] =
                text.isSecureTextEntry ? "[secure input excluded]" : String((text.text ?? "").prefix(1000))
            if text.isSecureTextEntry { item["value"] = "[secure input excluded]" }
        }
        if let toggle = view as? UISwitch { item["on"] = toggle.isOn }
        if let scroll = view as? UIScrollView {
            item["scroll"] = [
                "offsetX": scroll.contentOffset.x, "offsetY": scroll.contentOffset.y,
                "contentWidth": scroll.contentSize.width, "contentHeight": scroll.contentSize.height,
                "dragging": scroll.isDragging, "decelerating": scroll.isDecelerating,
            ]
        }
    }
}
