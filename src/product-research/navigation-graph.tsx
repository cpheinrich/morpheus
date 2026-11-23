"use client";

import { Graph, layout, type EdgeLabel, type NodeLabel } from "@dagrejs/dagre";
import {
  BaseEdge, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useNodesInitialized, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import { useEffect, useId, useMemo, useRef } from "react";

import type { AppResearchStudy } from "./index.js";
import type { ScreenMetrics } from "./react.js";

type App = AppResearchStudy["app"];
type ScreenNode = Node<{
  title: string; state: string; entry: boolean; metrics?: ScreenMetrics[string];
}, "screen">;
type TransitionEdge = Edge<{ path: string }, "transition">;

const width = 204;
const height = 80;
const marker = { type: MarkerType.ArrowClosed, color: "var(--app-research-muted)" };
const handles = [
  { type: "target", position: Position.Left, x: 0, y: height / 2 },
  { type: "source", position: Position.Right, x: width, y: height / 2 },
] satisfies NonNullable<ScreenNode["handles"]>;

function projectGraph(app: App): { nodes: ScreenNode[]; edges: TransitionEdge[] } {
  const graph = new Graph<object, NodeLabel, EdgeLabel>({ multigraph: true });
  graph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 32 });
  const screens = new Map(app.screens.map((screen) => [screen.id, screen]));
  for (const id of screens.keys()) graph.setNode(id, { width, height });
  const transitions = app.transitions.flatMap(({ id, from, to, status, action }) =>
    from && to && (status === "observed" || status === "verified")
      ? [{ id, source: from, target: to, action }] : []);
  for (const { id, source, target } of transitions) graph.setEdge(source, target, {}, id);
  layout(graph);

  return {
    nodes: app.screens.map((screen) => {
      const { x, y } = graph.node(screen.id)!;
      return {
        id: screen.id, type: "screen", width, height, handles,
        position: { x: x! - width / 2, y: y! - height / 2 },
        data: { title: screen.title, state: screen.state, entry: screen.id === app.entryScreenId },
      };
    }),
    edges: transitions.map(({ id, source, target, action }) => ({
      id, source, target, type: "transition", markerEnd: marker,
      ariaLabel: `${screens.get(source)!.title} → ${screens.get(target)!.title}: ${action}`,
      data: { path: "M" + graph.edge(source, target, id)!.points!.map(({ x, y }: { x: number; y: number }) => `${x},${y}`).join("L") },
    })),
  };
}

function ScreenNodeView({ data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<ScreenNode>) {
  const { getZoom, setCenter } = useReactFlow();
  const { title, state, entry, metrics } = data;
  return (
    <button type="button" className="app-research-graph-node nopan" title={title} aria-current={selected || undefined}
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
      <span className="app-research-meta">{entry ? "Entry" : ""}{entry && state ? " · " : ""}{state}</span>
      {metrics ? <span className="app-research-meta">
        Events: {metrics.eventCount}{metrics.replayCount === undefined ? null : ` · Replays: ${metrics.replayCount}`}
      </span> : null}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </button>
  );
}

function TransitionEdgeView({ id, data, markerEnd }: EdgeProps<TransitionEdge>) {
  return <BaseEdge id={id} path={data!.path} markerEnd={markerEnd} interactionWidth={0} />;
}

const nodeTypes = { screen: ScreenNodeView };
const edgeTypes = { transition: TransitionEdgeView };
const minimapSize = { width: 112, height: 76 };

function InitialViewport({ selected }: { selected: string }) {
  const initialized = useNodesInitialized();
  const { viewportInitialized, fitView, getNode, setCenter } = useReactFlow<ScreenNode, TransitionEdge>();
  const positioned = useRef(false);

  useEffect(() => {
    if (positioned.current || !initialized || !viewportInitialized) return;
    positioned.current = true;
    const node = getNode(selected);
    if (node && window.matchMedia?.("(max-width: 47.99rem)").matches) {
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 0.8 });
    } else {
      void fitView();
    }
  }, [fitView, getNode, initialized, selected, setCenter, viewportInitialized]);

  return null;
}

export default function NavigationGraph({ app, selected, screenMetrics, onSelect }: {
  app: App; selected: string; screenMetrics?: ScreenMetrics; onSelect: (id: string) => void;
}) {
  const id = useId();
  const graph = useMemo(() => projectGraph(app), [app]);
  const nodes = useMemo(() => graph.nodes.map((node) => ({
    ...node, selected: node.id === selected,
    data: { ...node.data, metrics: screenMetrics && Object.hasOwn(screenMetrics, node.id) ? screenMetrics[node.id] : undefined },
  })), [graph, selected, screenMetrics]);
  return (
    <ReactFlow id={id} nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodeClick={(_event, node) => onSelect(node.id)} minZoom={0.05} maxZoom={2}
      nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
      elementsSelectable={false} edgesReconnectable={false} deleteKeyCode={null} zoomOnScroll={false}>
      <InitialViewport selected={selected} />
      <Controls showInteractive={false} />
      <MiniMap ariaLabel="Navigation overview" style={minimapSize} zoomable pannable
        nodeColor={(node) => node.selected ? "var(--app-research-accent)" : "var(--app-research-muted)"} />
    </ReactFlow>
  );
}
