"use client";

import { Graph, layout, type EdgeLabel, type NodeLabel } from "@dagrejs/dagre";
import {
  BaseEdge, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, getViewportForBounds, useReactFlow, useViewportStore,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { AppResearchFlow as Flow, AppResearchStudy } from "./index.js";
import type { ScreenMetrics } from "./react.js";

type App = AppResearchStudy["app"];
type FlowView = { flow: Flow; expanded: ReadonlySet<string>; selected: string };
type Transition = { id: string; source: string; target: string; action: string; documented: boolean };
type GraphProps = { app: App; selected: string; screenMetrics?: ScreenMetrics; onSelect: (id: string) => void };
type ScreenNode = Node<{
  title: string; state: string; entry: boolean; metrics?: ScreenMetrics[string];
  child?: string; expanded?: boolean; activate?: (id: string) => void; focusRequest?: object;
}, "screen">;
type TransitionEdge = Edge<{ path: string; documented: boolean }, "transition">;

const width = 204;
const height = 80;
const marker = { type: MarkerType.ArrowClosed, color: "var(--app-research-muted)" };
const handles = [
  { type: "target", position: Position.Left, x: 0, y: height / 2 },
  { type: "source", position: Position.Right, x: width, y: height / 2 },
] satisfies NonNullable<ScreenNode["handles"]>;

function graphTransitions(app: App, scoped: boolean): Transition[] {
  return app.transitions.flatMap(({ id, from, to, status, action }) => {
    const documented = status === "source-documented";
    return from && to && (status === "observed" || status === "verified" || (scoped && documented))
      ? [{ id, source: from, target: to, action, documented }] : [];
  });
}

function rootView(flow: Flow): FlowView {
  return { flow, expanded: new Set(), selected: flow.entryScreenId };
}

function scopeFlow(view: FlowView, flows: Flow[], transitions: Transition[]) {
  const { flow, expanded } = view;
  const children = new Map(flows.filter((child) => child.parentFlowId === flow.id && child.entryScreenId !== flow.entryScreenId)
    .map((child) => [child.entryScreenId, child]));
  const allowed = new Set([flow.entryScreenId, ...flow.screenIds ?? [], ...children.keys()]);
  const outgoing = transitions.filter(({ source, target }) =>
    source !== target && allowed.has(source) && allowed.has(target) && !children.has(source));
  const edges = outgoing.filter(({ source }) => expanded.has(source));
  return {
    children, edges, expandable: new Set(outgoing.map(({ source }) => source)),
    visible: new Set([flow.entryScreenId, ...edges.map(({ target }) => target)]),
  };
}

function projectGraph(screens: App["screens"], transitions: Transition[], entry: string) {
  const graph = new Graph<object, NodeLabel, EdgeLabel>({ multigraph: true });
  graph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 32 });
  const titles = new Map(screens.map(({ id, title }) => [id, title]));
  for (const id of titles.keys()) graph.setNode(id, { width, height });
  for (const { id, source, target } of transitions) graph.setEdge(source, target, {}, id);
  layout(graph);

  const nodes: ScreenNode[] = screens.map(({ id, title, state }) => {
    const { x, y } = graph.node(id)!;
    return {
      id, type: "screen", width, height, handles, style: { pointerEvents: "auto" },
      position: { x: x! - width / 2, y: y! - height / 2 },
      data: { title, state, entry: id === entry },
    };
  });
  const edges: TransitionEdge[] = transitions.map(({ id, source, target, action, documented }) => ({
    id, source, target, type: "transition", markerEnd: marker,
    ariaLabel: `${titles.get(source)} → ${titles.get(target)}: ${action}${documented ? " (source-documented)" : ""}`,
    data: { documented, path: "M" + graph.edge(source, target, id)!.points!.map(({ x, y }: { x: number; y: number }) => `${x},${y}`).join("L") },
  }));
  return { nodes, edges };
}

