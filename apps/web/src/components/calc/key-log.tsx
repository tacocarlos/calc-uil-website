"use client";

import { KEYS, type KeyPress } from "@calc-uil/keypad";
import { useKeyPress, useSerialLines } from "@calc-uil/keypad/react";
import { useRef, useState } from "react";
import { XpWindow } from "@/components/xp/window";

const MAX_ENTRIES = 40;
const SOURCE_LABELS: Record<string, string> = {
  calculator: "Calculator",
  screen: "On-screen",
  keyboard: "Keyboard",
};

interface Entry {
  id: number;
  text: string;
  raw?: boolean;
}

function describe({ id, layer, action, source }: KeyPress): string {
  const key = KEYS[id];
  const name =
    layer === "second"
      ? `2nd ${("second" in key && key.second) || key.label}`
      : layer === "alpha"
        ? `alpha ${("alpha" in key && key.alpha) || key.label}`
        : key.label;
  const did =
    action.type === "insert"
      ? `inserts ${action.text}`
      : action.type === "command"
        ? action.name
        : action.type === "menu"
          ? `${action.name} menu`
          : "not used";
  return `${SOURCE_LABELS[source] ?? source} · [${name}] ${did}`;
}

export function KeyLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const nextId = useRef(0);

  const add = (text: string, raw?: boolean) =>
    setEntries((list) =>
      [{ id: nextId.current++, text, raw }, ...list].slice(0, MAX_ENTRIES),
    );

  useKeyPress((press) => {
    if (!press.repeat) add(describe(press));
  });
  useSerialLines((line) => {
    if (showRaw) add(`⇠ ${line}`, true);
  });

  return (
    <XpWindow id="log" title="Key Events" bodyClassName="flex flex-col gap-2">
      <div className="field-row">
        <input
          id="show-raw-usb"
          type="checkbox"
          checked={showRaw}
          onChange={(e) => setShowRaw(e.target.checked)}
        />
        <label htmlFor="show-raw-usb">Show raw USB lines</label>
      </div>
      <ol className="h-40 overflow-y-auto border border-[#7f9db9] bg-white p-1">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={entry.raw ? "font-mono text-[#a04000]" : undefined}
          >
            {entry.text}
          </li>
        ))}
      </ol>
    </XpWindow>
  );
}
