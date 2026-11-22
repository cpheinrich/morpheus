import SwiftUI
import Testing
import UIKit

@testable import MorpheusScreenQA

/// Pin targets, live anchors, the QA windows' touch handling, and screenshot encoding.
@MainActor
struct ScreenQATargetTests {
    @Test func launcherStartsAtTheTopmostSafeTouchBoundary() {
        let bounds = CGRect(x: 0, y: 0, width: 390, height: 844)
        // The system owns the status row, so the launcher starts below its safe area.
        #expect(
            ScreenCommentLauncher.frame(
                in: bounds, safeArea: UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0))
                == CGRect(x: 311, y: 59, width: 44, height: 44))
        // A taller inset moves the launcher down with the safe area.
        #expect(
            ScreenCommentLauncher.frame(
                in: CGRect(x: 0, y: 0, width: 402, height: 874),
                safeArea: UIEdgeInsets(top: 62, left: 0, bottom: 34, right: 0))
                == CGRect(x: 323, y: 62, width: 44, height: 44))
        // Landscape's side inset keeps it clear of the sensor housing; no inset at the top stays on screen.
        #expect(
            ScreenCommentLauncher.frame(
                in: CGRect(x: 0, y: 0, width: 844, height: 390),
                safeArea: UIEdgeInsets(top: 0, left: 59, bottom: 21, right: 59))
                == CGRect(x: 706, y: 0, width: 44, height: 44))
    }

    @Test func idleOverlayPassesTouchesThroughExceptAtLauncher() {
        let window = ScreenCommentHeaderWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.launcherFrame = CGRect(x: 318, y: 63, width: 44, height: 44)
        #expect(window.point(inside: CGPoint(x: 340, y: 85), with: nil))
        #expect(!window.point(inside: CGPoint(x: 200, y: 775), with: nil))
        #expect(!window.point(inside: CGPoint(x: 100, y: 20), with: nil))
        window.showsHeader = true
        window.headerTopInset = 115
        #expect(window.point(inside: CGPoint(x: 100, y: 20), with: nil))
        #expect(!window.point(inside: CGPoint(x: 100, y: 400), with: nil))
        window.isPlacing = true
        #expect(window.point(inside: CGPoint(x: 100, y: 400), with: nil))
        window.isPlacing = false
        window.showingExit = true
        #expect(window.point(inside: CGPoint(x: 100, y: 400), with: nil))
        window.showingExit = false
        window.showsQASheet = true
        #expect(window.point(inside: CGPoint(x: 100, y: 400), with: nil))
    }

    @Test func transientProbeDetachmentDoesNotLoseActiveWindow() {
        let coordinator = ScreenCommentGesture.Coordinator()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        coordinator.attach(to: window)

        // Tab and navigation transitions may remove the probe for one layout pass.
        coordinator.attach(to: nil)
        #expect(coordinator.window === window)

        coordinator.detach()
        #expect(coordinator.window == nil)
    }

    @Test func ignoresOwnSheetTitlesWhenResolvingUnderlyingScreen() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let screenBar = UINavigationBar(frame: CGRect(x: 0, y: 50, width: 390, height: 44))
        screenBar.items = [UINavigationItem(title: "Track")]
        window.addSubview(screenBar)
        let editorBar = UINavigationBar(frame: CGRect(x: 0, y: 50, width: 390, height: 44))
        editorBar.items = [UINavigationItem(title: "Add comment")]
        window.addSubview(editorBar)
        #expect(ScreenCommentTargetResolver.screenID(in: window, tab: "Track") == "Track/Track")

        // A reviewer's conversation title is ignored only once a controller with that reviewer exists.
        let saved = ScreenCommentTargetResolver.ownTitles
        defer { ScreenCommentTargetResolver.ownTitles = saved }
        editorBar.items = [UINavigationItem(title: "Sample Reviewer · QA mode")]
        _ = ScreenQAController(session: makeSession())
        #expect(ScreenCommentTargetResolver.screenID(in: window, tab: "Track") == "Track/Sample Reviewer · QA mode")
        _ = ScreenQAController(session: makeSession(reviewer: ScriptedReviewer([])))
        #expect(ScreenCommentTargetResolver.screenID(in: window, tab: "Track") == "Track/Track")
    }

    @Test func targetTracksUnderlyingScrollContent() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 100, width: 390, height: 600))
        scroll.contentSize = CGSize(width: 390, height: 1200)
        let content = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 1200))
        content.accessibilityIdentifier = "trackTimeline"
        scroll.addSubview(content)
        window.addSubview(scroll)
        let point = CGPoint(x: 120, y: 250)
        let (metadata, target) = ScreenCommentTargetResolver.capture(
            in: window, point: point, hitView: content, tab: "Track")
        #expect(metadata.elementID == "trackTimeline")
        #expect(metadata.anchorKind == "element")
        #expect(metadata.pinX == 120.0 / 390.0)
        #expect(metadata.pinY == 250.0 / 844.0)
        #expect(content.isDescendant(of: window))
        #expect(window.bounds.contains(content.convert(target.pointInView, to: window)))
        #expect(scroll.bounds.contains(window.convert(point, to: scroll)))
        #expect(target.position(in: window, currentScreenID: metadata.screenID)?.y == 250)
        scroll.contentOffset.y = 80
        #expect(target.position(in: window, currentScreenID: metadata.screenID)?.y == 170)
        #expect(target.position(in: window, currentScreenID: "Chat/Chat") == nil)
    }

    @Test func screenIdentifierOutsideScrollDoesNotFreezePin() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let screen = UIView(frame: window.bounds)
        screen.accessibilityIdentifier = "todayScreen"
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 100, width: 390, height: 600))
        scroll.contentSize = CGSize(width: 390, height: 1200)
        let content = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 1200))
        window.addSubview(screen)
        screen.addSubview(scroll)
        scroll.addSubview(content)
        let (metadata, target) = ScreenCommentTargetResolver.capture(
            in: window, point: CGPoint(x: 120, y: 250), hitView: content, tab: "Track")
        #expect(metadata.anchorKind == "scroll")
        #expect(target.position(in: window, currentScreenID: metadata.screenID)?.y == 250)
        scroll.contentOffset.y = 80
        #expect(target.position(in: window, currentScreenID: metadata.screenID)?.x == 120)
        #expect(target.position(in: window, currentScreenID: metadata.screenID)?.y == 170)
    }

    @Test func reattachesScrollAnchorAfterViewReplacement() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let oldScroll = UIScrollView(frame: CGRect(x: 0, y: 100, width: 390, height: 600))
        oldScroll.contentSize = CGSize(width: 390, height: 1200)
        window.addSubview(oldScroll)
        let point = CGPoint(x: 120, y: 250)
        let (metadata, target) = ScreenCommentTargetResolver.capture(
            in: window, point: point, hitView: oldScroll, tab: "Track")
        #expect(metadata.anchorKind == "scroll")
        let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in }
        let candidate = ScreenCommentCandidate(
            image: image, jpeg: try ScreenCommentCapture.jpeg(from: image),
            metadata: metadata, liveTarget: target)
        let session = makeSession()
        session.useAccount("reattach-\(UUID().uuidString)")
        try session.add(candidate, message: "The pin should follow this scroll view.")
        let record = try #require(session.records.first)
        oldScroll.removeFromSuperview()
        let replacement = UIScrollView(frame: oldScroll.frame)
        replacement.contentSize = CGSize(width: 390, height: 1200)
        window.addSubview(replacement)
        #expect(session.livePosition(for: record, in: window, tab: "Track")?.y == 250)
        replacement.contentOffset.y = 80
        #expect(metadata.anchorY == 150)
        let rebound = ScreenCommentLiveTarget(
            view: replacement,
            pointInView: CGPoint(x: metadata.anchorX, y: metadata.anchorY),
            screenID: metadata.screenID, screenPoint: point)
        #expect(rebound.position(in: window, currentScreenID: metadata.screenID)?.y == 170)
        #expect(session.livePosition(for: record, in: window, tab: "Track")?.y == 170)
        try session.discard()
    }

    @Test func detachedSheetAnchorDoesNotLeavePinOnUnderlyingScreen() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.isHidden = false
        let amount = UIView(frame: CGRect(x: 90, y: 220, width: 180, height: 70))
        amount.accessibilityIdentifier = "waterAmount"
        window.addSubview(amount)
        let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in }
        let (metadata, target) = ScreenCommentTargetResolver.capture(
            in: window, point: CGPoint(x: 150, y: 250), hitView: amount, tab: "Track")
        let candidate = ScreenCommentCandidate(
            image: image, jpeg: try ScreenCommentCapture.jpeg(from: image),
            metadata: metadata, liveTarget: target)
        let session = makeSession()
        session.useAccount("sheet-anchor-\(UUID().uuidString)")
        try session.add(candidate, message: "The amount field is hard to use.")
        let record = try #require(session.records.first)
        #expect(session.livePosition(for: record, in: window, tab: "Track") != nil)
        amount.removeFromSuperview()
        #expect(session.livePosition(for: record, in: window, tab: "Track") == nil)
        let reopened = UIView(frame: amount.frame)
        reopened.accessibilityIdentifier = "waterAmount"
        window.addSubview(reopened)
        #expect(session.livePosition(for: record, in: window, tab: "Track") != nil)
        try session.discard()
        window.isHidden = true
    }

    @Test func reviewerThumbnailUses1024PixelWidth() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1800, height: 3000)).image { context in
            UIColor.white.setFill()
            context.cgContext.fill(CGRect(x: 0, y: 0, width: 1800, height: 3000))
        }
        let data = try #require(ScreenCommentCapture.thumbnailJPEG(image))
        let thumbnail = try #require(UIImage(data: data))
        #expect(thumbnail.cgImage?.width == 1024)
        #expect(thumbnail.cgImage?.height == 1707)
        #expect(data.starts(with: [0xFF, 0xD8]))
    }

    @Test func savedScreenshotsAreBoundedJPEGs() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 2400, height: 1200)).image { context in
            UIColor.gray.setFill()
            context.cgContext.fill(CGRect(x: 0, y: 0, width: 2400, height: 1200))
        }
        let data = try ScreenCommentCapture.jpeg(from: image)
        let saved = try #require(UIImage(data: data)?.cgImage)
        #expect(max(saved.width, saved.height) == ScreenCommentCapture.maximumPixelSize)
        #expect(data.count <= ScreenCommentCapture.maximumBytes)
        #expect(throws: ScreenCommentCapture.Error.self) { try ScreenCommentCapture.boundedJPEG(from: Data("x".utf8)) }
    }
}