function ScreenNodeView({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<ScreenNode>) {
  const { getZoom, setCenter } = useReactFlow();
  const { title, state, entry, metrics, child, expanded, activate, focusRequest } = data;
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { if (focusRequest) button.current?.focus(); }, [focusRequest]);
  return (
    <button ref={button} type="button" className="app-research-graph-node nopan" title={child ? `${title}: Open ${child}` : title}
      aria-current={selected || undefined} aria-expanded={expanded}
      onClick={() => activate?.(id)}
      onFocus={({ currentTarget }) => {
        const frame = currentTarget.closest(".react-flow")?.getBoundingClientRect();
        if (!frame || !currentTarget.matches(":focus-visible")) return;
        const node = currentTarget.getBoundingClientRect();
        if (node.left < frame.left || node.right > frame.right || node.top < frame.top || node.bottom > frame.bottom) {
          void setCenter(positionAbsoluteX + width / 2, positionAbsoluteY + height / 2, { zoom: getZoom() });
        }
      }}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <strong>{title}</strong>
      <span className="app-research-meta">{child ? `Subflow · ${child}` : [entry ? "Entry" : "", state].filter(Boolean).join(" · ")}</span>
      {metrics ? <span className="app-research-meta">
        Events: {metrics.eventCount}{metrics.replayCount === undefined ? null : ` · Replays: ${metrics.replayCount}`}
      </span> : null}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </button>
  );
}

function TransitionEdgeView({ id, data, markerEnd }: EdgeProps<TransitionEdge>) {
  return <BaseEdge id={id} path={data!.path} markerEnd={markerEnd} interactionWidth={0}
    className={data!.documented ? "app-research-source-edge" : undefined} />;
}

const nodeTypes = { screen: ScreenNodeView };
const edgeTypes = { transition: TransitionEdgeView };
const minimapSize = { width: 112, height: 76 };

const zoomKeys = ["Meta", "Control"];

function GraphViewport({ graph, initialScreen, scoped }: {
  graph: ReturnType<typeof projectGraph>; initialScreen: string; scoped: boolean;
}) {
  const flow = useReactFlow();
  const viewportWidth = useViewportStore(({ width }) => width);
  const viewportHeight = useViewportStore(({ height }) => height);
  const frame = useRef<{ graph: typeof graph; width: number; height: number }>(null);
  useEffect(() => {
    if (!flow.viewportInitialized || !viewportWidth || !viewportHeight) return;
    const previous = frame.current;
    if (previous?.graph === graph && previous.width === viewportWidth && previous.height === viewportHeight) return;
    frame.current = { graph, width: viewportWidth, height: viewportHeight };
    const node = graph.nodes.find(({ id }) => id === initialScreen);
    const narrow = window.matchMedia?.("(max-width: 47.99rem)").matches;
    if (node && (scoped ? graph.nodes.length === 1 : narrow)) {
      void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: narrow ? 0.8 : 1 });
    } else {
      const bounds = flow.getNodesBounds(graph.nodes);
      const viewport = getViewportForBounds(bounds, viewportWidth, viewportHeight, 0.05, scoped ? 1.25 : 2, scoped ? "12%" : 0.12);
      void flow.setViewport(viewport);
    }
  }, [flow, graph, initialScreen, scoped, viewportWidth, viewportHeight]);
  return null;
}

function GraphCanvas({ graph, selected, initialScreen, screenMetrics, onSelect, scope, expanded, focusRequest }:
  Omit<GraphProps, "app"> & { graph: ReturnType<typeof projectGraph>; initialScreen: string;
    scope?: ReturnType<typeof scopeFlow>; expanded?: ReadonlySet<string>; focusRequest?: object }) {
  const id = useId();
  const nodes = useMemo(() => graph.nodes.map((node) => ({
    ...node, selected: node.id === selected,
    data: {
      ...node.data, metrics: screenMetrics && Object.hasOwn(screenMetrics, node.id) ? screenMetrics[node.id] : undefined,
      child: scope?.children.get(node.id)?.title, expanded: scope?.expandable.has(node.id) ? expanded?.has(node.id) : undefined,
      activate: onSelect, focusRequest: node.id === selected ? focusRequest : undefined,
    },
  })), [graph, selected, screenMetrics, onSelect, scope, expanded, focusRequest]);
  return (
    <div className="app-research-graph" role="group" aria-label="Navigation canvas">
      <ReactFlow id={id} nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        minZoom={0.05} maxZoom={2} zoomActivationKeyCode={zoomKeys} zoomOnScroll={false}
        nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
        elementsSelectable={false} edgesReconnectable={false} deleteKeyCode={null}>
        <GraphViewport graph={graph} initialScreen={initialScreen} scoped={scope !== undefined} />
        <Controls showInteractive={false} />
        <MiniMap ariaLabel="Navigation overview" style={minimapSize} zoomable pannable
          nodeColor={(node) => node.selected ? "var(--app-research-accent)" : "var(--app-research-muted)"} />
      </ReactFlow>
    </div>
  );
}

