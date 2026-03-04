import { useRef, useState, useCallback, useEffect, type PointerEvent, type WheelEvent } from 'react';
import type { Hex } from '../../types';
import { hexToPixel, hexCorners, getGridBounds, isHexInViewport, pixelToHex } from './hexUtils';
import styles from './HexGrid.module.css';

interface Props {
  hexes: Hex[];
  cols: number;
  rows: number;
  isGM: boolean;
  onHexClick: (hex: Hex) => void;
  onHexMove?: (sourceId: number, targetId: number) => void;
  /** When set, drag paints hexes instead of panning */
  onHexPaint?: (hex: Hex) => void;
  /** Hex IDs with unsaved local changes — shown with a small indicator dot */
  pendingHexIds?: Set<number>;
}

const HEX_SIZE = 30;
// Absolute minimum viewBox width: ~4 hex widths regardless of map size
const ZOOM_IN_MIN_W = HEX_SIZE * 4;
const ZOOM_MAX = 1.5;
const LONG_PRESS_MS = 400;
// Initial view: 50% of grid bounds = 2× zoom, centered on the grid
const INITIAL_ZOOM = 0.5;

function getInitialViewBox(b: ReturnType<typeof getGridBounds>) {
  const w = b.width * INITIAL_ZOOM;
  const h = b.height * INITIAL_ZOOM;
  return { x: b.minX + (b.width - w) / 2, y: b.minY + (b.height - h) / 2, w, h };
}

