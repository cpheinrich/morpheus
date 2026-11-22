import CryptoKit
import Foundation
import SwiftUI
import Testing
import UIKit

@testable import MorpheusScreenQA

// Each test uses synthetic accounts and comments and removes the draft it writes.

/// Records reviews without a network; scripted replies or failures, in order.
@MainActor
final class ScriptedReviewer: ScreenCommentReviewer {
    let name = "Sample Reviewer"
    let conversationTitle = "Sample Reviewer · QA mode"
    var replies: [Result<ScreenCommentQAReply, Error>]
    private(set) var calls: [[ScreenCommentQATurn]] = []
    private(set) var messages: [String] = []

    init(_ replies: [Result<ScreenCommentQAReply, Error>]) { self.replies = replies }

    func review(record: ScreenCommentRecord, image: UIImage?, turns: [ScreenCommentQATurn]) async throws
        -> ScreenCommentQAReply
    {
        calls.append(turns)
        messages.append(record.message)
        return try replies.isEmpty ? Self.ready("Ready.") : replies.removeFirst().get()
    }

    func conversation(session: ScreenCommentSession, recordID: String, onSend: @escaping () -> Void) -> AnyView {
        AnyView(EmptyView())
    }

    static func ready(_ handoff: String) -> ScreenCommentQAReply {
        ScreenCommentQAReply(
            reply: "Thanks.", handoff: handoff, ready: true, question: nil, repositoryContextUsed: false)
    }

    static func question(_ question: String) -> ScreenCommentQAReply {
        ScreenCommentQAReply(
            reply: question, handoff: "Draft handoff.", ready: false, question: question, repositoryContextUsed: true)
    }
}

/// Unit tests have no app to hold a background assertion for.
@MainActor
final class NoBackgroundRuntime: ScreenQABackgroundRuntime {
    func beginFallback(name: String, expirationHandler: @escaping @Sendable () -> Void) -> Bool { false }
    func endFallback() {}
}

@MainActor
func makeSession(reviewer: (any ScreenCommentReviewer)? = nil, appName: String = "Sample App") -> ScreenCommentSession {
    ScreenCommentSession(appName: appName, reviewer: reviewer, backgroundRuntime: { NoBackgroundRuntime() })
}

@MainActor
func addComments(_ count: Int, to session: ScreenCommentSession) throws {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 100, height: 200))
    let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in }
    for index in 0..<count {
        let (metadata, target) = ScreenCommentTargetResolver.capture(
            in: window, point: CGPoint(x: 25, y: 150), hitView: nil, tab: "Track")
        let candidate = ScreenCommentCandidate(
            image: image, jpeg: try ScreenCommentCapture.jpeg(from: image),
            metadata: metadata, liveTarget: target)
        try session.add(candidate, message: "Comment \(index + 1)")
    }
}

@MainActor
private func waitUntil(_ condition: () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(3)
    while !condition() && Date() < deadline { try await Task.sleep(for: .milliseconds(20)) }
}

@MainActor
struct ScreenQASessionTests {
    @Test func batchNotesSurviveRelaunchAndStayFixedAcrossAPartialSend() async throws {
        let uid = "screen-qa-batch-notes-\(UUID().uuidString)"
        let original = makeSession()
        original.useAccount(uid)
        try addComments(2, to: original)
        original.updateNotes("  Keep the two screens consistent.  ")

        let resumed = makeSession()
        resumed.useAccount(uid)
        defer { try? resumed.discard() }
        #expect(resumed.notes == "  Keep the two screens consistent.  ")
        let ids = resumed.records.map(\.id)
        var sent: [String] = []
        await resumed.submit(currentUserID: uid, isAllowed: true) { record, _, _, notes, _, _ in
            #expect(notes == "Keep the two screens consistent.")
            sent.append(record.id)
            if record.id == ids[1] { throw URLError(.timedOut) }
        }
        #expect(!resumed.canEditNotes)
        resumed.updateNotes("A different note")
        await resumed.submit(currentUserID: uid, isAllowed: true) { record, _, _, notes, _, _ in
            #expect(notes == "Keep the two screens consistent.")
            sent.append(record.id)
        }
        #expect(sent == [ids[0], ids[1], ids[1]])
        #expect(resumed.didComplete)
        #expect(resumed.notes.isEmpty)
    }

