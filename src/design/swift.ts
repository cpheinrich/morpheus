import type { Token } from "./tokens.js";

/** Literal sRGB colors only; CSS expressions cannot be evaluated by Swift. */
function channels(value: string): number[] | undefined {
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value);
  if (hex) {
    const literal = hex[1]!;
    const digits = literal.length <= 4
      ? [...literal].map((digit) => digit + digit).join("") : literal;
    const rgba = (digits.length === 6 ? digits + "ff" : digits).match(/../g)!;
    return rgba.map((pair) => parseInt(pair, 16) / 255);
  }
  const rgb = /^(rgb|rgba)\(([^)]+)\)$/.exec(value);
  if (!rgb) return undefined;
  const parts = rgb[2]!.split(",").map((part) => part.trim());
  if (parts.length !== (rgb[1] === "rgba" ? 4 : 3)
    || parts.some((part) => !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(part))) return undefined;
  const values = parts.map(Number);
  if (values.some((part, index) => part > (index === 3 ? 1 : 255))) return undefined;
  return [...values.slice(0, 3).map((part) => part / 255), values[3] ?? 1];
}

function swiftName(name: string): string {
  const camel = name.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase());
  return /^\d/.test(camel) ? `color${camel}` : camel;
}

function color(values: number[]): string {
  const [red, green, blue, alpha] = values.map((value) => value.toFixed(6));
  return `Color(.sRGB, red: ${red}, green: ${green}, blue: ${blue}, opacity: ${alpha})`;
}

function palette(tokens: Token[], prefix: string[], issues: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const token of tokens) {
    if (!prefix.every((part, index) => token.path[index] === part)) continue;
    const path = token.path.join(".");
    const name = swiftName(token.name.slice(prefix.join("-").length + 1));
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) issues.push(`${path}: no valid Swift color name`);
    if (result.has(name)) issues.push(`${path}: duplicate Swift color name ${name}`);
    const rgba = channels(token.value);
    if (!rgba) issues.push(`${path}: unsupported Swift color ${JSON.stringify(token.value)}; use hex or numeric rgb()/rgba()`);
    result.set(name, rgba ? color(rgba) : "");
  }
  return result;
}

/** Opt-in iOS/macOS palette. Missing dark overrides inherit the light primitive. */
export function renderSwift(tokens: Token[], source: string): { content: string; issues: string[] } {
  const issues: string[] = [];
  const light = palette(tokens, ["color"], issues);
  const dark = palette(tokens, ["theme", "dark", "color"], issues);
  if (!light.size) issues.push("Swift output needs at least one color.* token");
  for (const name of dark.keys()) {
    if (!light.has(name)) issues.push(`theme.dark.color: ${name} has no matching light color`);
  }
  if (issues.length) return { content: "", issues };
  const entries = [...light].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, value]) => `    public static var \`${name}\`: Color {
        _adaptive(light: ${value}, dark: ${dark.get(name) ?? value})
    }`).join("\n\n");
  // JSON quoting keeps even a source filename containing newlines on one comment line.
  return { issues, content: `// Generated from ${JSON.stringify(source)} by morpheus tokens build --swift.
// Do not edit by hand — change the source and regenerate.
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

public enum BrandPalette {
${entries}

    private static func _adaptive(light: Color, dark: Color) -> Color {
        #if os(macOS)
        return Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(dark) : NSColor(light)
        })
        #else
        return Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
        #endif
    }
}
` };
}
