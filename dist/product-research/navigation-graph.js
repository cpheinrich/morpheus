"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Graph, layout } from "@dagrejs/dagre";
import { BaseEdge, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, getViewportForBounds, useReactFlow, useViewportStore, } from "@xyflow/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
const width = 204;
const height = 80;
const marker = { type: MarkerType.ArrowClosed, color: "var(--app-research-muted)" };
const handles = [
    { type: "target", position: Position.Left, x: 0, y: height / 2 },
    { type: "source", position: Position.Right, x: width, y: height / 2 },
];
function graphTransitions(app, scoped) {
    return app.transitions.flatMap(({ id, from, to, status, action }) => {
        const documented = status === "source-documented";
        return from && to && (status === "observed" || status === "verified" || (scoped && documented))
            ? [{ id, source: from, target: to, action, documented }] : [];
    });
}
function rootView(flow) {
    return { flow, expanded: new Set(), selected: flow.entryScreenId };
}
function scopeFlow(view, flows, transitions) {
    const { flow, expanded } = view;
    const children = new Map(flows.filter((child) => child.parentFlowId === flow.id && child.entryScreenId !== flow.entryScreenId)
        .map((child) => [child.entryScreenId, child]));
    const allowed = new Set([flow.entryScreenId, ...flow.screenIds ?? [], ...children.keys()]);
    const outgoing = transitions.filter(({ source, target }) => source !== target && allowed.has(source) && allowed.has(target) && !children.has(source));
    const edges = outgoing.filter(({ source }) => expanded.has(source));
    return {
        children, edges, expandable: new Set(outgoing.map(({ source }) => source)),
        visible: new Set([flow.entryScreenId, ...edges.map(({ target }) => target)]),
    };
}
function projectGraph(screens, transitions, entry) {
    const graph = new Graph({ multigraph: true });
    graph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 32 });
    const titles = new Map(screens.map(({ id, title }) => [id, title]));
    for (const id of titles.keys())
        graph.setNode(id, { width, height });
    for (const { id, source, target } of transitions)
        graph.setEdge(source, target, {}, id);
    layout(graph);
    const nodes = screens.map(({ id, title, state }) => {
        const { x, y } = graph.node(id);
        return {
            id, type: "screen", width, height, handles, style: { pointerEvents: "auto" },
            position: { x: x - width / 2, y: y - height / 2 },
            data: { title, state, entry: id === entry },
        };
    });
    const edges = transitions.map(({ id, source, target, action, documented }) => ({
        id, source, target, type: "transition", markerEnd: marker,
        ariaLabel: `${titles.get(source)} → ${titles.get(target)}: ${action}${documented ? " (source-documented)" : ""}`,
        data: { documented, path: "M" + graph.edge(source, target, id).points.map(({ x, y }) => `${x},${y}`).join("L") },
    }));
    return { nodes, edges };
}
function ScreenNodeView({ id, data, selected, positionAbsoluteX, positionAbsoluteY }) {
    const { getZoom, setCenter } = useReactFlow();
    const { title, state, entry, metrics, child, expanded, activate, focusRequest } = data;
    const button = useRef(null);
    useLayoutEffect(() => { if (focusRequest)
        button.current?.focus(); }, [focusRequest]);
    return (_jsxs("button", { ref: button, type: "button", className: "app-research-graph-node nopan", title: child ? `${title}: Open ${child}` : title, "aria-current": selected || undefined, "aria-expanded": expanded, onClick: () => activate?.(id), onFocus: ({ currentTarget }) => {
            const frame = currentTarget.closest(".react-flow")?.getBoundingClientRect();
            if (!frame || !currentTarget.matches(":focus-visible"))
                return;
            const node = currentTarget.getBoundingClientRect();
            if (node.left < frame.left || node.right > frame.right || node.top < frame.top || node.bottom > frame.bottom) {
                void setCenter(positionAbsoluteX + width / 2, positionAbsoluteY + height / 2, { zoom: getZoom() });
            }
        }, children: [_jsx(Handle, { type: "target", position: Position.Left, isConnectable: false }), _jsx("strong", { children: title }), _jsx("span", { className: "app-research-meta", children: child ? `Subflow · ${child}` : [entry ? "Entry" : "", state].filter(Boolean).join(" · ") }), metrics ? _jsxs("span", { className: "app-research-meta", children: ["Events: ", metrics.eventCount, metrics.replayCount === undefined ? null : ` · Replays: ${metrics.replayCount}`] }) : null, _jsx(Handle, { type: "source", position: Position.Right, isConnectable: false })] }));
}
function TransitionEdgeView({ id, data, markerEnd }) {
    return _jsx(BaseEdge, { id: id, path: data.path, markerEnd: markerEnd, interactionWidth: 0, className: data.documented ? "app-research-source-edge" : undefined });
}
const nodeTypes = { screen: ScreenNodeView };
const edgeTypes = { transition: TransitionEdgeView };
const minimapSize = { width: 112, height: 76 };
const zoomKeys = ["Meta", "Control"];
function GraphViewport({ graph, initialScreen, scoped }) {
    const flow = useReactFlow();
    const viewportWidth = useViewportStore(({ width }) => width);
    const viewportHeight = useViewportStore(({ height }) => height);
    const frame = useRef(null);
    useEffect(() => {
        if (!flow.viewportInitialized || !viewportWidth || !viewportHeight)
            return;
        const previous = frame.current;
        if (previous?.graph === graph && previous.width === viewportWidth && previous.height === viewportHeight)
            return;
        frame.current = { graph, width: viewportWidth, height: viewportHeight };
        const node = graph.nodes.find(({ id }) => id === initialScreen);
        const narrow = window.matchMedia?.("(max-width: 47.99rem)").matches;
        if (node && (scoped ? graph.nodes.length === 1 : narrow)) {
            void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: narrow ? 0.8 : 1 });
        }
        else {
            const bounds = flow.getNodesBounds(graph.nodes);
            const viewport = getViewportForBounds(bounds, viewportWidth, viewportHeight, 0.05, scoped ? 1.25 : 2, scoped ? "12%" : 0.12);
            void flow.setViewport(viewport);
        }
    }, [flow, graph, initialScreen, scoped, viewportWidth, viewportHeight]);
    return null;
}
function GraphCanvas({ graph, selected, initialScreen, screenMetrics, onSelect, scope, expanded, focusRequest }) {
    const id = useId();
    const nodes = useMemo(() => graph.nodes.map((node) => ({
        ...node, selected: node.id === selected,
        data: {
            ...node.data, metrics: screenMetrics && Object.hasOwn(screenMetrics, node.id) ? screenMetrics[node.id] : undefined,
            child: scope?.children.get(node.id)?.title, expanded: scope?.expandable.has(node.id) ? expanded?.has(node.id) : undefined,
            activate: onSelect, focusRequest: node.id === selected ? focusRequest : undefined,
        },
    })), [graph, selected, screenMetrics, onSelect, scope, expanded, focusRequest]);
    return (_jsx("div", { className: "app-research-graph", role: "group", "aria-label": "Navigation canvas", children: _jsxs(ReactFlow, { id: id, nodes: nodes, edges: graph.edges, nodeTypes: nodeTypes, edgeTypes: edgeTypes, minZoom: 0.05, maxZoom: 2, zoomActivationKeyCode: zoomKeys, zoomOnScroll: false, nodesDraggable: false, nodesConnectable: false, nodesFocusable: false, edgesFocusable: false, elementsSelectable: false, edgesReconnectable: false, deleteKeyCode: null, children: [_jsx(GraphViewport, { graph: graph, initialScreen: initialScreen, scoped: scope !== undefined }), _jsx(Controls, { showInteractive: false }), _jsx(MiniMap, { ariaLabel: "Navigation overview", style: minimapSize, zoomable: true, pannable: true, nodeColor: (node) => node.selected ? "var(--app-research-accent)" : "var(--app-research-muted)" })] }) }));
}
function LegacyGraph({ app, ...props }) {
    const graph = useMemo(() => projectGraph(app.screens, graphTransitions(app, false), app.entryScreenId), [app]);
    return _jsx(GraphCanvas, { ...props, graph: graph, initialScreen: props.selected });
}
function ScopedGraph({ app, flows, roots, ...props }) {
    const initial = roots.find(({ entryScreenId }) => entryScreenId === app.entryScreenId) ?? roots[0];
    const [trail, setTrail] = useState(() => [rootView(initial)]);
    const view = trail[trail.length - 1];
    const transitions = useMemo(() => graphTransitions(app, true), [app]);
    const scope = useMemo(() => scopeFlow(view, flows, transitions), [view.flow, view.expanded, flows, transitions]);
    const graph = useMemo(() => projectGraph(app.screens.filter(({ id }) => scope.visible.has(id)), scope.edges, view.flow.entryScreenId), [app.screens, scope, view.flow.entryScreenId]);
    const restoreFocus = useRef(null);
    function goBack() {
        if (trail.length < 2)
            return;
        const previous = trail.slice(0, -1);
        restoreFocus.current = previous;
        setTrail(previous);
        props.onSelect(previous[previous.length - 1].selected);
    }
    function openFlow(flow) {
        const next = [...trail, rootView(flow)];
        restoreFocus.current = next;
        setTrail(next);
        props.onSelect(flow.entryScreenId);
    }
    function activate(screen) {
        const child = scope.children.get(screen);
        if (child) {
            openFlow(child);
            return;
        }
        const expandable = scope.expandable.has(screen);
        const expanded = expandable && !view.expanded.has(screen) ? new Set([...view.expanded, screen]) : view.expanded;
        props.onSelect(screen);
        if (expanded !== view.expanded || screen !== view.selected)
            setTrail([...trail, { ...view, expanded, selected: screen }]);
    }
    const root = trail.findLast(({ flow }) => !flow.parentFlowId).flow;
    const childFlows = flows.filter((flow) => flow.parentFlowId === view.flow.id);
    return (_jsxs("div", { onKeyDown: (event) => {
            if (event.key !== "Escape" || event.defaultPrevented || trail.length < 2)
                return;
            event.preventDefault();
            event.stopPropagation();
            goBack();
        }, children: [_jsxs("div", { className: "app-research-graph-toolbar", children: [_jsx("button", { type: "button", title: "Back in graph", "aria-label": "Back in graph", disabled: trail.length < 2, onClick: goBack, children: _jsx("span", { "aria-hidden": "true", children: "\u2190" }) }), _jsx("div", { className: "app-research-flow-picker", role: "group", "aria-label": "Top-level flows", children: roots.map((flow) => (_jsx("button", { type: "button", "aria-pressed": root.id === flow.id, onClick: () => {
                                if (view.flow.id !== flow.id || view.expanded.size)
                                    openFlow(flow);
                            }, children: flow.title }, flow.id))) })] }), _jsxs("div", { className: "app-research-graph-caption", children: [view.flow.parentFlowId && _jsx("p", { className: "app-research-flow-title", "aria-live": "polite", children: view.flow.title }), childFlows.length > 0 && (_jsxs("details", { className: "app-research-subflows", children: [_jsx("summary", { children: "Open a subflow" }), _jsx("div", { className: "app-research-flow-picker", role: "group", "aria-label": "Subflows", children: childFlows.map((flow) => (_jsx("button", { type: "button", onClick: () => openFlow(flow), children: flow.title }, flow.id))) })] }, view.flow.id))] }), _jsx(GraphCanvas, { ...props, graph: graph, initialScreen: view.flow.entryScreenId, onSelect: activate, scope: scope, expanded: view.expanded, focusRequest: trail === restoreFocus.current ? trail : undefined }), _jsxs("div", { className: "app-research-graph-legend app-research-meta", "aria-label": "Transition evidence", children: [_jsx("span", { children: "Observed or verified" }), _jsx("span", { children: "Documented in release source" })] })] }));
}
export default function NavigationGraph(props) {
    const flows = props.app.flows;
    const roots = flows?.filter((flow) => !flow.parentFlowId) ?? [];
    return flows && roots.length ? _jsx(ScopedGraph, { ...props, flows: flows, roots: roots }) : _jsx(LegacyGraph, { ...props });
}
//# sourceMappingURL=navigation-graph.js.map