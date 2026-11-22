import Foundation
import Testing
import UIKit

@testable import MorpheusScreenQA

/// The pin-time diagnostic packet: bounds, the public hierarchy, explicit screen adapters, and drafts.
@MainActor
@Suite(.serialized)
struct QASnapshotPacketTests {
    @Test func localDateUsesCaptureTimeZoneAcrossUTCDayAndDSTBoundaries() throws {
        let cases: [(String, String, String, Int)] = [
            ("2026-10-27T01:00:00Z", "America/Los_Angeles", "2026-10-26", -25_200),
            ("2026-10-26T12:30:00Z", "Pacific/Kiritimati", "2026-10-27", 50_400),
            ("2026-03-08T06:30:00Z", "America/New_York", "2026-03-08", -18_000),
            ("2026-03-08T07:30:00Z", "America/New_York", "2026-03-08", -14_400),
            ("2026-11-01T03:30:00Z", "America/New_York", "2026-10-31", -14_400),
            ("2026-11-01T06:30:00Z", "America/New_York", "2026-11-01", -18_000),
        ]
        for (stamp, zoneID, expected, offset) in cases {
            let date = try #require(ISO8601DateFormatter().date(from: stamp))
            let zone = try #require(TimeZone(identifier: zoneID))
            let local = QASnapshot.localDate(date, timeZone: zone)
            #expect(local == expected)
            #expect(local.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil)
            #expect(!local.contains("Z"))
            #expect(zone.secondsFromGMT(for: date) == offset)
        }
    }

    @Test func boundedJSONPreservesEvidenceAndMarksOmissions() throws {
        var truncated = false
        let input: [String: Any] = [
            "draftAmount": "24", "password": "do-not-copy", "notes": String(repeating: "x", count: 3000),
            "values": Array(0..<200), "notANumber": Double.infinity,
        ]
        let result = try #require(QASnapshot.bounded(input, truncated: &truncated) as? [String: Any])
        #expect(result["draftAmount"] as? String == "24")
        #expect(result["password"] as? String == "[excluded]")
        #expect((result["notes"] as? String)?.count == 2000)
        #expect((result["values"] as? [Any])?.count == 128)
        #expect(result["notANumber"] is NSNull)
        #expect(truncated)
        #expect(JSONSerialization.isValidJSONObject(result))
    }

