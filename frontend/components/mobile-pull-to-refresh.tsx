"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Визуальный порог, после которого отпускание запускает обновление. */
const TRIGGER_PX = 78;
/** Сопротивление пальцу: обновление срабатывает на длинном свайпе вниз. */
const RESISTANCE = 0.5;
const MAX_PULL_PX = 112;
const REST_PX = 52;

type RefreshFn = () => Promise<void> | void;

type PullSnap = {
  pull: number;
  refreshing: boolean;
  tracking: boolean;
};

type PullStore = {
  get: () => PullSnap;
  set: (partial: Partial<PullSnap>) => void;
  subscribe: (listener: () => void) => () => void;
};

type PullToRefreshApi = {
  register: (fn: RefreshFn) => () => void;
  setScrollElement: (element: HTMLElement | null) => void;
  getScrollElement: () => HTMLElement | null;
  getStore: () => PullStore;
};

const PullToRefreshContext = createContext<PullToRefreshApi | null>(null);

const EMPTY_SNAP: PullSnap = { pull: 0, refreshing: false, tracking: false };

function createPullStore(): PullStore {
  let snap: PullSnap = EMPTY_SNAP;
  const listeners = new Set<() => void>();
  return {
    get: () => snap,
    set(partial) {
      const next = { ...snap, ...partial };
      if (
        next.pull === snap.pull &&
        next.refreshing === snap.refreshing &&
        next.tracking === snap.tracking
      ) {
        return;
      }
      snap = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function isNestedScroller(target: EventTarget | null, root: HTMLElement) {
  let node = target instanceof Element ? target : null;
  while (node && node !== root) {
    if (node instanceof HTMLElement) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        node.scrollHeight > node.clientHeight + 4
      ) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

function subscribeNoop() {
  return () => {};
}

function getEmptySnap() {
  return EMPTY_SNAP;
}

export function MobilePullToRefreshProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const storeRef = useRef<PullStore | null>(null);
  if (!storeRef.current) storeRef.current = createPullStore();
  const handlersRef = useRef<Set<RefreshFn>>(new Set());
  const refreshingRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const scrollElRef = useRef<HTMLElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  const api = useMemo<PullToRefreshApi>(
    () => ({
      register(fn) {
        handlersRef.current.add(fn);
        return () => {
          handlersRef.current.delete(fn);
        };
      },
      setScrollElement(element) {
        scrollElRef.current = element;
        setScrollEl((prev) => (prev === element ? prev : element));
      },
      getScrollElement: () => scrollElRef.current,
      getStore: () => storeRef.current!,
    }),
    []
  );

  useEffect(() => {
    const el = scrollEl;
    const store = storeRef.current;
    if (!el || !store || !enabled) {
      refreshingRef.current = false;
      store?.set({ pull: 0, tracking: false, refreshing: false });
      return;
    }

    let startY = 0;
    let startX = 0;
    let armed = false;
    let pulling = false;
    let lastPull = 0;
    let suppressClick = false;

    const collapse = () => {
      store.set({ tracking: false });
      requestAnimationFrame(() => {
        if (!refreshingRef.current) store.set({ pull: 0 });
      });
    };

    const runRefresh = async () => {
      if (refreshingRef.current) return;
      const fns = Array.from(handlersRef.current);
      if (fns.length === 0) {
        collapse();
        return;
      }
      refreshingRef.current = true;
      store.set({ tracking: false });
      requestAnimationFrame(() => {
        if (refreshingRef.current) store.set({ pull: REST_PX, refreshing: true, tracking: false });
      });
      const started = Date.now();
      try {
        await Promise.allSettled(fns.map((fn) => Promise.resolve().then(fn)));
      } finally {
        const wait = Math.max(0, 420 - (Date.now() - started));
        if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
        refreshingRef.current = false;
        store.set({ refreshing: false, tracking: false });
        requestAnimationFrame(() => {
          if (!refreshingRef.current) store.set({ pull: 0 });
        });
      }
    };

    const onStart = (event: TouchEvent) => {
      if (!enabledRef.current || refreshingRef.current) return;
      if (handlersRef.current.size === 0) return;
      if (event.touches.length !== 1) return;
      if (el.scrollTop > 2) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "[role='dialog'], [role='alertdialog'], [aria-modal='true'], [data-no-pull-refresh], input, textarea, select, [contenteditable='true']"
        )
      ) {
        return;
      }
      if (isNestedScroller(target, el)) return;
      const touch = event.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      armed = true;
      pulling = false;
      lastPull = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!armed || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        armed = false;
        pulling = false;
        lastPull = 0;
        store.set({ pull: 0, tracking: false });
        return;
      }
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!pulling) {
        if (dy < 16) return;
        if (Math.abs(dx) > dy * 0.85) {
          armed = false;
          return;
        }
        if (el.scrollTop > 2) {
          armed = false;
          return;
        }
        pulling = true;
      }
      if (dy <= 0) {
        pulling = false;
        lastPull = 0;
        store.set({ pull: 0, tracking: false });
        return;
      }
      if (event.cancelable) event.preventDefault();
      if (el.scrollTop !== 0) el.scrollTop = 0;
      lastPull = Math.min(MAX_PULL_PX, dy * RESISTANCE);
      store.set({ pull: lastPull, tracking: true });
    };

    const onEnd = () => {
      if (!armed) return;
      const shouldRefresh = pulling && lastPull >= TRIGGER_PX && handlersRef.current.size > 0;
      const didPull = pulling;
      armed = false;
      pulling = false;
      if (didPull) suppressClick = true;
      if (shouldRefresh) {
        void runRefresh();
        return;
      }
      collapse();
    };

    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("click", onClick, true);
      if (!refreshingRef.current) store.set({ pull: 0, tracking: false });
    };
  }, [enabled, scrollEl]);

  return <PullToRefreshContext.Provider value={api}>{children}</PullToRefreshContext.Provider>;
}

