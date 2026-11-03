"use client";

import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface DesktopWindow {
  id: string;
  title: string;
}

interface DesktopState {
  isMinimized(id: string): boolean;
  isMaximized(id: string): boolean;
  minimize(id: string): void;
  restore(id: string): void;
  toggleMaximize(id: string): void;
}

const DesktopContext = createContext<DesktopState | null>(null);

export function useDesktop(): DesktopState {
  const desktop = useContext(DesktopContext);
  if (!desktop) throw new Error("useDesktop must be used inside <Desktop>.");
  return desktop;
}

/**
 * A Windows XP-style desktop with a taskbar. `windows` lists the windows on
 * this page, for the taskbar; render the windows themselves as children.
 */
export function Desktop({
  windows,
  tray,
  children,
}: {
  windows: DesktopWindow[];
  /** Extra items for the notification area, left of the clock. */
  tray?: ReactNode;
  children: ReactNode;
}) {
  const [minimized, setMinimized] = useState<ReadonlySet<string>>(new Set());
  const [maximized, setMaximized] = useState<string | null>(null);

  const minimize = useCallback((id: string) => {
    setMinimized((s) => new Set(s).add(id));
    setMaximized((m) => (m === id ? null : m));
  }, []);
  const restore = useCallback((id: string) => {
    setMinimized((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }, []);
  const toggleMaximize = useCallback((id: string) => {
    setMaximized((m) => (m === id ? null : id));
  }, []);

  const state = useMemo<DesktopState>(
    () => ({
      isMinimized: (id) => minimized.has(id),
      isMaximized: (id) => maximized === id,
      minimize,
      restore,
      toggleMaximize,
    }),
    [minimized, maximized, minimize, restore, toggleMaximize],
  );

  return (
    <DesktopContext.Provider value={state}>
      <div className="xp-desktop">{children}</div>
      <Taskbar windows={windows} tray={tray} />
    </DesktopContext.Provider>
  );
}

function Taskbar({
  windows,
  tray,
}: {
  windows: DesktopWindow[];
  tray?: ReactNode;
}) {
  const desktop = useDesktop();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      {menuOpen && <StartMenu onClose={closeMenu} />}
      <nav className="xp-taskbar" aria-label="Taskbar">
        <button
          type="button"
          className="xp-start"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          start
        </button>
        {windows.map(({ id, title }) => {
          const open = !desktop.isMinimized(id);
          return (
            <button
              key={id}
              type="button"
              className="xp-task"
              aria-pressed={open}
              onClick={() =>
                open ? desktop.minimize(id) : desktop.restore(id)
              }
            >
              {title}
            </button>
          );
        })}
        <div className="xp-tray">
          {tray}
          <Clock />
        </div>
      </nav>
    </>
  );
}

function StartMenu({ onClose }: { onClose(): void }) {
  const menu = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape, like the real start menu.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!menu.current?.contains(target) && !target.closest(".xp-start")) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div ref={menu} className="xp-start-menu" role="menu">
      <header>Number Crunchers</header>
      <Link href="/" role="menuitem" onClick={onClose}>
        Welcome
      </Link>
      <Link href="/practice" role="menuitem" onClick={onClose}>
        Practice
      </Link>
    </div>
  );
}

/** Tray clock. Client-only: the time can't be part of the prerendered HTML. */
function Clock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const format = () =>
      new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const timer = setInterval(() => setTime(format()), 1000);
    const first = setTimeout(() => setTime(format()), 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);

  return <time>{time}</time>;
}
