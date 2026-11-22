import CryptoKit
import Foundation
import UIKit

/// A pin-time, versioned evidence packet. JSON stays separate from the feedback envelope.
public struct QASnapshot: Codable {
    public static let schemaVersion = 1
    public static let maximumBytes = 128_000
    public let json: Data
    public let summary: Summary

    public init(json: Data, summary: Summary) {
        self.json = json
        self.summary = summary
    }

    public struct Summary: Codable {
        public let schemaVersion: Int
        public let reportID: String
        public let capturedAt: String
        public let screenID: String
        public let userID: String
        public let testerName: String
        public let testerEmail: String
        public let sectionIDs: [String]
        public let primarySectionIDs: [String]
        public let entityIDs: [String]
        public let truncated: Bool
        public let sentryEventID: String?
        public var activeViewID: String? = nil

        public init(
            schemaVersion: Int, reportID: String, capturedAt: String, screenID: String, userID: String,
            testerName: String, testerEmail: String, sectionIDs: [String], primarySectionIDs: [String],
            entityIDs: [String], truncated: Bool, sentryEventID: String?, activeViewID: String? = nil
        ) {
            self.schemaVersion = schemaVersion
            self.reportID = reportID
            self.capturedAt = capturedAt
            self.screenID = screenID
            self.userID = userID
            self.testerName = testerName
            self.testerEmail = testerEmail
            self.sectionIDs = sectionIDs
            self.primarySectionIDs = primarySectionIDs
            self.entityIDs = entityIDs
            self.truncated = truncated
            self.sentryEventID = sentryEventID
            self.activeViewID = activeViewID
        }

        public var firestoreData: [String: Any] {
            var data: [String: Any] = [
                "schemaVersion": schemaVersion, "reportID": reportID, "capturedAt": capturedAt,
                "screenID": screenID, "testerName": testerName, "sectionIDs": sectionIDs,
                "primarySectionIDs": primarySectionIDs, "entityIDs": entityIDs, "truncated": truncated,
            ]
            if let sentryEventID { data["sentryEventID"] = sentryEventID }
            if let activeViewID { data["activeViewID"] = activeViewID }
            return data
        }
    }

    public func recordingScreenshot(at date: Date) -> QASnapshot {
        guard var object = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any],
            var screenshot = object["screenshot"] as? [String: Any]
        else { return self }
        screenshot["capturedAt"] = Self.timestamp(date)
        screenshot["status"] = "captured"
        object["screenshot"] = screenshot
        guard let updated = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
            updated.count <= Self.maximumBytes
        else { return self }
        return QASnapshot(json: updated, summary: summary)
    }

    public var sha256: String { SHA256.hash(data: json).map { String(format: "%02x", $0) }.joined() }
    public var text: String? { String(data: json, encoding: .utf8) }

    /// Foundation already supplies JSON encoding; no additional serializer dependency is needed.
    public static func value<T: Encodable>(_ value: T) -> Any {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(value),
            let object = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
        else { return ["unavailableReason": "Value could not be encoded"] }
        return object
    }

    public static func timestamp(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    public static func localDate(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    public static func rect(_ rect: CGRect) -> [String: Double] {
        ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]
    }

    /// Bounds arbitrary visible strings/collections without cutting a JSON document in half.
    public static func bounded(_ value: Any, truncated: inout Bool, depth: Int = 0) -> Any {
        guard depth < 16 else {
            truncated = true
            return NSNull()
        }
        if let text = value as? String {
            if text.count > 2000 { truncated = true }
            return String(text.prefix(2000))
        }
        if let array = value as? [Any] {
            if array.count > 128 { truncated = true }
            return array.prefix(128).map { bounded($0, truncated: &truncated, depth: depth + 1) }
        }
        if let map = value as? [String: Any] {
            var result: [String: Any] = [:]
            if map.count > 64 { truncated = true }
            for key in map.keys.sorted().prefix(64) {
                // Never serialize credentials or binary media as diagnostic state.
                if ["authorization", "password", "token", "apikey", "base64", "thumbnailbase64"].contains(
                    key.lowercased())
                {
                    result[key] = "[excluded]"
                    continue
                }
                result[String(key.prefix(160))] = bounded(map[key]!, truncated: &truncated, depth: depth + 1)
            }
            return result
        }
        if let number = value as? NSNumber { return number.doubleValue.isFinite ? number : NSNull() }
        if value is NSNull { return value }
        truncated = true
        return NSNull()
    }
}

