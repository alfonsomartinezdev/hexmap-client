import { useRef, useState, useEffect, type PointerEvent } from 'react';
import type { Hex } from '../../types';
import { hexToPixel, hexCorners, getGridBounds, isHexInViewport, pixelToHexContaining } from './hexUtils';
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
// Zoom/pan limits apply to all viewports (mobile-first); no desktop-only branching
const ZOOM_IN_MIN_W = HEX_SIZE * 4;
const ZOOM_MAX = 1.0;
const LONG_PRESS_MS = 220;
// Initial view: more zoomed in so less empty space
const INITIAL_ZOOM = 0.7;
// Minimum client-pixel movement to treat a press as a pan (suppresses click)
const PAN_THRESHOLD_PX = 8;
// Larger threshold for touch so tap jitter doesn't suppress hex click on mobile
const PAN_THRESHOLD_TOUCH_PX = 16;

type ViewBox = { x: number; y: number; w: number; h: number };

function getInitialViewBox(b: ReturnType<typeof getGridBounds>): ViewBox {
  const w = b.width * INITIAL_ZOOM;
  const h = b.height * INITIAL_ZOOM;
  return { x: b.minX + (b.width - w) / 2, y: b.minY + (b.height - h) / 2, w, h };
}

/** Expand logical viewBox so aspect matches container; removes letterboxing. */
function getDisplayViewBox(logical: ViewBox, cw: number, ch: number): ViewBox {
  if (cw <= 0 || ch <= 0) return logical;
  const containerAspect = cw / ch;
  const vbAspect = logical.w / logical.h;
  if (containerAspect >= vbAspect) {
    const newW = logical.h * containerAspect;
    return { x: logical.x - (newW - logical.w) / 2, y: logical.y, w: newW, h: logical.h };
  }
  const newH = logical.w / containerAspect;
  return { x: logical.x, y: logical.y - (newH - logical.h) / 2, w: logical.w, h: newH };
}

type Bounds = { minX: number; minY: number; width: number; height: number };

/** Clamp viewBox (x, y) so the visible area stays within grid bounds; at 100% zoom there is no room to pan. */
function clampViewBoxToBounds(vb: ViewBox, b: Bounds): ViewBox {
  const x = Math.max(b.minX, Math.min(b.minX + b.width - vb.w, vb.x));
  const y = Math.max(b.minY, Math.min(b.minY + b.height - vb.h, vb.y));
  return { ...vb, x, y };
}

/** Display viewBox for SVG: match container aspect but cap to grid bounds so we never show empty space (mobile-first). */
function getCappedDisplayViewBox(
  logical: ViewBox,
  cw: number,
  ch: number,
  b: Bounds
): ViewBox {
  const raw = getDisplayViewBox(logical, cw, ch);
  const w = Math.min(raw.w, b.width);
  const h = Math.min(raw.h, b.height);
  const cx = logical.x + logical.w / 2;
  const cy = logical.y + logical.h / 2;
  return clampViewBoxToBounds({ x: cx - w / 2, y: cy - h / 2, w, h }, b);
}

