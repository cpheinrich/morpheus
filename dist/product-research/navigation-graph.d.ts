import type { AppResearchStudy } from "./index.js";
import type { ScreenMetrics } from "./react.js";
type App = AppResearchStudy["app"];
type GraphProps = {
    app: App;
    selected: string;
    screenMetrics?: ScreenMetrics;
    onSelect: (id: string) => void;
};
export default function NavigationGraph(props: GraphProps): import("react").JSX.Element;
export {};
