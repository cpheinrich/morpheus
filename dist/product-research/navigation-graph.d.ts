import type { AppResearchStudy } from "./index.js";
import type { ScreenMetrics } from "./react.js";
type App = AppResearchStudy["app"];
export default function NavigationGraph({ app, selected, screenMetrics, onSelect }: {
    app: App;
    selected: string;
    screenMetrics?: ScreenMetrics;
    onSelect: (id: string) => void;
}): import("react").JSX.Element;
export {};
