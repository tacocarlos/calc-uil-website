"use client";

import type { ReactNode } from "react";
import { useDesktop } from "./desktop";

/**
 * An XP.css window. Minimize and Close hide it (restore from the taskbar);
 * Maximize fills the desktop.
 */
export function XpWindow({
  id,
  title,
  statusBar,
  className,
  bodyClassName,
  children,
}: {
  /** Must match an id passed to <Desktop windows>. */
  id: string;
  title: string;
  /** Fields for the status bar along the bottom edge. */
  statusBar?: ReactNode[];
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const desktop = useDesktop();
  if (desktop.isMinimized(id)) return null;
  const maximized = desktop.isMaximized(id);

  return (
    <section
      className={`window ${maximized ? "xp-window-maximized" : ""} ${className ?? ""}`}
      aria-label={title}
    >
      <div className="title-bar">
        <div className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => desktop.minimize(id)}
          />
          <button
            type="button"
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => desktop.toggleMaximize(id)}
          />
          <button
            type="button"
            aria-label="Close"
            onClick={() => desktop.minimize(id)}
          />
        </div>
      </div>
      <div className={`window-body ${bodyClassName ?? ""}`}>{children}</div>
      {statusBar && (
        <div className="status-bar">
          {statusBar.map((field, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fields are positional
            <p key={i} className="status-bar-field">
              {field}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** A centered XP message box over the desktop. */
export function MessageBox({
  title,
  kind = "info",
  children,
  actions,
}: {
  title: string;
  kind?: "info" | "warning" | "error";
  children: ReactNode;
  /** Buttons along the bottom, e.g. an OK button. */
  actions?: ReactNode;
}) {
  return (
    <div className="xp-modal">
      <div
        className="window w-[min(26rem,90vw)]"
        role="alertdialog"
        aria-label={title}
      >
        <div className="title-bar">
          <div className="title-bar-text">{title}</div>
        </div>
        <div className="window-body">
          <div className="xp-message">
            <span className="xp-message-icon" data-kind={kind} aria-hidden>
              {kind === "info" ? "i" : "!"}
            </span>
            <div className="flex-1">{children}</div>
          </div>
          {actions && (
            <div className="mt-3 flex justify-end gap-1.5">{actions}</div>
          )}
        </div>
      </div>
    </div>
  );
}
