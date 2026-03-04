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
}

const HEX_SIZE = 30;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.5;
const LONG_PRESS_MS = 400;

export function HexGrid({ hexes, cols, rows, isGM, onHexClick, onHexMove }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bounds = getGridBounds(cols, rows, HEX_SIZE);

  const [viewBox, setViewBox] = useState({
    x: bounds.minX,
    y: bounds.minY,
    w: bounds.width,
    h: bounds.height,
  });

  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const didPan = useRef(false);

  // Long-press hex drag state
  const [dragHex, setDragHex] = useState<Hex | null>(null);
  const [dragSvgPos, setDragSvgPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ q: number; r: number } | null>(null);
  const longPressTimer = useRef<number>(0);
  const longPressHex = useRef<Hex | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const didDragMove = useRef(false);

  useEffect(() => {
    const b = getGridBounds(cols, rows, HEX_SIZE);
    setViewBox({ x: b.minX, y: b.minY, w: b.width, h: b.height });
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
    pointerIdRef.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);

    didPan.current = false;
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };

    if (isGM && onHexMove) {
      const hex = findHexAtClient(e.clientX, e.clientY);
      if (hex) {
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

  function handlePointerUp(e: PointerEvent) {
    cancelLongPress();

    if (dragHex && onHexMove) {
      if (dropTarget) {
        const target = hexes.find((h) => h.q === dropTarget.q && h.r === dropTarget.r);
        if (target && target.id !== dragHex.id) {
          onHexMove(dragHex.id, target.id);
        }
      }
      setDragHex(null);
      setDragSvgPos(null);
      setDropTarget(null);
      if (pointerIdRef.current !== null) {
        try { (e.target as Element).releasePointerCapture(pointerIdRef.current); } catch { /* */ }
      }
      return;
    }

    setPanning(false);
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (dragHex) return;
    const svg = svgRef.current;
    if (!svg) return;

    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const newW = Math.max(bounds.width * ZOOM_MIN, Math.min(bounds.width * ZOOM_MAX, viewBox.w * factor));
    const newH = Math.max(bounds.height * ZOOM_MIN, Math.min(bounds.height * ZOOM_MAX, viewBox.h * factor));

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

  function handleHexClick(hex: Hex) {
    if (didPan.current || dragHex || didDragMove.current) {
      didDragMove.current = false;
      return;
    }
    onHexClick(hex);
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
  if (dragHex) cursor = 'grabbing';
  else if (panning) cursor = 'grabbing';

  return (
    <svg
      ref={svgRef}
      className={styles.svg}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      style={{ touchAction: 'none', cursor }}
    >
      {visibleHexes.map((hex) => {
        const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
        const points = hexCorners(x, y, HEX_SIZE);
        const isDragSource = dragHex?.id === hex.id;
        const isDropTarget = dropTarget && hex.q === dropTarget.q && hex.r === dropTarget.r;

        return (
          <g
            key={hex.id}
            onClick={() => handleHexClick(hex)}
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
