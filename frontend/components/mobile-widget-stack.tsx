"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export const DASHBOARD_WIDGET_IDS = ["assets", "cashflow", "goals"] as const;
export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

const GAP_PX = 32;

type DragState = {
  id: DashboardWidgetId;
  pointerId: number;
  startY: number;
  from: number;
  to: number;
  dy: number;
  height: number;
  /** Центры виджетов в момент захвата, без учёта сдвига. */
  centers: number[];
};

type HandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

const WidgetDragContext = createContext<{
  getHandleProps: (id: DashboardWidgetId) => HandleProps;
} | null>(null);

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function readStoredOrder(storageKey: string, fallback: DashboardWidgetId[]): DashboardWidgetId[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const allowed = new Set<string>(fallback);
    const next = parsed.filter((id): id is DashboardWidgetId => typeof id === "string" && allowed.has(id));
    for (const id of fallback) {
      if (!next.includes(id)) next.push(id);
    }
    return next.slice(0, fallback.length);
  } catch {
    return fallback;
  }
}

function shiftForIndex(index: number, drag: DragState | null): number {
  if (!drag) return 0;
  if (index === drag.from) return drag.dy;
  if (drag.from < drag.to && index > drag.from && index <= drag.to) {
    return -(drag.height + GAP_PX);
  }
  if (drag.to < drag.from && index >= drag.to && index < drag.from) {
    return drag.height + GAP_PX;
  }
  return 0;
}

export function WidgetDragHandle({
  id,
  className,
  children,
}: {
  id: DashboardWidgetId;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useContext(WidgetDragContext);
  if (!ctx) return <div className={className}>{children}</div>;
  return (
    <div
      tabIndex={0}
      aria-label="Перетащить виджет"
      className={`min-w-0 cursor-grab touch-none active:cursor-grabbing ${className ?? ""}`}
      {...ctx.getHandleProps(id)}
    >
      {children}
    </div>
  );
}

export function MobileWidgetStack({
  storageKey,
  items,
}: {
  storageKey: string;
  items: Record<DashboardWidgetId, ReactNode>;
}) {
  const [order, setOrder] = useState<DashboardWidgetId[]>(() => [...DASHBOARD_WIDGET_IDS]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const orderRef = useRef(order);
  const dragRef = useRef<DragState | null>(null);
  const nodesRef = useRef(new Map<DashboardWidgetId, HTMLDivElement>());

  useEffect(() => {
    const stored = readStoredOrder(storageKey, [...DASHBOARD_WIDGET_IDS]);
    orderRef.current = stored;
    setOrder(stored);
  }, [storageKey]);

  const commit = useCallback(
    (next: DashboardWidgetId[]) => {
      orderRef.current = next;
      setOrder(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Порядок останется в текущей сессии, если хранилище недоступно.
      }
    },
    [storageKey]
  );

  const finishDrag = useCallback(
    (pointerId: number) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== pointerId) return;
      dragRef.current = null;
      setDrag(null);
      commit(moveItem(orderRef.current, current.from, current.to));
    },
    [commit]
  );

  const getHandleProps = useCallback(
    (id: DashboardWidgetId): HandleProps => ({
      onContextMenu: (event) => event.preventDefault(),
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        const list = orderRef.current;
        const from = list.indexOf(id);
        const node = nodesRef.current.get(id);
        if (from < 0 || !node) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const centers = list.map((widgetId) => {
          const rect = nodesRef.current.get(widgetId)?.getBoundingClientRect();
          return rect ? rect.top + rect.height / 2 : 0;
        });
        const next: DragState = {
          id,
          pointerId: event.pointerId,
          startY: event.clientY,
          from,
          to: from,
          dy: 0,
          height: node.getBoundingClientRect().height,
          centers,
        };
        dragRef.current = next;
        setDrag(next);
      },
      onPointerMove: (event) => {
        const current = dragRef.current;
        if (!current || current.pointerId !== event.pointerId || current.id !== id) return;
        const dy = event.clientY - current.startY;
        const movedCenter = current.centers[current.from] + dy;
        let to = current.from;
        let best = Number.POSITIVE_INFINITY;
        current.centers.forEach((center, index) => {
          const distance = Math.abs(movedCenter - center);
          if (distance < best) {
            best = distance;
            to = index;
          }
        });
        const next = { ...current, dy, to };
        dragRef.current = next;
        setDrag(next);
      },
      onPointerUp: (event) => finishDrag(event.pointerId),
      onPointerCancel: (event) => finishDrag(event.pointerId),
      onKeyDown: (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const list = orderRef.current;
        const index = list.indexOf(id);
        const to = event.key === "ArrowUp" ? index - 1 : index + 1;
        commit(moveItem(list, index, to));
      },
    }),
    [commit, finishDrag]
  );

  return (
    <WidgetDragContext.Provider value={{ getHandleProps }}>
      <div className="flex flex-col gap-8">
        {order.map((id, index) => {
          const shift = shiftForIndex(index, drag);
          const isDragged = drag?.id === id;
          return (
            <div
              key={id}
              ref={(node) => {
                if (node) nodesRef.current.set(id, node);
                else nodesRef.current.delete(id);
              }}
              className={isDragged ? "relative z-20" : undefined}
              style={{
                transform: shift !== 0 ? `translate3d(0, ${shift}px, 0)` : undefined,
                transition: drag && !isDragged ? "transform 180ms ease" : undefined,
              }}
            >
              {items[id]}
            </div>
          );
        })}
      </div>
    </WidgetDragContext.Provider>
  );
}