export function HexGrid({ hexes, cols, rows, isGM, onHexClick, onHexMove, onHexPaint, pendingHexIds }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bounds = getGridBounds(cols, rows, HEX_SIZE);

  const [viewBox, setViewBox] = useState(() => getInitialViewBox(getGridBounds(cols, rows, HEX_SIZE)));

  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const didPan = useRef(false);

  // Long-press hex drag state
  const [dragHex, setDragHex] = useState<Hex | null>(null);
  const [dragSvgPos, setDragSvgPos] = useState<{ x: number; y: number } | null>(null);
  // dropTarget is kept in both state (for rendering) and a ref (for reliable reads in event handlers)
  const [dropTarget, setDropTargetState] = useState<{ q: number; r: number } | null>(null);
  const dropTargetRef = useRef<{ q: number; r: number } | null>(null);
  function setDropTarget(val: { q: number; r: number } | null) {
    dropTargetRef.current = val;
    setDropTargetState(val);
  }
  const longPressTimer = useRef<number>(0);
  const longPressHex = useRef<Hex | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const didDragMove = useRef(false);

  // Multi-touch tracking for pinch-to-zoom
  const activePointers = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);

  // Paint mode gesture
  const isPainting = useRef(false);
  const lastPaintedHexId = useRef<number | null>(null);

  useEffect(() => {
    const b = getGridBounds(cols, rows, HEX_SIZE);
    setViewBox(getInitialViewBox(b));
  }, [cols, rows]);

  const svgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      return {
        x: (clientX - rect.left) * scaleX + viewBox.x,
        y: (clientY - rect.top) * scaleY + viewBox.y,
      };
    },
    [viewBox]
  );

  function findHexAtClient(clientX: number, clientY: number): Hex | undefined {
    const pt = svgPoint(clientX, clientY);
    const { q, r } = pixelToHex(pt.x, pt.y, HEX_SIZE);
    return hexes.find((h) => h.q === q && h.r === r);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = 0;
    }
    longPressHex.current = null;
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;

    // Capture all pointer events on the SVG itself for reliable multi-touch
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* */ }
    activePointers.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Two fingers down → enter pinch mode; cancel any pan or long-press
    if (activePointers.current.size === 2) {
      cancelLongPress();
      setPanning(false);
      const pts = Array.from(activePointers.current.values());
      const dx = pts[0].clientX - pts[1].clientX;
      const dy = pts[0].clientY - pts[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      return;
    }

    pointerIdRef.current = e.pointerId;
    didPan.current = false;
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };

    // Paint mode: single finger on a hex starts painting; empty space falls through to pan
    if (onHexPaint && activePointers.current.size === 1) {
      const hex = findHexAtClient(e.clientX, e.clientY);
      if (hex) {
        isPainting.current = true;
        lastPaintedHexId.current = hex.id;
        didDragMove.current = true; // suppress onClick after paint
        onHexPaint(hex);
        return; // no panning, no long-press
      }
    }

    if (isGM && onHexMove) {
      const hex = findHexAtClient(e.clientX, e.clientY);
      if (hex && hex.active) {
        longPressHex.current = hex;
        longPressTimer.current = window.setTimeout(() => {
          if (longPressHex.current) {
            const pt = svgPoint(e.clientX, e.clientY);
            setDragHex(longPressHex.current);
            setDragSvgPos(pt);
            didDragMove.current = true;
            longPressHex.current = null;
          }
        }, LONG_PRESS_MS);
      }
    }

    if (!dragHex) {
      setPanning(true);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    activePointers.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Two-finger pinch-to-zoom
    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dx = pts[0].clientX - pts[1].clientX;
      const dy = pts[0].clientY - pts[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (lastPinchDist.current !== null && dist > 0) {
        // Spreading fingers (dist ↑) → zoom in (smaller viewBox)
        const factor = lastPinchDist.current / dist;
        const clamped = Math.max(ZOOM_IN_MIN_W / viewBox.w, Math.min(bounds.width * ZOOM_MAX / viewBox.w, factor));
        const newW = viewBox.w * clamped;
        const newH = viewBox.h * clamped;
        const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
        const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
        const mid = svgPoint(midClientX, midClientY);
        const ratioX = (mid.x - viewBox.x) / viewBox.w;
        const ratioY = (mid.y - viewBox.y) / viewBox.h;
        setViewBox({ x: mid.x - ratioX * newW, y: mid.y - ratioY * newH, w: newW, h: newH });
      }
      lastPinchDist.current = dist;
      return;
    }

    // Paint drag — paint each new hex the pointer enters
    if (isPainting.current && onHexPaint) {
      const pt = svgPoint(e.clientX, e.clientY);
      const { q, r } = pixelToHex(pt.x, pt.y, HEX_SIZE);
      const hex = hexes.find(h => h.q === q && h.r === r);
      if (hex && hex.id !== lastPaintedHexId.current) {
        onHexPaint(hex);
        lastPaintedHexId.current = hex.id;
      }
      return;
    }

    if (dragHex) {
      const pt = svgPoint(e.clientX, e.clientY);
      setDragSvgPos(pt);
      const { q, r } = pixelToHex(pt.x, pt.y, HEX_SIZE);
      if (q >= 0 && q < cols && r >= 0 && r < rows && !(q === dragHex.q && r === dragHex.r)) {
        setDropTarget({ q, r });
      } else {
        setDropTarget(null);
      }
      return;
    }

    if (!panning) return;

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - panStart.current.x) * (viewBox.w / rect.width);
    const dy = (e.clientY - panStart.current.y) * (viewBox.h / rect.height);

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      didPan.current = true;
      cancelLongPress();
    }

    setViewBox((v) => ({
      ...v,
      x: panStart.current.vx - dx,
      y: panStart.current.vy - dy,
    }));
  }

  function endPointer(e: PointerEvent) {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      lastPinchDist.current = null;
    }
  }

  function handlePointerUp(e: PointerEvent) {
    endPointer(e);
    cancelLongPress();

    if (isPainting.current) {
      isPainting.current = false;
      lastPaintedHexId.current = null;
      return;
    }

    if (dragHex && onHexMove) {
      const currentDrop = dropTargetRef.current;
      if (currentDrop) {
        const target = hexes.find((h) => h.q === currentDrop.q && h.r === currentDrop.r);
        if (target && target.id !== dragHex.id) {
          onHexMove(dragHex.id, target.id);
        }
      }
      setDragHex(null);
      setDragSvgPos(null);
      setDropTarget(null);
      setPanning(false);
      if (pointerIdRef.current !== null) {
        try { svgRef.current?.releasePointerCapture(pointerIdRef.current); } catch { /* */ }
      }
      return;
    }

    // Simple click: no pan, no drag, no paint — open the hex
    if (!didPan.current && !didDragMove.current) {
      const hex = findHexAtClient(e.clientX, e.clientY);
      if (hex) onHexClick(hex);
    }
    didDragMove.current = false;
    setPanning(false);
  }

  function handlePointerCancel(e: PointerEvent) {
    endPointer(e);
    cancelLongPress();
    isPainting.current = false;
    lastPaintedHexId.current = null;
    setDragHex(null);
    setDragSvgPos(null);
    setDropTarget(null);
    setPanning(false);
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (dragHex) return;
    const svg = svgRef.current;
    if (!svg) return;

    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const clamped = Math.max(ZOOM_IN_MIN_W / viewBox.w, Math.min(bounds.width * ZOOM_MAX / viewBox.w, factor));
    const newW = viewBox.w * clamped;
    const newH = viewBox.h * clamped;

    const mouse = svgPoint(e.clientX, e.clientY);
    const ratioX = (mouse.x - viewBox.x) / viewBox.w;
    const ratioY = (mouse.y - viewBox.y) / viewBox.h;

    setViewBox({
      x: mouse.x - ratioX * newW,
      y: mouse.y - ratioY * newH,
      w: newW,
      h: newH,
    });
  }

  function hexFill(hex: Hex): string {
    if (!isGM && hex.status === 'unrevealed') return 'transparent';
    if (isGM && !hex.active) return 'var(--hex-inactive)';
    if (hex.status === 'unrevealed') return 'var(--hex-unrevealed)';
    if (hex.terrain_type?.color) return hex.terrain_type.color;
    return 'var(--hex-default)';
  }

  function hexStroke(hex: Hex): string {
    if (isGM && !hex.active) return 'var(--hex-inactive-stroke)';
    if (hex.status === 'unrevealed') return 'var(--hex-unrevealed-stroke)';
    return 'var(--hex-stroke)';
  }

  function hexOpacity(hex: Hex): number {
    if (isGM && !hex.active) return 0.35;
    return 1;
  }

  const visibleHexes = hexes.filter((h) => {
    if (!isGM && !h.active) return false;
    const { x, y } = hexToPixel(h.q, h.r, HEX_SIZE);
    return isHexInViewport(x, y, HEX_SIZE, viewBox.x, viewBox.y, viewBox.w, viewBox.h);
  });

  const showLabels = viewBox.w < bounds.width * 0.6;

  let cursor = 'grab';
  if (onHexPaint) cursor = 'crosshair';
  if (panning) cursor = 'grabbing';
  if (dragHex) cursor = 'grabbing';

  return (
    <svg
      ref={svgRef}
      className={styles.svg}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheel={handleWheel}
      style={{
        touchAction: 'none',
        cursor,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {visibleHexes.map((hex) => {
        const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
        const points = hexCorners(x, y, HEX_SIZE);
        const isDragSource = dragHex?.id === hex.id;
        const isDropTarget = dropTarget && hex.q === dropTarget.q && hex.r === dropTarget.r;

        return (
          <g
            key={hex.id}
            style={{
              opacity: isDragSource ? 0.3 : hexOpacity(hex),
              cursor: dragHex ? 'grabbing' : 'pointer',
            }}
          >
            <polygon
              points={points}
              fill={hexFill(hex)}
              stroke={isDropTarget ? 'var(--primary)' : hexStroke(hex)}
              strokeWidth={isDropTarget ? 3 : 1.5}
              strokeDasharray={isDropTarget ? '6 3' : 'none'}
            />

            {hex.terrain_type?.icon && hex.status !== 'unrevealed' && (
              <text
                x={x}
                y={y + 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={HEX_SIZE * 0.55}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {hex.terrain_type.icon}
              </text>
            )}

            {showLabels && hex.status === 'explored' && hex.name && (
              <text
                x={x}
                y={y + HEX_SIZE * 0.65}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={HEX_SIZE * 0.28}
                fill="var(--text)"
                fontWeight={600}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {hex.name.length > 12 ? hex.name.slice(0, 11) + '...' : hex.name}
              </text>
            )}

            {/* Pending (unsaved) indicator dot */}
            {pendingHexIds?.has(hex.id) && (
              <circle
                cx={x + HEX_SIZE * 0.55}
                cy={y - HEX_SIZE * 0.55}
                r={4}
                fill="white"
                stroke="var(--primary)"
                strokeWidth={1.5}
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        );
      })}

      {/* Ghost hex following pointer during drag */}
      {dragHex && dragSvgPos && (
        <g style={{ opacity: 0.6, pointerEvents: 'none' }}>
          <polygon
            points={hexCorners(dragSvgPos.x, dragSvgPos.y, HEX_SIZE)}
            fill={hexFill(dragHex)}
            stroke="var(--primary)"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          {dragHex.terrain_type?.icon && dragHex.status !== 'unrevealed' && (
            <text
              x={dragSvgPos.x}
              y={dragSvgPos.y + 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={HEX_SIZE * 0.55}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {dragHex.terrain_type.icon}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
