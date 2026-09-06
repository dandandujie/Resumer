import { useEffect, useRef } from 'react';
import { forceCenter, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';

export interface GraphNodeDatum {
  id: string;
  title: string;
  type: string;
  href?: string;
  x?: number;
  y?: number;
}

export interface GraphLinkDatum {
  source: string | GraphNodeDatum;
  target: string | GraphNodeDatum;
  type: string;
}

interface KnowledgeGraphProps {
  nodes: GraphNodeDatum[];
  edges: GraphLinkDatum[];
  onNodeClick?: (node: GraphNodeDatum) => void;
}

const COLORS: Record<string, string> = {
  skill: '#d06b3c',
  sop: '#4e7b8e',
  company: '#d19a38',
  role: '#7b6ba8',
  source: '#6a8d73',
  application: '#c45454',
  resume: '#3d7890',
  interview: '#a47747',
};

export function KnowledgeGraph({ nodes, edges, onNodeClick }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const hoverRef = useRef<GraphNodeDatum | null>(null);
  const dragRef = useRef<{
    node: GraphNodeDatum | null;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const simulationNodesRef = useRef<any[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const simulationNodes = nodes.map((node) => ({ ...node }));
    simulationNodesRef.current = simulationNodes;
    const simulationLinks = edges.map((edge) => ({ ...edge }));
    const simulation = forceSimulation(simulationNodes as any)
      .force('charge', forceManyBody().strength(-180))
      .force('link', forceLink(simulationLinks as any).id((node: any) => node.id).distance(90))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.04))
      .force('y', forceY(0).strength(0.04));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const { scale, x, y } = viewRef.current;
      context.clearRect(0, 0, rect.width, rect.height);
      context.save();
      context.translate(rect.width / 2 + x, rect.height / 2 + y);
      context.scale(scale, scale);
      const hovered = hoverRef.current;
      const linked = new Set<string>();
      if (hovered) {
        edges.forEach((edge) => {
          const source = typeof edge.source === 'string' ? edge.source : edge.source.id;
          const target = typeof edge.target === 'string' ? edge.target : edge.target.id;
          if (source === hovered.id) linked.add(target);
          if (target === hovered.id) linked.add(source);
        });
      }
      simulationLinks.forEach((edge: any) => {
        const source = edge.source;
        const target = edge.target;
        if (!source?.x || !target?.x) return;
        const active = !hovered || source.id === hovered.id || target.id === hovered.id;
        context.globalAlpha = active ? 0.52 : 0.1;
        context.strokeStyle = edge.type === 'wikilink' ? '#a99b88' : '#d4b26a';
        context.lineWidth = edge.type === 'source' ? 1.8 : 1;
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
      });
      simulationNodes.forEach((node: any) => {
        const active = !hovered || node.id === hovered.id || linked.has(node.id);
        context.globalAlpha = active ? 1 : 0.18;
        context.fillStyle = COLORS[node.type] || '#77716b';
        context.beginPath();
        context.arc(node.x, node.y, node.id === hovered?.id ? 8 : 5, 0, Math.PI * 2);
        context.fill();
        if (node.id === hovered?.id || scale > 1.25) {
          context.fillStyle = '#413b36';
          context.font = '11px Instrument Sans, sans-serif';
          context.fillText(node.title || node.id, node.x + 9, node.y + 4);
        }
      });
      context.restore();
    };
    const tick = () => {
      draw();
      frameRef.current = requestAnimationFrame(tick);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    simulation.on('tick', draw);
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      observer.disconnect();
      simulation.stop();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [nodes, edges]);

  const locate = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    const x = (event.clientX - rect.left - rect.width / 2 - view.x) / view.scale;
    const y = (event.clientY - rect.top - rect.height / 2 - view.y) / view.scale;
    return (
      simulationNodesRef.current.find(
        (node) => Math.hypot(node.x - x, node.y - y) < 12 / view.scale,
      ) || null
    );
  };

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-2xl border border-[var(--whale-divider)] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.8),transparent_38%),var(--whale-cream-soft)]">
      <div className="pointer-events-none absolute left-4 top-4 z-10 text-[11px] text-[var(--whale-ink-muted)]">
        拖动节点定位 · 空白处平移 · 滚轮缩放
      </div>
      <canvas
        ref={canvasRef}
        className="h-full min-h-[520px] w-full cursor-grab active:cursor-grabbing"
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag) {
            const canvas = canvasRef.current;
            const rect = canvas?.getBoundingClientRect();
            if (drag.node && rect) {
              const view = viewRef.current;
              const simulationNode = simulationNodesRef.current.find(
                (node) => node.id === drag.node?.id,
              );
              if (simulationNode) {
                simulationNode.fx =
                  (event.clientX - rect.left - rect.width / 2 - view.x) / view.scale;
                simulationNode.fy = (event.clientY - rect.top - rect.height / 2 - view.y) / view.scale;
              }
            } else {
              viewRef.current.x += event.clientX - drag.x;
              viewRef.current.y += event.clientY - drag.y;
            }
            drag.x = event.clientX;
            drag.y = event.clientY;
          }
          hoverRef.current = locate(event);
        }}
        onPointerDown={(event) => {
          const node = locate(event);
          dragRef.current = {
            node,
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag?.node) {
            const simulationNode = simulationNodesRef.current.find(
              (node) => node.id === drag.node?.id,
            );
            if (simulationNode) {
              simulationNode.fx = null;
              simulationNode.fy = null;
            }
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) {
              onNodeClick?.(drag.node);
            }
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          viewRef.current.scale = Math.max(
            0.45,
            Math.min(2.8, viewRef.current.scale * (event.deltaY < 0 ? 1.08 : 0.92)),
          );
        }}
      />
    </div>
  );
}
