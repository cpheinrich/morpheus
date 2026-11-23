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

private func renderedLuminance(in rect: CGRect, image: CGImage) throws -> [CGFloat] {
    let crop = try #require(image.cropping(to: rect))
    var pixels = [UInt8](repeating: 0, count: 4 * crop.width * crop.height)
    try pixels.withUnsafeMutableBytes { bytes in
        let context = try #require(
            CGContext(
                data: bytes.baseAddress, width: crop.width, height: crop.height, bitsPerComponent: 8,
                bytesPerRow: 4 * crop.width, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(crop, in: CGRect(x: 0, y: 0, width: crop.width, height: crop.height))
    }
    func linear(_ byte: UInt8) -> CGFloat {
        let value = CGFloat(byte) / 255
        return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }
    return stride(from: 0, to: pixels.count, by: 4).map { i in
        0.2126 * linear(pixels[i]) + 0.7152 * linear(pixels[i + 1]) + 0.0722 * linear(pixels[i + 2])
    }
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

    private func renderToolbar(theme: ScreenQATheme, scheme: ColorScheme) throws -> UIImage {
        let session = makeSession()
        let toolbar = ScreenCommentToolbar(
            theme: theme, session: session, topInset: 0, isPlacing: false,
            onAdd: {}, onCancelPlacement: {}, onReview: {}, onSend: {}, onExit: {}
        )
        .frame(width: 390)
        .environment(\.colorScheme, scheme)
        let renderer = ImageRenderer(content: toolbar)
        renderer.scale = 2
        return try #require(renderer.uiImage)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func rendersToolbarInEachAppearance(scheme: ColorScheme) throws {
        let image = try renderToolbar(theme: .standard, scheme: scheme)
        let name = "ScreenCommentToolbar-\(scheme == .dark ? "dark" : "light").png"
        Attachment.record(try #require(image.pngData()), named: name)

        // A light host accent makes inherited tint hard to read on a light capsule.
        var lightAccent = ScreenQATheme.standard
        lightAccent.primary = Color(white: 0.8)
        let rendered = try #require(renderToolbar(theme: lightAccent, scheme: scheme).cgImage)
        let pills = [
            ("Review", CGRect(x: 40, y: 38, width: 1, height: 1), CGRect(x: 66, y: 24, width: 120, height: 31)),
            ("Exit", CGRect(x: 492, y: 38, width: 1, height: 1), CGRect(x: 532, y: 25, width: 72, height: 29)),
        ]
        for (label, fillRect, textRect) in pills {
            let fill = try #require(renderedLuminance(in: fillRect, image: rendered).first)
            let text = try renderedLuminance(in: textRect, image: rendered)
            let glyph = try #require(scheme == .dark ? text.max() : text.min())
            let ratio = (max(fill, glyph) + 0.05) / (min(fill, glyph) + 0.05)
            #expect(scheme == .dark ? fill < 0.25 : fill > 0.85, "\(label) uses the appearance's capsule fill")
            #expect(ratio >= 4.5, "\(label) text meets 4.5:1 against its rendered capsule")
        }
    }
}
