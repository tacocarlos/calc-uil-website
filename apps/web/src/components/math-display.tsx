"use client";

import type { MathfieldElement } from "mathlive";
import { useCallback, useEffect, useState } from "react";

let mathLive: Promise<void> | null = null;

/** Load MathLive once, in the browser only (it defines a custom element). */
function loadMathLive(): Promise<void> {
  mathLive ??= import("mathlive").then(({ MathfieldElement }) => {
    // Must be set before the first <math-field> renders. The fonts are copied
    // into public/ by scripts/copy-public-assets.mjs.
    MathfieldElement.fontsDirectory = "/mathlive/fonts";
    MathfieldElement.soundsDirectory = null;
  });
  return mathLive;
}

/** Read-only LaTeX rendered with a MathLive <math-field>. */
export function MathDisplay({
  latex,
  className,
}: {
  latex: string;
  className?: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    loadMathLive().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Runs when the field mounts and whenever the LaTeX changes.
  const configure = useCallback(
    (el: MathfieldElement | null) => {
      if (!el) return;
      el.readOnly = true;
      el.menuItems = [];
      el.value = latex;
    },
    [latex],
  );

  if (!ready) {
    // Keep the raw LaTeX available to screen readers until MathLive loads.
    return <span className="sr-only">{latex}</span>;
  }
  return (
    <math-field ref={configure} className={`math-display ${className ?? ""}`} />
  );
}