    @Test func publicHierarchyIncludesVisibleValuesScrollAndTargetButExcludesHiddenAndSecureText() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.isHidden = false
        let scroll = UIScrollView(frame: window.bounds)
        scroll.contentSize = CGSize(width: 390, height: 1200)
        scroll.contentOffset.y = 10
        window.addSubview(scroll)
        let label = UILabel(frame: CGRect(x: 20, y: 100, width: 200, height: 40))
        label.text = "Visible synthetic value"
        label.accessibilityIdentifier = "testValue"
        scroll.addSubview(label)
        let hidden = UILabel(frame: CGRect(x: 20, y: 150, width: 200, height: 40))
        hidden.text = "must-not-appear"
        hidden.isHidden = true
        scroll.addSubview(hidden)
        let password = UITextField(frame: CGRect(x: 20, y: 200, width: 200, height: 40))
        password.isSecureTextEntry = true
        password.text = "never-export-this"
        scroll.addSubview(password)
        let secureNotes = UITextView(frame: CGRect(x: 20, y: 250, width: 200, height: 40))
        secureNotes.isSecureTextEntry = true
        secureNotes.text = "never-export-secure-notes"
        secureNotes.accessibilityValue = "never-export-secure-notes"
        scroll.addSubview(secureNotes)
        let result = QAViewSnapshot.capture(window: window, target: label)
        let text = String(decoding: try JSONSerialization.data(withJSONObject: result), as: UTF8.self)
        #expect(text.contains("Visible synthetic value"))
        #expect(text.contains("testValue"))
        #expect(text.contains("offsetY"))
        #expect(!text.contains("must-not-appear"))
        #expect(!text.contains("never-export-this"))
        #expect(!text.contains("never-export-secure-notes"))
        #expect((result["targetAncestors"] as? [[String: Any]])?.first?["identifier"] as? String == "testValue")
        #expect(QAViewSnapshot.capture(window: window, target: nil, nodeLimit: 1)["truncated"] as? Bool == true)
        window.isHidden = true
    }

    /// Characterizes the node walk field by field (EV-26-11-04-15.16.47): frontmost first, parent
    /// indexes, control and text state, and what is skipped — transparent, off-screen and empty
    /// views, and anything inside a secure field.
    @Test func hierarchyNodesCarryEachViewsStateInFrontmostFirstOrder() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.isHidden = false
        let root = UIView(frame: window.bounds)
        root.accessibilityIdentifier = "root"
        window.addSubview(root)
        let button = UIButton(frame: CGRect(x: 10, y: 10, width: 100, height: 40))
        button.accessibilityIdentifier = "button"
        button.isSelected = true
        button.isEnabled = false
        root.addSubview(button)
        let toggle = UISwitch(frame: CGRect(x: 10, y: 60, width: 60, height: 30))
        toggle.isOn = true
        toggle.accessibilityIdentifier = "toggle"
        root.addSubview(toggle)
        let field = UITextField(frame: CGRect(x: 10, y: 100, width: 200, height: 40))
        field.text = String(repeating: "a", count: 1200)
        field.placeholder = "Amount"
        field.accessibilityIdentifier = "field"
        root.addSubview(field)
        let secure = UITextField(frame: CGRect(x: 10, y: 150, width: 200, height: 40))
        secure.isSecureTextEntry = true
        secure.text = "secret-text"
        secure.placeholder = "Password"
        secure.accessibilityIdentifier = "secure"
        let inside = UILabel(frame: CGRect(x: 0, y: 0, width: 50, height: 20))
        inside.text = "inside-secure"
        secure.addSubview(inside)
        root.addSubview(secure)
        let transparent = UILabel(frame: CGRect(x: 10, y: 200, width: 100, height: 20))
        transparent.alpha = 0.01
        transparent.text = "transparent"
        root.addSubview(transparent)
        let offscreen = UILabel(frame: CGRect(x: 10, y: 2000, width: 100, height: 20))
        offscreen.text = "offscreen"
        root.addSubview(offscreen)
        let empty = UIView(frame: CGRect(x: 10, y: 240, width: 0, height: 20))
        root.addSubview(empty)

        let result = QAViewSnapshot.capture(window: window, target: nil)
        let nodes = try #require(result["nodes"] as? [[String: Any]])
        let ids = nodes.map { $0["identifier"] as? String ?? "?" }
        #expect(Array(ids.prefix(2)) == ["", "root"])
        let mine = nodes.filter { ["button", "toggle", "field", "secure"].contains($0["identifier"] as? String ?? "") }
        #expect(mine.map { $0["identifier"] as? String } == ["secure", "field", "toggle", "button"])
        let rootIndex = try #require(nodes.firstIndex { $0["identifier"] as? String == "root" })
        for node in mine { #expect(node["parent"] as? Int == rootIndex) }
        #expect(nodes[0]["parent"] == nil)
        for (offset, node) in nodes.enumerated() { #expect(node["index"] as? Int == offset) }
        let text = String(decoding: try JSONSerialization.data(withJSONObject: result), as: UTF8.self)
        for absent in ["inside-secure", "secret-text", "transparent", "offscreen"] { #expect(!text.contains(absent)) }

        let byID = Dictionary(uniqueKeysWithValues: mine.map { ($0["identifier"] as? String ?? "", $0) })
        let buttonNode = try #require(byID["button"])
        #expect(buttonNode["enabled"] as? Bool == false)
        #expect(buttonNode["selected"] as? Bool == true)
        #expect(buttonNode["highlighted"] as? Bool == false)
        #expect(buttonNode["focused"] as? Bool == false)
        #expect(buttonNode["on"] == nil && buttonNode["text"] == nil)
        #expect(byID["toggle"]?["on"] as? Bool == true)
        #expect(byID["toggle"]?["enabled"] as? Bool == true)
        let fieldNode = try #require(byID["field"])
        #expect((fieldNode["text"] as? String)?.count == 1000)
        #expect(fieldNode["placeholder"] as? String == "Amount")
        #expect(fieldNode["value"] as? String != "[secure input excluded]")
        let secureNode = try #require(byID["secure"])
        #expect(secureNode["text"] as? String == "[secure input excluded]")
        #expect(secureNode["value"] as? String == "[secure input excluded]")
        #expect(secureNode["placeholder"] as? String == "Password")
        #expect(nodes.allSatisfy { $0["scroll"] == nil })
        #expect(result["nodeCount"] as? Int == nodes.count)
        window.isHidden = true
    }

    @Test func explicitProviderFreezesStateAndDetachedProvidersAreNotReused() throws {
        let registry = QAScreenRegistry()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.isHidden = false
        let view = UIView(frame: window.bounds)
        window.addSubview(view)
        final class Draft { var amount = "24" }
        let draft = Draft()
        let token = UUID()
        registry.register(token, view: view, id: "water", entityIDs: ["event-1"]) { ["draftAmount": draft.amount] }
        let frozen = try #require(registry.capture(in: window).first)
        draft.amount = "48"
        #expect(frozen.data["draftAmount"] as? String == "24")
        #expect(registry.capture(in: window).first?.data["draftAmount"] as? String == "48")
        view.removeFromSuperview()
        #expect(registry.capture(in: window).isEmpty)
        registry.remove(token)
        window.isHidden = true
    }

    /// The packet a host assembles: its sections in order, the toolkit's view and device sections,
    /// a triage index naming the primary sections, and a summary bound to report and account.
    @Test func builderAssemblesTheVersionedPacketInTheHostsOrder() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.isHidden = false
        defer { window.isHidden = true }
        let registry = QAScreenRegistry()
        let screen = UIView(frame: window.bounds)
        window.addSubview(screen)
        registry.register(UUID(), view: screen, id: "track", entityIDs: ["meal-1"]) { ["selected": "today"] }
        let (metadata, _) = ScreenCommentTargetResolver.capture(
            in: window, point: CGPoint(x: 10, y: 10), hitView: nil, tab: "Track")
        let id = UUID()
        var packet = QASnapshotBuilder(id: id, capturedAt: Date(timeIntervalSince1970: 1_800_000_000))
        packet.section("tester", source: "Synthetic", relevance: "environment", data: ["email": "t@example.com"])
        packet.clockSection(appStartedUptime: 0, sessionID: "session", sessionStartedUptime: 0)
        packet.section("appState", source: "Synthetic", relevance: "primary", data: ["token": "never-copy"])
        packet.viewSections(window: window, target: nil, registry: registry)
        packet.deviceSection(window: window)
        let snapshot = try #require(
            packet.finish(
                metadata: metadata, userID: "uid", testerName: "Synthetic Tester", testerEmail: "t@example.com",
                sentryEventID: nil, collectorVersion: "test-1"))
        #expect(
            snapshot.summary.sectionIDs == ["tester", "clock", "appState", "view.0", "viewHierarchy", "device"])
        #expect(snapshot.summary.primarySectionIDs == ["appState", "view.0", "viewHierarchy"])
        #expect(snapshot.summary.entityIDs == ["meal-1"])
        #expect(snapshot.summary.activeViewID == "track")
        #expect(snapshot.summary.reportID == id.uuidString)
        #expect(snapshot.json.count <= QASnapshot.maximumBytes)
        let object = try #require(JSONSerialization.jsonObject(with: snapshot.json) as? [String: Any])
        #expect(object["collectorVersion"] as? String == "test-1")
        #expect((object["pin"] as? [String: Any])?["screenID"] as? String == "Track/Track")
        let text = try #require(snapshot.text)
        #expect(!text.contains("never-copy"))
        #expect(snapshot.recordingScreenshot(at: Date()).text?.contains("\"status\":\"captured\"") == true)
    }

    @Test func pinTimeAndSnapshotSurviveDraftPersistenceAndLegacyRecordsDecode() throws {
        let uid = "qa-snapshot-test-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let (metadata, target) = ScreenCommentTargetResolver.capture(
            in: window, point: CGPoint(x: 20, y: 20), hitView: nil, tab: "Track")
        let id = UUID()
        let time = Date(timeIntervalSince1970: 1_700_000_000)
        let snapshot = QASnapshot(
            json: Data("{\"schemaVersion\":1}".utf8),
            summary: .init(
                schemaVersion: 1,
                reportID: id.uuidString, capturedAt: QASnapshot.timestamp(time), screenID: "Track", userID: uid,
                testerName: "Synthetic Tester", testerEmail: "tester@example.com", sectionIDs: ["tester"],
                primarySectionIDs: [],
                entityIDs: ["event-1"], truncated: false, sentryEventID: nil))
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { _ in }
        try session.add(
            .init(
                id: id, image: image, jpeg: try ScreenCommentCapture.jpeg(from: image), metadata: metadata,
                liveTarget: target, capturedAt: time, snapshot: snapshot),
            message: "Synthetic comment")
        let reloaded = makeSession()
        reloaded.useAccount(uid)
        let record = try #require(reloaded.records.first)
        #expect(record.id == id.uuidString)
        #expect(record.capturedAt == time)
        #expect(record.snapshot?.json == snapshot.json)
        #expect(record.snapshot?.summary.testerEmail == "tester@example.com")
        #expect(record.snapshot?.sha256.count == 64)
        let encoded = try JSONEncoder().encode(record)
        var legacy = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        legacy.removeValue(forKey: "snapshot")
        let old = try JSONDecoder().decode(
            ScreenCommentRecord.self, from: JSONSerialization.data(withJSONObject: legacy))
        #expect(old.snapshot == nil)
        #expect(old.message == record.message)
    }
}