/// Assembles the versioned pin-time packet: bounded sections in the order the host adds them, a
/// triage index, and a whole-packet byte limit that drops section data from the end first.
@MainActor
public struct QASnapshotBuilder {
    public let id: UUID
    public let capturedAt: Date
    public let time: String
    private let started = ProcessInfo.processInfo.systemUptime
    private var sections: [[String: Any]] = []
    private var anyTruncation = false
    private var exports: [QAScreenRegistry.Export] = []

    public init(id: UUID, capturedAt: Date) {
        self.id = id
        self.capturedAt = capturedAt
        time = QASnapshot.timestamp(capturedAt)
    }

    /// Adds one section. Its data is bounded, and replaced by a reason when over 48,000 bytes.
    public mutating func section(
        _ id: String, source: String, relevance: String = "supporting", status: String = "captured",
        notes: String = "", data: [String: Any]
    ) {
        var truncated = data["truncated"] as? Bool ?? false
        var bounded = QASnapshot.bounded(data, truncated: &truncated) as? [String: Any] ?? [:]
        if let encoded = try? JSONSerialization.data(withJSONObject: bounded), encoded.count > 48_000 {
            bounded = ["unavailableReason": "Section exceeded 48,000 bytes; use related entity IDs and screenshot"]
            truncated = true
        }
        anyTruncation = anyTruncation || truncated
        sections.append([
            "id": id, "schemaVersion": 1, "source": source, "relevance": relevance,
            "status": truncated ? "partial" : status, "capturedAt": time,
            "truncated": truncated, "notes": notes, "data": bounded,
        ])
    }

    /// Wall and monotonic clocks at pin time, and the QA session they belong to.
    public mutating func clockSection(
        appStartedUptime: TimeInterval, sessionID: String, sessionStartedUptime: TimeInterval
    ) {
        let zone = TimeZone.current
        section(
            "clock", source: "Foundation wall and monotonic clocks", relevance: "environment",
            data: [
                "pinTimeUTC": time, "timezone": zone.identifier,
                "utcOffsetSeconds": zone.secondsFromGMT(for: capturedAt),
                "localDate": QASnapshot.localDate(capturedAt, timeZone: zone),
                "systemUptimeSeconds": started,
                "appElapsedSeconds": max(0, started - appStartedUptime),
                "qaSessionElapsedThisLaunchSeconds": max(0, started - sessionStartedUptime), "qaSessionID": sessionID,
            ])
    }

    /// The visible screens' explicit adapters (`qaSnapshotContext`), then the public UIKit hierarchy.
    public mutating func viewSections(window: UIWindow, target: UIView?, registry: QAScreenRegistry? = nil) {
        exports = (registry ?? .shared).capture(in: window)
        for (index, item) in exports.enumerated() {
            section("view.\(index)", source: item.id, relevance: index == 0 ? "primary" : "supporting", data: item.data)
        }
        if exports.isEmpty {
            section(
                "view.0", source: "Visible screen adapter", relevance: "primary", status: "unavailable",
                notes: "No explicit adapter on this screen; appState and semantic hierarchy remain available", data: [:]
            )
        }
        section(
            "viewHierarchy", source: "Public UIKit/accessibility APIs, on demand", relevance: "primary",
            status: "partial",
            notes: "Best effort: SwiftUI rendering does not expose every text/layout node. No private layout APIs.",
            data: QAViewSnapshot.capture(window: window, target: target))
    }

    public mutating func deviceSection(window: UIWindow) {
        section(
            "device", source: "UIKit and uname", relevance: "environment",
            data: QADeviceDiagnostics.capture(window: window))
    }