export function usePullToRefresh(handler: RefreshFn) {
  const api = useContext(PullToRefreshContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!api) return;
    return api.register(() => handlerRef.current());
  }, [api]);
}

export function MobilePullToRefreshScroll({
  className,
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  const api = useContext(PullToRefreshContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api?.setScrollElement(ref.current);
    return () => api?.setScrollElement(null);
  }, [api]);

  return (
    <div ref={ref} className={className} style={style} {...rest}>
      <MobilePullToRefreshIndicator />
      {children}
    </div>
  );
}

const CONTENT_TRANSITION = "transform 240ms ease";

function screenHeaders(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-screen-header]")).filter(
    (header) => header.getClientRects().length > 0
  );
}

/** Сдвигает только блоки под шапкой. Саму шапку не трогает и не двигает её в потоке. */
function shiftContentBelowHeaders(
  root: HTMLElement,
  pull: number,
  tracking: boolean,
  previous: Set<HTMLElement>
) {
  const transition = tracking ? "none" : CONTENT_TRANSITION;
  const headers = screenHeaders(root);
  const next = new Set<HTMLElement>();

  const mark = (element: HTMLElement) => {
    if (next.has(element) || element.hasAttribute("data-screen-header") || element.hasAttribute("data-pull-indicator")) {
      return;
    }
    next.add(element);
    element.style.transition = transition;
    element.style.transform = pull > 0 ? `translateY(${pull}px)` : "translateY(0px)";
    element.setAttribute("data-pull-shifted", "");
  };

  headers.forEach((header) => {
    header.style.transition = "";
    header.style.transform = "";
    let sibling = header.nextElementSibling;
    while (sibling) {
      if (sibling instanceof HTMLElement) mark(sibling);
      sibling = sibling.nextElementSibling;
    }
  });

  if (headers.length === 0) {
    Array.from(root.children).forEach((child) => {
      if (child instanceof HTMLElement) mark(child);
    });
  }

  previous.forEach((element) => {
    if (next.has(element)) return;
    element.style.transition = "";
    element.style.transform = "";
    element.removeAttribute("data-pull-shifted");
  });

  if (pull <= 0 && !tracking) {
    window.setTimeout(() => {
      next.forEach((element) => {
        if (element.style.transform !== "translateY(0px)") return;
        element.style.transition = "";
        element.style.transform = "";
        element.removeAttribute("data-pull-shifted");
      });
    }, 260);
  }

  return { headers, shifted: next };
}

function MobilePullToRefreshIndicator() {
  const api = useContext(PullToRefreshContext);
  const store = api?.getStore();
  const snap = useSyncExternalStore(
    store ? store.subscribe : subscribeNoop,
    store ? store.get : getEmptySnap,
    store ? store.get : getEmptySnap
  );
  const indicatorRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const shiftedRef = useRef<Set<HTMLElement>>(new Set());
  const progress = Math.min(1, snap.pull / TRIGGER_PX);

  useLayoutEffect(() => {
    const root = api?.getScrollElement();
    const indicator = indicatorRef.current;
    const spinner = spinnerRef.current;
    if (!root || !indicator || !spinner) return;
    const { headers } = shiftContentBelowHeaders(root, snap.pull, snap.tracking, shiftedRef.current);
    shiftedRef.current = new Set(root.querySelectorAll<HTMLElement>("[data-pull-shifted]"));
    const header = headers[0];
    if (!header || snap.pull <= 0) {
      spinner.style.top = "0px";
      return;
    }
    const top = header.getBoundingClientRect().bottom - indicator.getBoundingClientRect().top;
    spinner.style.top = `${top}px`;
  }, [api, snap.pull, snap.tracking]);

  return (
    <div
      ref={indicatorRef}
      data-pull-indicator
      aria-hidden={!snap.refreshing}
      role={snap.refreshing ? "status" : undefined}
      aria-live={snap.refreshing ? "polite" : undefined}
      aria-label={snap.refreshing ? "Обновление" : undefined}
      className="pointer-events-none relative z-[5] h-0 min-h-0 shrink-0 overflow-visible"
    >
      <div
        ref={spinnerRef}
        className="absolute inset-x-0 flex items-center justify-center"
        style={{ top: 0, height: snap.pull }}
      >
        <Loader2
          className={cn("size-6 text-white", snap.refreshing && "motion-safe:animate-spin")}
          strokeWidth={2.25}
          style={{
            opacity: snap.refreshing ? 1 : Math.min(1, snap.pull / 28),
            transform: snap.refreshing ? undefined : `rotate(${progress * 320}deg)`,
          }}
        />
      </div>
    </div>
  );
}
