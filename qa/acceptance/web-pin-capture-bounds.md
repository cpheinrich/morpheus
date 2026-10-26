# Bounded placement captures on token-rich pages

- A realistic inherited design-token fixture that failed with the original capture loop produces a placement JPEG in Chromium and WebKit. Snapshot serialization remains below 2 MiB without copying unused custom properties.
- Resolved font/layout, SVG fill, pseudo-element paint, form values, intrinsic object-fit artwork proportions and explicit initial values inside styled parents remain correct. Changing live tokens/form values immediately after placement cannot change the image.
- Explicit black border/outline colors on red text remain black, including pseudo-elements; resolved color properties cannot fall back to currentColor.
- Preserve the 120 ms synchronous freeze deadline, 4000-node limit, 2 MiB snapshot bound, JPEG quality 0.5, longest edge at most 1600, 512 KiB image bound and existing metadata/storage/legacy transport.
- Image failure remains visible beside the editor/thumbnail after saving and reselecting a comment; semantic evidence and Send remain usable.
- Document scroll is applied once; fixed dialogs and nested scrollers retain their placement viewport.
- Existing web/iOS browser cases pass in Chromium and WebKit.
- Repeated isolated actual MusicGuide page/modal placements produce valid bounded JPEGs under the production deadline. Inspect real pixels and retain measurements; never submit test comments to Chris's live queue or operate his tab.
