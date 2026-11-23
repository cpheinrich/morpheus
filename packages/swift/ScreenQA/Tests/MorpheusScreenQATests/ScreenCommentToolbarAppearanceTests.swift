import Foundation
import SwiftUI
import Testing
import UIKit

@testable import MorpheusScreenQA

// Renders the toolbar with a synthetic session; no app or user data is involved.

/// WCAG relative-luminance contrast ratio of two opaque colors.
private func contrast(_ a: UIColor, _ b: UIColor) -> CGFloat {
    func luminance(_ color: UIColor) -> CGFloat {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, alpha: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &alpha)
        func linear(_ c: CGFloat) -> CGFloat { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }
    let (high, low) = (max(luminance(a), luminance(b)), min(luminance(a), luminance(b)))
    return (high + 0.05) / (low + 0.05)
}

private func luminance(atX x: Int, y: Int, of image: CGImage) -> CGFloat {
    var pixel = [UInt8](repeating: 0, count: 4)
    let context = CGContext(
        data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.draw(image, in: CGRect(x: -x, y: y - image.height + 1, width: image.width, height: image.height))
    return (0.2126 * CGFloat(pixel[0]) + 0.7152 * CGFloat(pixel[1]) + 0.0722 * CGFloat(pixel[2])) / 255
}

@MainActor
@Suite struct ScreenCommentToolbarAppearanceTests {
    @Test(arguments: [UIUserInterfaceStyle.light, .dark])
    func reviewAndExitPillsKeepTextContrast(style: UIUserInterfaceStyle) {
        let traits = UITraitCollection(userInterfaceStyle: style)
        let foreground = ScreenCommentToolbar.pillForeground.resolvedColor(with: traits)
        let background = ScreenCommentToolbar.pillBackground.resolvedColor(with: traits)
        var alpha: CGFloat = 0
        background.getWhite(nil, alpha: &alpha)
        #expect(alpha == 1, "an opaque pill does not take its contrast from what is behind it")
        // WCAG AA for normal-size text; the former white pill in dark appearance scores about 1.
        #expect(contrast(foreground, background) >= 4.5)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func rendersToolbarInEachAppearance(scheme: ColorScheme) throws {
        let session = makeSession()
        let toolbar = ScreenCommentToolbar(
            theme: .standard, session: session, topInset: 0, isPlacing: false,
            onAdd: {}, onCancelPlacement: {}, onReview: {}, onSend: {}, onExit: {}
        )
        .frame(width: 390)
        .environment(\.colorScheme, scheme)
        let renderer = ImageRenderer(content: toolbar)
        renderer.scale = 2
        let image = try #require(renderer.uiImage)
        let cgImage = try #require(image.cgImage)
        let name = "ScreenCommentToolbar-\(scheme == .dark ? "dark" : "light").png"
        Attachment.record(try #require(image.pngData()), named: name)

        // The Review pill's left end, inside the capsule and clear of its label.
        let pill = luminance(atX: 20 * 2, y: 19 * 2, of: cgImage)
        if scheme == .dark {
            #expect(pill < 0.25, "the Review pill is dark in dark appearance")
        } else {
            #expect(pill > 0.85, "the Review pill is light in light appearance")
        }
    }
}