    /// The finished packet, or nil when even its index exceeds the byte limit.
    public func finish(
        metadata: ScreenCommentMetadata, userID: String, testerName: String, testerEmail: String,
        sentryEventID: String?, collectorVersion: String
    ) -> QASnapshot? {
        var sections = sections
        var anyTruncation = anyTruncation
        let primary = sections.filter { $0["relevance"] as? String == "primary" }.compactMap { $0["id"] as? String }
        let entityIDs = Array(Set(exports.flatMap { $0.entityIDs })).sorted().prefix(32).map { String($0.prefix(160)) }
        var packet: [String: Any] = [
            "schemaVersion": QASnapshot.schemaVersion, "collectorVersion": collectorVersion, "reportID": id.uuidString,
            "capturedAt": time, "screenID": metadata.screenID, "pin": metadata.firestoreData,
            "sections": sections,
            "triage": [
                "primarySectionIDs": primary, "entityIDs": entityIDs,
                "activeViewID": exports.first?.id ?? "unavailable",
                "targetElementID": metadata.elementID ?? "",
                "guidance":
                    "Start with pin, screenshot, active view and errors. Environment/supporting sections are context, not proof of cause. Status/truncation describe missing evidence.",
            ],
            "collectionDurationMilliseconds": (ProcessInfo.processInfo.systemUptime - started) * 1000,
            "screenshot": ["status": "capturedSeparately", "maximumLongEdgePixels": 1600, "maximumBytes": 2_000_000],
        ]
        // If the combined packet is too large, retain each section's index and mark omitted data.
        var json = try? JSONSerialization.data(withJSONObject: packet, options: [.sortedKeys])
        if (json?.count ?? Int.max) > QASnapshot.maximumBytes - 512 {
            for index in sections.indices.reversed() {
                sections[index]["data"] = ["unavailableReason": "Total packet byte limit"]
                sections[index]["status"] = "partial"
                sections[index]["truncated"] = true
                packet["sections"] = sections
                anyTruncation = true
                json = try? JSONSerialization.data(withJSONObject: packet, options: [.sortedKeys])
                if (json?.count ?? Int.max) <= QASnapshot.maximumBytes - 512 { break }
            }
        }
        guard let json, json.count <= QASnapshot.maximumBytes else { return nil }
        return QASnapshot(
            json: json,
            summary: .init(
                schemaVersion: 1, reportID: id.uuidString, capturedAt: time, screenID: metadata.screenID,
                userID: userID, testerName: String(testerName.prefix(320)),
                testerEmail: String(testerEmail.prefix(320)),
                sectionIDs: sections.compactMap { $0["id"] as? String }, primarySectionIDs: primary,
                entityIDs: entityIDs, truncated: anyTruncation, sentryEventID: sentryEventID,
                activeViewID: exports.first?.id))
    }
}

/// The device, display, accessibility and keyboard state at pin time.
@MainActor
public enum QADeviceDiagnostics {
    /// The keyboard's frame in screen points while it is shown, kept by the QA window coordinator.
    public static var keyboardFrame: CGRect?

    public static func capture(window: UIWindow) -> [String: Any] {
        var system = utsname()
        uname(&system)
        let hardware = withUnsafePointer(to: &system.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        #if targetEnvironment(simulator)
            let simulator = true
            let simulatedHardware = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "unknown"
        #else
            let simulator = false
            let simulatedHardware = "notApplicable"
        #endif
        let inset = window.safeAreaInsets
        return [
            "hardwareIdentifier": hardware, "simulator": simulator, "simulatedHardwareIdentifier": simulatedHardware,
            "deviceFamily": UIDevice.current.model,
            "osVersion": UIDevice.current.systemVersion,
            "osBuild": ProcessInfo.processInfo.operatingSystemVersionString,
            "orientation": window.windowScene?.interfaceOrientation.rawValue ?? 0,
            "windowPoints": QASnapshot.rect(window.bounds), "scale": window.screen.scale,
            "pixelWidth": window.screen.nativeBounds.width, "pixelHeight": window.screen.nativeBounds.height,
            "safeAreaPoints": ["top": inset.top, "bottom": inset.bottom, "left": inset.left, "right": inset.right],
            "dynamicType": window.traitCollection.preferredContentSizeCategory.rawValue,
            "interfaceStyle": window.traitCollection.userInterfaceStyle.rawValue,
            "reduceMotion": UIAccessibility.isReduceMotionEnabled,
            "reduceTransparency": UIAccessibility.isReduceTransparencyEnabled,
            "voiceOver": UIAccessibility.isVoiceOverRunning,
            "keyboardFrameScreenPoints": keyboardFrame.map(QASnapshot.rect) as Any? ?? NSNull(),
            "keyboardVisible": keyboardFrame.map { $0.intersects(window.screen.bounds) } ?? false,
            "applicationState": UIApplication.shared.applicationState.rawValue,
            "sceneActivation": window.windowScene?.activationState.rawValue ?? -1,
        ]
    }
}