    @Test func withoutAReviewerNothingIsReviewedAndSendAllSendsEveryComment() async throws {
        let uid = "screen-qa-no-ai-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(2, to: session)
        #expect(session.records.allSatisfy { $0.qa == nil })

        // Every review entry point is inert without a reviewer.
        session.resumeAutomaticReviews(isAllowed: true)
        session.retryReview(for: session.records[0].id)
        session.replyToReviewer(for: session.records[0].id, message: "Should be ignored.")
        #expect(session.records.allSatisfy { $0.qa == nil })

        let ids = session.records.map(\.id)
        var sent: [(String, String, Bool)] = []
        await session.submit(currentUserID: uid, isAllowed: true) { record, photo, sessionID, _, qaReview, progress in
            sent.append((record.id, sessionID, qaReview == nil))
            #expect(photo.starts(with: [0xFF, 0xD8]))
            progress(1)
        }
        #expect(sent.map(\.0) == ids)
        #expect(sent.allSatisfy { $0.2 })
        #expect(Set(sent.map(\.1)).count == 1)
        #expect(session.didComplete)
        #expect(session.records.isEmpty)
    }

    @Test func aReviewerQuestionAndAnswerReachTheReportHandoff() async throws {
        let uid = "screen-qa-review-\(UUID().uuidString)"
        let reviewer = ScriptedReviewer([
            .success(ScriptedReviewer.question("What should happen?")),
            .success(ScriptedReviewer.ready("On Track, the save button should confirm.")),
        ])
        let session = makeSession(reviewer: reviewer)
        session.useAccount(uid)
        try addComments(1, to: session)
        let id = try #require(session.records.first?.id)
        #expect(session.qa(for: id).status == .pending)

        session.resumeAutomaticReviews(isAllowed: true)
        try await waitUntil { session.qa(for: id).status == .question }
        #expect(session.hasUnansweredQuestion)
        #expect(session.qa(for: id).repositoryContextUsed)

        session.replyToReviewer(for: id, message: "It should confirm the save.")
        try await waitUntil { session.qa(for: id).status == .ready }
        #expect(reviewer.calls.count == 2)
        #expect(reviewer.calls[1].last?.text == "It should confirm the save.")

        var review: [String: Any]?
        await session.submit(currentUserID: uid, isAllowed: true) { _, _, _, _, qaReview, _ in review = qaReview }
        #expect(review?["handoff"] as? String == "On Track, the save button should confirm.")
        let transcript = try #require(review?["transcript"] as? String)
        #expect(transcript.contains("Developer: It should confirm the save."))
        #expect(transcript.contains("Sample Reviewer: Thanks."))
        #expect(session.didComplete)
    }

