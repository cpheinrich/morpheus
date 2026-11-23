"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Graph, layout } from "@dagrejs/dagre";
import { BaseEdge, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useReactFlow, } from "@xyflow/react";
import { useId, useMemo } from "react";
const width = 204;
const height = 80;
const marker = { type: MarkerType.ArrowClosed, color: "var(--app-research-muted)" };
const handles = [
    { type: "target", position: Position.Left, x: 0, y: height / 2 },
    { type: "source", position: Position.Right, x: width, y: height / 2 },
];
function projectGraph(app) {
    const graph = new Graph({ multigraph: true });
    graph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 32 });
    const screens = new Map(app.screens.map((screen) => [screen.id, screen]));
    for (const id of screens.keys())
        graph.setNode(id, { width, height });
    const transitions = app.transitions.flatMap(({ id, from, to, status, action }) => from && to && (status === "observed" || status === "verified")
        ? [{ id, source: from, target: to, action }] : []);
    for (const { id, source, target } of transitions)
        graph.setEdge(source, target, {}, id);
    layout(graph);
    return {
        nodes: app.screens.map((screen) => {
            const { x, y } = graph.node(screen.id);
            return {
                id: screen.id, type: "screen", width, height, handles,
                position: { x: x - width / 2, y: y - height / 2 },
                data: { title: screen.title, state: screen.state, entry: screen.id === app.entryScreenId },
            };
        }),
        edges: transitions.map(({ id, source, target, action }) => ({
            id, source, target, type: "transition", markerEnd: marker,
            ariaLabel: `${screens.get(source).title} → ${screens.get(target).title}: ${action}`,
            data: { path: "M" + graph.edge(source, target, id).points.map(({ x, y }) => `${x},${y}`).join("L") },
        })),
    };
}
function ScreenNodeView({ data, selected, positionAbsoluteX, positionAbsoluteY }) {
    const { getZoom, setCenter } = useReactFlow();
    const { title, state, entry, metrics } = data;
    return (_jsxs("button", { type: "button", className: "app-research-graph-node nopan", title: title, "aria-current": selected || undefined, onFocus: ({ currentTarget }) => {
            const frame = currentTarget.closest(".react-flow")?.getBoundingClientRect();
            if (!frame || !currentTarget.matches(":focus-visible"))
                return;
            const node = currentTarget.getBoundingClientRect();
            if (node.left < frame.left || node.right > frame.right || node.top < frame.top || node.bottom > frame.bottom) {
                void setCenter(positionAbsoluteX + width / 2, positionAbsoluteY + height / 2, { zoom: getZoom() });
            }
        }, children: [_jsx(Handle, { type: "target", position: Position.Left, isConnectable: false }), _jsx("strong", { children: title }), _jsxs("span", { className: "app-research-meta", children: [entry ? "Entry" : "", entry && state ? " · " : "", state] }), metrics ? _jsxs("span", { className: "app-research-meta", children: ["Events: ", metrics.eventCount, metrics.replayCount === undefined ? null : ` · Replays: ${metrics.replayCount}`] }) : null, _jsx(Handle, { type: "source", position: Position.Right, isConnectable: false })] }));
}
function TransitionEdgeView({ id, data, markerEnd }) {
    return _jsx(BaseEdge, { id: id, path: data.path, markerEnd: markerEnd, interactionWidth: 0 });
}
const nodeTypes = { screen: ScreenNodeView };
const edgeTypes = { transition: TransitionEdgeView };
const minimapSize = { width: 112, height: 76 };
export default function NavigationGraph({ app, selected, screenMetrics, onSelect }) {
    const id = useId();
    const graph = useMemo(() => projectGraph(app), [app]);
    const nodes = useMemo(() => graph.nodes.map((node) => ({
        ...node, selected: node.id === selected,
        data: { ...node.data, metrics: screenMetrics && Object.hasOwn(screenMetrics, node.id) ? screenMetrics[node.id] : undefined },
    })), [graph, selected, screenMetrics]);
    return (_jsxs(ReactFlow, { id: id, nodes: nodes, edges: graph.edges, nodeTypes: nodeTypes, edgeTypes: edgeTypes, onNodeClick: (_event, node) => onSelect(node.id), fitView: true, minZoom: 0.05, maxZoom: 2, onInit: (flow) => {
            if (!window.matchMedia?.("(max-width: 47.99rem)").matches)
                return;
            const node = flow.getNode(selected);
            if (node) {
                void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 0.8 });
            }
        }, nodesDraggable: false, nodesConnectable: false, nodesFocusable: false, edgesFocusable: false, elementsSelectable: false, edgesReconnectable: false, deleteKeyCode: null, zoomOnScroll: false, children: [_jsx(Controls, { showInteractive: false }), _jsx(MiniMap, { ariaLabel: "Navigation overview", style: minimapSize, zoomable: true, pannable: true, nodeColor: (node) => node.selected ? "var(--app-research-accent)" : "var(--app-research-muted)" })] }));
}
//# sourceMappingURL=navigation-graph.js.map