export function HexGrid({ hexes, cols, rows, isGM, onHexClick, onHexMove, onHexPaint, pendingHexIds }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bounds = getGridBounds(cols, rows, HEX_SIZE);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  // State mirrored in refs so handlers see current values before re-render (panning, viewBox, dragHex).

  const [viewBox, _setViewBox] = useState<ViewBox>(() => getInitialViewBox(getGridBounds(cols, rows, HEX_SIZE)));
  const viewBoxRef = useRef<ViewBox>(viewBox);
  function setViewBox(valOrFn: ViewBox | ((v: ViewBox) => ViewBox)) {
    const next = typeof valOrFn === 'function' ? valOrFn(viewBoxRef.current) : valOrFn;
    const clamped = clampViewBoxToBounds(next, bounds);
    viewBoxRef.current = clamped;
    _setViewBox(clamped);
  }

  const [panning, _setPanning] = useState(false);
  const panningRef = useRef(false);
  function setPanning(val: boolean) {
    panningRef.current = val;
    _setPanning(val);
  }

  const [dragHex, _setDragHex] = useState<Hex | null>(null);
  const dragHexRef = useRef<Hex | null>(null);
  function setDragHex(val: Hex | null) {
    dragHexRef.current = val;
    _setDragHex(val);
  }

  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const didPan = useRef(false);
  const clickDownAt = useRef<{ clientX: number; clientY: number } | null>(null);

  // Long-press drag
  const [dragSvgPos, setDragSvgPos] = useState<{ x: number; y: number } | null>(null);
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
  const didPinchThisGesture = useRef(false);

  // Paint mode gesture
  const isPainting = useRef(false);
  const lastPaintedHexId = useRef<number | null>(null);

  const [hoveredHex, setHoveredHex] = useState<Hex | null>(null);

  // Only reset viewBox when grid dimensions actually change (e.g. different map), not on refetch
  const lastGridDims = useRef({ cols, rows });
  useEffect(() => {
    if (lastGridDims.current.cols === cols && lastGridDims.current.rows === rows) return;
    lastGridDims.current = { cols, rows };
    const b = getGridBounds(cols, rows, HEX_SIZE);
    setViewBox(getInitialViewBox(b));
  }, [cols, rows]);

  // Track container size so we can match viewBox aspect and remove letterboxing
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setContainerSize({ w: r.width, h: r.height });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  /** Viewport (client) → SVG user space via getScreenCTM so letterboxing/transforms are correct. */
  function svgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  /** Hex under (clientX, clientY); uses point-in-polygon for exact edges. */
  function findHexAtClient(clientX: number, clientY: number): Hex | undefined {
    const pt = svgPoint(clientX, clientY);
    const coords = pixelToHexContaining(pt.x, pt.y, HEX_SIZE, cols, rows);
    return coords ? hexes.find((h) => h.q === coords.q && h.r === coords.r) : undefined;
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

    setHoveredHex(null);
    clickDownAt.current = { clientX: e.clientX, clientY: e.clientY };

    // Capture for reliable multi-touch
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* */ }
    activePointers.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Two fingers: pinch-zoom
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
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBoxRef.current.x, vy: viewBoxRef.current.y };

    // Paint: finger on hex starts paint; else pan
    if (onHexPaint && activePointers.current.size === 1) {
      const hex = findHexAtClient(e.clientX, e.clientY);
      if (hex) {
        isPainting.current = true;
        lastPaintedHexId.current = hex.id;
        didDragMove.current = true;
        onHexPaint(hex);
        return;
      }
    }

    if (isGM && onHexMove) {
      const hex = findHexAtClient(e.clientX, e.clientY);
      if (hex && hex.active) {
        longPressHex.current = hex;
        longPressTimer.current = window.setTimeout(() => {
          if (longPressHex.current) {
            const h = longPressHex.current;
            const pt = svgPoint(e.clientX, e.clientY);
            setDragHex(h);
            setDragSvgPos(pt);
            didDragMove.current = true;
            longPressHex.current = null;
          }
        }, LONG_PRESS_MS);
      }
    }
  }

  function handlePointerMove(e: PointerEvent) {
    // Only update pointers that were added in pointerdown (don't add on move or we'd treat hover as pan)
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    // Two-finger pinch-to-zoom
    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dx = pts[0].clientX - pts[1].clientX;
      const dy = pts[0].clientY - pts[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (lastPinchDist.current !== null && dist > 0) {
        didPinchThisGesture.current = true;
        const vb = viewBoxRef.current;
        const factor = lastPinchDist.current / dist;
        const clamped = Math.max(ZOOM_IN_MIN_W / vb.w, Math.min(bounds.width * ZOOM_MAX / vb.w, factor));
        const newW = vb.w * clamped;
        const newH = vb.h * clamped;
        const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
        const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
        const mid = svgPoint(midClientX, midClientY);
        const ratioX = (mid.x - vb.x) / vb.w;
        const ratioY = (mid.y - vb.y) / vb.h;
        setViewBox({ x: mid.x - ratioX * newW, y: mid.y - ratioY * newH, w: newW, h: newH });
      }
      lastPinchDist.current = dist;
      return;
    }

    // Paint drag
    if (isPainting.current && onHexPaint) {
      const pt = svgPoint(e.clientX, e.clientY);
      const coords = pixelToHexContaining(pt.x, pt.y, HEX_SIZE, cols, rows);
      const hex = coords ? hexes.find(h => h.q === coords.q && h.r === coords.r) : undefined;
      if (hex && hex.id !== lastPaintedHexId.current) {
        onHexPaint(hex);
        lastPaintedHexId.current = hex.id;
      }
      return;
    }

    const currentDragHex = dragHexRef.current;
    if (currentDragHex) {
      const pt = svgPoint(e.clientX, e.clientY);
      setDragSvgPos(pt);
      const coords = pixelToHexContaining(pt.x, pt.y, HEX_SIZE, cols, rows);
      if (coords && !(coords.q === currentDragHex.q && coords.r === currentDragHex.r)) {
        setDropTarget(coords);
      } else {
        setDropTarget(null);
      }
      return;
    }

    // No pointer down (e.g. mouse moved into SVG without clicking): only update hover
    if (activePointers.current.size !== 1) {
      const hex = findHexAtClient(e.clientX, e.clientY);
      setHoveredHex(hex ?? null);
      return;
    }

    const clientDx = e.clientX - panStart.current.x;
    const clientDy = e.clientY - panStart.current.y;

    // Lazy pan: only start panning once movement exceeds threshold (so tap opens modal)
    const panThreshold = e.pointerType === 'touch' ? PAN_THRESHOLD_TOUCH_PX : PAN_THRESHOLD_PX;
    if (!panningRef.current) {
      if (Math.abs(clientDx) <= panThreshold && Math.abs(clientDy) <= panThreshold) {
        const hex = findHexAtClient(e.clientX, e.clientY);
        setHoveredHex(hex ?? null);
        return;
      }
      setPanning(true);
      didPan.current = true;
      cancelLongPress();
    }

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vb = viewBoxRef.current;
    const displayVb = getCappedDisplayViewBox(vb, rect.width, rect.height, bounds);

    const dx = clientDx * (displayVb.w / rect.width);
    const dy = clientDy * (displayVb.h / rect.height);

    setViewBox({
      ...vb,
      x: panStart.current.vx - dx,
      y: panStart.current.vy - dy,
    });
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

    const currentDragHex = dragHexRef.current;
    if (currentDragHex && onHexMove) {
      const currentDrop = dropTargetRef.current;
      if (currentDrop) {
        const target = hexes.find((h) => h.q === currentDrop.q && h.r === currentDrop.r);
        if (target && target.id !== currentDragHex.id) {
          onHexMove(currentDragHex.id, target.id);
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

    // Click: open hex at pointer-down position (matches hover); suppress if this gesture was a pinch
    if (didPinchThisGesture.current) {
      if (activePointers.current.size === 0) didPinchThisGesture.current = false;
    } else if (!didPan.current && !didDragMove.current) {
      const at = clickDownAt.current ?? { clientX: e.clientX, clientY: e.clientY };
      const hex = findHexAtClient(at.clientX, at.clientY);
      if (hex) onHexClick(hex);
    }
    clickDownAt.current = null;
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
    setHoveredHex(null);
    clickDownAt.current = null;
  }

  function handlePointerLeave() {
    setHoveredHex(null);
    /* Safety: if pointer left without firing pointerup (e.g. left window), clear pan/drag so we don't stay stuck */
    if (panningRef.current || dragHexRef.current || activePointers.current.size > 0) {
      cancelLongPress();
      setDragHex(null);
      setDragSvgPos(null);
      setDropTarget(null);
      setPanning(false);
      clickDownAt.current = null;
      didDragMove.current = false;
      activePointers.current.clear();
      lastPinchDist.current = null;
      if (pointerIdRef.current !== null) {
        try { svgRef.current?.releasePointerCapture(pointerIdRef.current); } catch { /* */ }
        pointerIdRef.current = null;
      }
    }
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (dragHexRef.current) return;

      const vb = viewBoxRef.current;
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const clamped = Math.max(ZOOM_IN_MIN_W / vb.w, Math.min(bounds.width * ZOOM_MAX / vb.w, factor));
      const newW = vb.w * clamped;
      const newH = vb.h * clamped;

      const mouse = svgPoint(e.clientX, e.clientY);
      const ratioX = (mouse.x - vb.x) / vb.w;
      const ratioY = (mouse.y - vb.y) / vb.h;

      setViewBox({
        x: mouse.x - ratioX * newW,
        y: mouse.y - ratioY * newH,
        w: newW,
        h: newH,
      });
    }

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

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

  const displayViewBox =
    containerSize ? getCappedDisplayViewBox(viewBox, containerSize.w, containerSize.h, bounds) : viewBox;

  return (
    <svg
      ref={svgRef}
      className={styles.svg}
      viewBox={`${displayViewBox.x} ${displayViewBox.y} ${displayViewBox.w} ${displayViewBox.h}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
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
        const isHovered = hoveredHex?.id === hex.id;

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
              stroke={isDropTarget ? 'var(--primary)' : isHovered ? 'var(--primary)' : hexStroke(hex)}
              strokeWidth={isDropTarget ? 3 : isHovered ? 2.5 : 1.5}
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