    @Test func editingPersistsTheNewTextAndRechecksItWithAFreshConversation() async throws {
        let uid = "screen-qa-edit-\(UUID().uuidString)"
        let reviewer = ScriptedReviewer([
            .success(ScriptedReviewer.question("Original question?")),
            .success(ScriptedReviewer.ready("Revised handoff.")),
        ])
        let session = makeSession(reviewer: reviewer)
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(2, to: session)
        let first = session.records[0]
        let second = session.records[1]
        let screenshotURL = Self.folder(for: uid).appending(path: "\(first.id).jpg")
        let screenshot = try Data(contentsOf: screenshotURL)
        session.retryReview(for: first.id)
        try await waitUntil { session.qa(for: first.id).status == .question }

        try session.updateMessage(for: first.id, message: first.message, reviewAllowed: true)
        #expect(session.qa(for: first.id).question == "Original question?")
        #expect(reviewer.messages == ["Comment 1"])

        try session.updateMessage(for: first.id, message: "Revised screen comment", reviewAllowed: true)
        try await waitUntil { session.qa(for: first.id).status == .ready }
        #expect(reviewer.messages == ["Comment 1", "Revised screen comment"])
        #expect(reviewer.calls.last?.isEmpty == true)
        #expect(session.qa(for: first.id).handoff == "Revised handoff.")

        let resumed = makeSession()
        resumed.useAccount(uid)
        #expect(resumed.records.map(\.id) == [first.id, second.id])
        #expect(resumed.records.map(\.message) == ["Revised screen comment", "Comment 2"])
        #expect(resumed.records[0].capturedAt == first.capturedAt)
        #expect(resumed.records[0].metadata.pinX == first.metadata.pinX)
        #expect(resumed.records[0].metadata.pinY == first.metadata.pinY)
        var sent: [String] = []
        await resumed.submit(currentUserID: uid, isAllowed: true) { record, photo, _, _, _, _ in
            if record.id == first.id { #expect(photo == screenshot) }
            sent.append(record.message)
        }
        #expect(sent == ["Revised screen comment", "Comment 2"])
    }

    @Test func aPossiblyCommittedReportKeepsItsOriginalTextOnRetry() async throws {
        let uid = "screen-qa-edit-retry-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(2, to: session)
        let first = session.records[0]
        let second = session.records[1]
        await session.submit(currentUserID: uid, isAllowed: true) { _, _, _, _, _, _ in
            throw URLError(.networkConnectionLost)
        }

        let resumed = makeSession()
        resumed.useAccount(uid)
        #expect(!resumed.canEdit(resumed.records[0]))
        #expect(throws: ScreenCommentSessionError.draftUnavailable) {
            try resumed.updateMessage(for: first.id, message: "Unsafe revision", reviewAllowed: false)
        }
        try resumed.updateMessage(for: second.id, message: "Safe revision", reviewAllowed: true)
        #expect(resumed.records.map(\.message) == ["Comment 1", "Safe revision"])
        #expect(resumed.records[1].qa == nil)

        resumed.useAccount("screen-qa-different-account-\(UUID().uuidString)")
        #expect(throws: ScreenCommentSessionError.draftUnavailable) {
            try resumed.updateMessage(for: second.id, message: "Another account's edit", reviewAllowed: true)
        }
    }

    @Test func aDifferentStoredMessageKeepsTheRevisedDraftAndUnlocksTheBatch() async throws {
        let uid = "screen-qa-legacy-edit-retry-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(2, to: session)
        let original = session.records[0]
        let second = session.records[1]
        try ScreenCommentRecord.requireMatchingSentMessage(original.message, expected: original.message)
        #expect(throws: ScreenCommentSessionError.previouslySentDifferentText) {
            try ScreenCommentRecord.requireMatchingSentMessage(nil, expected: original.message)
        }

        try session.updateMessage(for: original.id, message: "Revised text", reviewAllowed: false)
        await session.submit(
            currentUserID: uid, isAllowed: true, handoff: true,
            queue: { _, _, _ in Issue.record("A conflicting batch cannot be queued.") },
            send: { record, _, _, _, _, _ in
                #expect(record.id == original.id)
                try ScreenCommentRecord.requireMatchingSentMessage(original.message, expected: record.message)
            })
        #expect(session.uploadError == ScreenCommentSessionError.previouslySentDifferentText.localizedDescription)
        #expect(!session.didComplete)
        #expect(session.handoffOption == nil)

        let resumed = makeSession()
        resumed.useAccount(uid)
        #expect(resumed.handoffOption == nil)
        #expect(resumed.records.map(\.id) == [original.id, second.id])
        #expect(resumed.records.map(\.message) == ["Revised text", "Comment 2"])
        #expect(resumed.records.map(\.uploaded) == [false, false])
        try resumed.remove(resumed.records[0])
        var queued = [[String]]()
        await resumed.submit(
            currentUserID: uid, isAllowed: true, handoff: false,
            queue: { _, ids, _ in queued.append(ids) },
            send: { record, _, _, _, _, _ in
                #expect(record.id == second.id)
            })
        #expect(queued == [[second.id]])
        #expect(resumed.didComplete)
    }

    @Test func anUnavailableReviewRetriesWithTheEarlierConversation() async throws {
        let uid = "screen-qa-review-retry-\(UUID().uuidString)"
        let reviewer = ScriptedReviewer([.failure(URLError(.notConnectedToInternet))])
        let session = makeSession(reviewer: reviewer)
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(1, to: session)
        let id = try #require(session.records.first?.id)
        session.replyToReviewer(for: id, message: "It should explain what saving changes.")
        try await waitUntil { session.qa(for: id).status == .unavailable }
        #expect(session.qa(for: id).error != nil)

        session.retryReview(for: id)
        try await waitUntil { session.qa(for: id).status == .ready }
        #expect(reviewer.calls.count == 2)
        #expect(reviewer.calls[1].first?.text == "It should explain what saving changes.")
        #expect(session.qa(for: id).error == nil)
    }

    @Test func savesAProtectedPrivateDraftAndDiscardsIt() throws {
        let uid = "screen-qa-draft-\(UUID().uuidString)"
        let session = makeSession(reviewer: ScriptedReviewer([]))
        session.useAccount(uid)
        session.activate()
        try addComments(1, to: session)
        let record = try #require(session.records.first)
        #expect(record.kindRaw == "Bug report")
        #expect(session.qa(for: record.id).status == .pending)
        #expect(session.image(for: record) != nil)

        let resumed = makeSession()
        resumed.useAccount(uid)
        #expect(resumed.records.map(\.id) == [record.id])
        #expect(resumed.sessionID == session.sessionID)
        try resumed.discard()
        #expect(resumed.records.isEmpty)
        #expect(!FileManager.default.fileExists(atPath: Self.folder(for: uid).path))
    }

    /// A draft an earlier build wrote: the original folder and file names, no `snapshot`, and
    /// the saved review state of the time. It must load, show its image and send under its own ids.
    @Test func anEarlierBuildsDraftLoadsAndSendsUnderItsOriginalIDs() async throws {
        let uid = "screen-qa-legacy-\(UUID().uuidString)"
        let folder = Self.folder(for: uid)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let reportID = UUID().uuidString
        let sessionID = UUID().uuidString
        let manifest = """
            {"sessionID":"\(sessionID)","records":[{"id":"\(reportID)","kindRaw":"Bug report",
            "message":"Legacy synthetic comment","capturedAt":720000000,"uploaded":false,
            "metadata":{"pinX":0.25,"pinY":0.75,"screenWidth":100,"screenHeight":200,"screenID":"Track/Track",
            "elementClass":"UIWindow","anchorKind":"screen","anchorX":25,"anchorY":150,"osVersion":"26.0",
            "deviceModel":"iPhone","buildNumber":"1","locale":"en_US"},
            "qa":{"status":"ready","handoff":"Old handoff.","turns":[{"id":"t1","role":"assistant","text":"Ok."}],
            "repositoryContextUsed":false}}]}
            """
        try Data(manifest.utf8).write(to: folder.appending(path: "pending.json"))
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { _ in }
        try ScreenCommentCapture.jpeg(from: image).write(to: folder.appending(path: "\(reportID).jpg"))

        let session = makeSession()
        session.useAccount(uid)
        let record = try #require(session.records.first)
        #expect(session.canEdit(record))
        #expect(record.id == reportID)
        #expect(record.snapshot == nil)
        #expect(record.metadata.elementID == nil)
        #expect(session.sessionID == sessionID)
        #expect(session.image(for: record) != nil)

        var sent: (String, String, [String: Any]?)?
        await session.submit(currentUserID: uid, isAllowed: true) { record, _, sessionID, _, qaReview, _ in
            sent = (record.id, sessionID, qaReview)
        }
        #expect(sent?.0 == reportID)
        #expect(sent?.1 == sessionID)
        // The saved review still reaches the report, labelled for a host without a reviewer now.
        #expect(sent?.2?["handoff"] as? String == "Old handoff.")
        #expect(sent?.2?["transcript"] as? String == "Reviewer: Ok.")
        #expect(!FileManager.default.fileExists(atPath: folder.path))
    }

    @Test func sendingRequiresTheDraftsAccountAndAccess() async throws {
        let uid = "screen-qa-access-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(1, to: session)
        var sends = 0
        await session.submit(currentUserID: "someone-else", isAllowed: true) { _, _, _, _, _, _ in sends += 1 }
        #expect(session.uploadError == ScreenCommentSessionError.wrongAccount.localizedDescription)
        await session.submit(currentUserID: uid, isAllowed: false) { _, _, _, _, _, _ in sends += 1 }
        #expect(session.uploadError == ScreenCommentSessionError.developerModeRequired.localizedDescription)
        #expect(sends == 0)
        #expect(session.records.map(\.uploaded) == [false])
    }

    @Test func aStalledSendKeepsTheDraftAndASecondSendJoinsItInsteadOfSendingAgain() async throws {
        let uid = "screen-comment-stall-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        session.uploadStallTimeout = 0.3
        try addComments(2, to: session)
        let ids = session.records.map(\.id)
        let gate = SendGate()
        var sends = [String]()
        let send: ScreenCommentSession.Sender = { record, _, _, _, _, progress in
            sends.append(record.id)
            progress(1)
            // The second comment stalls after its photo, as in the field report at 95%.
            if record.id == ids[1] { try await gate.wait() }
        }

        await session.submit(currentUserID: uid, isAllowed: true, send: send)
        #expect(!session.isUploading)
        #expect(session.uploadError == ScreenCommentSessionError.uploadStalled(appName: "Sample App").localizedDescription)
        #expect(session.uploadError?.hasPrefix("Sending is taking longer than usual. Sample App keeps trying") == true)
        #expect(session.records.map(\.uploaded) == [true, false])
        #expect(session.sendingRecordID == ids[1])

        // The completion state is on disk: a relaunch would show the first as uploaded.
        let relaunched = makeSession()
        relaunched.useAccount(uid)
        #expect(relaunched.records.map(\.uploaded) == [true, false])

        // Sending again waits on the same send; nothing is sent twice.
        let retry = Task { await session.submit(currentUserID: uid, isAllowed: true, send: send) }
        try await Task.sleep(for: .milliseconds(50))
        #expect(session.isUploading)
        gate.open()
        await retry.value
        #expect(sends == ids)
        #expect(session.didComplete)
        #expect(session.records.isEmpty)
        #expect(session.uploadError == nil)
    }

    @Test func aStalledSendThatFinishesAfterADiscardOrAccountChangeLeavesTheNewSessionAlone() async throws {
        for change in ["discard", "account"] {
            let uid = "screen-comment-detach-\(UUID().uuidString)"
            let session = makeSession()
            session.useAccount(uid)
            session.uploadStallTimeout = 0.3
            try addComments(1, to: session)
            let gate = SendGate()
            var sent = [String]()
            let stalling: ScreenCommentSession.Sender = { record, _, _, _, _, _ in
                sent.append(record.id)
                try await gate.wait()
            }
            await session.submit(currentUserID: uid, isAllowed: true, send: stalling)
            #expect(session.uploadError == ScreenCommentSessionError.uploadStalled(appName: "Sample App").localizedDescription)

            let current = change == "discard" ? uid : "\(uid)-next"
            if change == "discard" { try session.discard() } else { session.useAccount(current) }
            #expect(session.sendingRecordID == nil)
            try addComments(1, to: session)
            let fresh = try #require(session.records.first?.id)

            // The old send lands now; the new session's comment and state stay untouched.
            gate.open()
            try await Task.sleep(for: .milliseconds(50))
            #expect(session.records.map(\.id) == [fresh], "\(change)")
            #expect(session.records.map(\.uploaded) == [false], "\(change)")
            #expect(!session.didComplete, "\(change)")

            // And the next Send sends it rather than joining the detached send.
            await session.submit(currentUserID: current, isAllowed: true) { record, _, _, _, _, _ in
                sent.append(record.id)
            }
            #expect(sent.last == fresh, "\(change)")
            #expect(session.didComplete, "\(change)")
        }
    }

    @Test func aStalledSendThatLaterFailsReportsItsFailure() async throws {
        let uid = "screen-comment-late-failure-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        session.uploadStallTimeout = 0.3
        try addComments(2, to: session)
        let gate = SendGate()
        await session.submit(currentUserID: uid, isAllowed: true) { _, _, _, _, _, _ in
            try await gate.wait()
            throw URLError(.networkConnectionLost)
        }
        #expect(session.uploadError == ScreenCommentSessionError.uploadStalled(appName: "Sample App").localizedDescription)
        let second = session.records[1]
        #expect(!session.canEdit(second))
        #expect(throws: ScreenCommentSessionError.draftUnavailable) {
            try session.updateMessage(for: second.id, message: "Still sending", reviewAllowed: false)
        }
        gate.open()
        try await waitUntil { session.sendingRecordID == nil }
        #expect(session.uploadError == URLError(.networkConnectionLost).localizedDescription)
        #expect(session.records.map(\.uploaded) == [false, false])
        #expect(session.canEdit(second))
        #expect(!session.canEdit(session.records[0]))
        #expect(session.sendingRecordID == nil)
    }

    @Test func anOldAccountsWaiterCannotEndTheNextAccountsSend() async throws {
        let uid = "screen-comment-waiter-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        try addComments(1, to: session)
        let oldGate = SendGate()
        let oldSubmit = Task {
            await session.submit(currentUserID: uid, isAllowed: true) { _, _, _, _, _, _ in try await oldGate.wait() }
        }
        try await Task.sleep(for: .milliseconds(100))
        #expect(session.isUploading)

        let next = "\(uid)-next"
        session.useAccount(next)
        #expect(!session.isUploading)
        try addComments(1, to: session)
        let newGate = SendGate()
        let newSubmit = Task {
            await session.submit(currentUserID: next, isAllowed: true) { _, _, _, _, _, _ in try await newGate.wait() }
        }
        try await Task.sleep(for: .milliseconds(100))
        #expect(session.isUploading)

        // The old account's send and its waiter finish while the new account's send is running.
        oldGate.open()
        await oldSubmit.value
        #expect(session.isUploading)
        #expect(session.uploadError == nil)
        #expect(session.records.map(\.uploaded) == [false])

        newGate.open()
        await newSubmit.value
        #expect(!session.isUploading)
        #expect(session.didComplete)
        session.useAccount(uid)
        try session.discard()
    }

    @Test func aDetachedUploadCannotClearANewerHandoffOnTheSameAccount() async throws {
        let uid = "screen-comment-reattached-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(2, to: session)
        let first = session.records[0]
        let second = session.records[1]
        let oldGate = SendGate()
        let oldSend = Task {
            await session.submit(currentUserID: uid, isAllowed: true, handoff: true) { _, _, _, _, _, _ in
                try await oldGate.wait()
                throw ScreenCommentSessionError.previouslySentDifferentText
            }
        }
        try await waitUntil { session.sendingRecordID == first.id }
        session.useAccount("\(uid)-other")
        session.useAccount(uid)

        await session.submit(currentUserID: uid, isAllowed: true) { _, _, _, _, _, _ in
            throw ScreenCommentSessionError.previouslySentDifferentText
        }
        try session.remove(first)

        let newGate = SendGate()
        var queued = [[String]]()
        let newSend = Task {
            await session.submit(
                currentUserID: uid, isAllowed: true, handoff: false,
                queue: { _, ids, _ in queued.append(ids) },
                send: { _, _, _, _, _, _ in try await newGate.wait() })
        }
        try await waitUntil { session.sendingRecordID == second.id }
        oldGate.open()
        await oldSend.value
        #expect(session.handoffOption == false)
        #expect(session.sendingRecordID == second.id)
        #expect(session.uploadError == nil)

        newGate.open()
        await newSend.value
        #expect(queued == [[second.id]])
        #expect(session.didComplete)
    }

    /// A chosen batch handoff persists with the draft; when the handoff
    /// fails after every report uploaded, the next send, even after relaunch, retries only it.
    @Test func aFailedHandoffRetriesAfterRelaunchWithoutResendingReports() async throws {
        let uid = "screen-qa-handoff-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(2, to: session)
        let ids = session.records.map(\.id)
        let batch = session.sessionID
        var sent = [String]()
        var attempts = 0
        let send: ScreenCommentSession.Sender = { record, _, _, _, _, _ in sent.append(record.id) }
        let queue: ScreenCommentSession.HandoffQueue = { sessionID, reportIDs, option in
            #expect(sessionID == batch)
            #expect(reportIDs == ids)
            #expect(option)
            #expect(sent == ids)
            attempts += 1
            if attempts == 1 { throw URLError(.timedOut) }
        }
        await session.submit(
            currentUserID: uid, isAllowed: true, handoff: true, maximumHandoffMessageBytes: 12_000, queue: queue,
            send: send)
        #expect(!session.didComplete)
        #expect(attempts == 1)
        #expect(session.handoffOption == true)
        // The batch is frozen while its handoff is pending.
        #expect(throws: ScreenCommentSessionError.self) { try addComments(1, to: session) }
        try session.remove(session.records[0])
        #expect(session.records.count == 2)

        let relaunched = makeSession()
        relaunched.useAccount(uid)
        #expect(relaunched.handoffOption == true)
        #expect(relaunched.records.map(\.uploaded) == [true, true])
        await relaunched.submit(currentUserID: uid, isAllowed: true, queue: queue, send: send)
        #expect(relaunched.didComplete)
        #expect(relaunched.didQueueHandoff)
        #expect(sent == ids)
        #expect(attempts == 2)
    }

    /// Only a batch entirely of the session's own kind, within the host's size, can be handed off;
    /// any other batch still sends normally and never calls the handoff.
    @Test func aMixedOrOversizedBatchSendsWithoutTheHandoff() async throws {
        let uid = "screen-qa-handoff-mixed-\(UUID().uuidString)"
        let saved = makeSession()
        saved.useAccount(uid)
        defer { try? saved.discard() }
        try addComments(2, to: saved)
        #expect(saved.supportsHandoffBatch(maximumMessageBytes: 12_000))
        #expect(!saved.supportsHandoffBatch(maximumMessageBytes: 4))
        let manifest = Self.folder(for: uid).appending(path: "pending.json")
        var data = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any])
        var records = try #require(data["records"] as? [[String: Any]])
        records[0]["kindRaw"] = "Feature request"
        data["records"] = records
        try JSONSerialization.data(withJSONObject: data).write(to: manifest)

        let restored = makeSession()
        restored.useAccount(uid)
        #expect(!restored.supportsHandoffBatch(maximumMessageBytes: 12_000))
        var kinds = [String]()
        await restored.submit(
            currentUserID: uid, isAllowed: true, handoff: true, maximumHandoffMessageBytes: 12_000,
            queue: { _, _, _ in Issue.record("A mixed batch must never be handed off.") },
            send: { record, _, _, _, _, _ in kinds.append(record.kindRaw) })
        #expect(restored.didComplete)
        #expect(!restored.didQueueHandoff)
        #expect(kinds == ["Feature request", "Bug report"])
    }

    /// Earlier drafts stored the choice as `factoryFeatureFlag`; the key is kept.
    @Test func theHandoffChoiceUsesTheExistingDraftKey() async throws {
        let uid = "screen-qa-handoff-key-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        defer { try? session.discard() }
        try addComments(1, to: session)
        await session.submit(
            currentUserID: uid, isAllowed: true, handoff: false, queue: { _, _, _ in throw URLError(.timedOut) },
            send: { _, _, _, _, _, _ in })
        let manifest = Self.folder(for: uid).appending(path: "pending.json")
        let data = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any])
        #expect(data["factoryFeatureFlag"] as? Bool == false)
    }

    @Test func aFailedCommentRetriesAloneAndEarlierOnesAreNotResent() async throws {
        let uid = "screen-comment-retry-\(UUID().uuidString)"
        let session = makeSession()
        session.useAccount(uid)
        try addComments(2, to: session)
        let ids = session.records.map(\.id)
        var sends = [String]()
        var failSecond = true
        let send: ScreenCommentSession.Sender = { record, _, _, _, _, _ in
            sends.append(record.id)
            if record.id == ids[1], failSecond {
                failSecond = false
                throw URLError(.networkConnectionLost)
            }
        }

        await session.submit(currentUserID: uid, isAllowed: true, send: send)
        #expect(session.uploadError != nil)
        #expect(session.records.map(\.uploaded) == [true, false])
        await session.submit(currentUserID: uid, isAllowed: true, send: send)
        #expect(sends == [ids[0], ids[1], ids[1]])
        #expect(session.didComplete)
    }

    /// The draft folder the original implementation used, so earlier drafts are found.
    static func folder(for uid: String) -> URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let hash = SHA256.hash(data: Data(uid.utf8)).map { String(format: "%02x", $0) }.joined()
        return support.appending(path: "ScreenComments/\(hash)", directoryHint: .isDirectory)
    }
}

@MainActor
private final class SendGate {
    private var continuation: CheckedContinuation<Void, Never>?
    private var isOpen = false

    func wait() async throws {
        guard !isOpen else { return }
        await withCheckedContinuation { continuation = $0 }
    }

    func open() {
        isOpen = true
        continuation?.resume()
        continuation = nil
    }
}