function LegacyGraph({ app, ...props }: GraphProps) {
  const graph = useMemo(() => projectGraph(app.screens, graphTransitions(app, false), app.entryScreenId), [app]);
  return <GraphCanvas {...props} graph={graph} initialScreen={props.selected} />;
}

function ScopedGraph({ app, flows, roots, ...props }: GraphProps & { flows: Flow[]; roots: Flow[] }) {
  const initial = roots.find(({ entryScreenId }) => entryScreenId === app.entryScreenId) ?? roots[0]!;
  const [trail, setTrail] = useState(() => [rootView(initial)]);
  const view = trail[trail.length - 1]!;
  const transitions = useMemo(() => graphTransitions(app, true), [app]);
  const scope = useMemo(() => scopeFlow(view, flows, transitions), [view.flow, view.expanded, flows, transitions]);
  const graph = useMemo(() => projectGraph(app.screens.filter(({ id }) => scope.visible.has(id)),
    scope.edges, view.flow.entryScreenId), [app.screens, scope, view.flow.entryScreenId]);
  const restoreFocus = useRef<FlowView[]>(null);

  function goBack() {
    if (trail.length < 2) return;
    const previous = trail.slice(0, -1);
    restoreFocus.current = previous;
    setTrail(previous);
    props.onSelect(previous[previous.length - 1]!.selected);
  }

  function openFlow(flow: Flow) {
    const next = [...trail, rootView(flow)];
    restoreFocus.current = next;
    setTrail(next);
    props.onSelect(flow.entryScreenId);
  }

  function activate(screen: string) {
    const child = scope.children.get(screen);
    if (child) {
      openFlow(child);
      return;
    }
    const expandable = scope.expandable.has(screen);
    const expanded = expandable && !view.expanded.has(screen) ? new Set([...view.expanded, screen]) : view.expanded;
    props.onSelect(screen);
    if (expanded !== view.expanded || screen !== view.selected) setTrail([...trail, { ...view, expanded, selected: screen }]);
  }

  const root = trail.findLast(({ flow }) => !flow.parentFlowId)!.flow;
  const childFlows = flows.filter((flow) => flow.parentFlowId === view.flow.id);
  return (
    <div onKeyDown={(event) => {
      if (event.key !== "Escape" || event.defaultPrevented || trail.length < 2) return;
      event.preventDefault();
      event.stopPropagation();
      goBack();
    }}>
      <div className="app-research-graph-toolbar">
        <button type="button" title="Back in graph" aria-label="Back in graph" disabled={trail.length < 2} onClick={goBack}>
          <span aria-hidden="true">←</span>
        </button>
        <div className="app-research-flow-picker" role="group" aria-label="Top-level flows">
          {roots.map((flow) => (
            <button key={flow.id} type="button" aria-pressed={root.id === flow.id} onClick={() => {
              if (view.flow.id !== flow.id || view.expanded.size) openFlow(flow);
            }}>{flow.title}</button>
          ))}
        </div>
      </div>
      <div className="app-research-graph-caption">
        {view.flow.parentFlowId && <p className="app-research-flow-title" aria-live="polite">{view.flow.title}</p>}
        {childFlows.length > 0 && (
          <details key={view.flow.id} className="app-research-subflows">
            <summary>Open a subflow</summary>
            <div className="app-research-flow-picker" role="group" aria-label="Subflows">
              {childFlows.map((flow) => (
                <button key={flow.id} type="button" onClick={() => openFlow(flow)}>{flow.title}</button>
              ))}
            </div>
          </details>
        )}
      </div>
      <GraphCanvas {...props} graph={graph} initialScreen={view.flow.entryScreenId}
        onSelect={activate} scope={scope} expanded={view.expanded} focusRequest={trail === restoreFocus.current ? trail : undefined} />
      <div className="app-research-graph-legend app-research-meta" aria-label="Transition evidence">
        <span>Observed or verified</span><span>Documented in release source</span>
      </div>
    </div>
  );
}

export default function NavigationGraph(props: GraphProps) {
  const flows = props.app.flows;
  const roots = flows?.filter((flow) => !flow.parentFlowId) ?? [];
  return flows && roots.length ? <ScopedGraph {...props} flows={flows} roots={roots} /> : <LegacyGraph {...props} />;
}
