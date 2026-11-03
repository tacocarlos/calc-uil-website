"use client";

import { KEYS, type KeyId, LAYOUT_84CE } from "@calc-uil/keypad";
import { useCalculatorConnection, useKeyButton } from "@calc-uil/keypad/react";
import { XpWindow } from "@/components/xp/window";

const KIND_CLASSES: Record<string, string> = {
  num: "bg-zinc-200 text-zinc-900",
  op: "bg-zinc-600 text-white",
  second: "bg-sky-500 text-white",
  alpha: "bg-green-600 text-white",
  arrow: "bg-zinc-500 text-white",
  fn: "bg-zinc-700 text-white text-[0.65rem]",
  dark: "bg-zinc-800 text-white",
};

function Key({ id }: { id: KeyId }) {
  const key = KEYS[id];
  const { pressedBy, buttonProps } = useKeyButton(id);
  const second = "second" in key ? key.second : undefined;
  const alpha = "alpha" in key ? key.alpha : undefined;

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={key.label}
      className="ti-key"
      {...buttonProps}
    >
      {key.kind !== "arrow" && (
        <span className="flex h-3 justify-between px-0.5 text-[0.5rem] uppercase leading-none">
          <span className="text-sky-300">{second}</span>
          <span className="text-green-300">{alpha}</span>
        </span>
      )}
      <span
        className={`flex h-8 items-center justify-center rounded text-sm font-semibold ${KIND_CLASSES[key.kind]} ${
          pressedBy ? "translate-y-px brightness-125" : ""
        } ${pressedBy === "calculator" ? "ring-2 ring-orange-400" : ""}`}
      >
        {key.label}
      </span>
    </button>
  );
}

/** TI-84 Plus CE keypad. Physical key presses light up in orange. */
export function OnScreenKeypad() {
  const { state } = useCalculatorConnection();

  return (
    <XpWindow
      id="keypad"
      title="TI-84 Plus CE"
      className="self-start"
      statusBar={[
        state === "connected"
          ? "Physical keys light up orange"
          : "Click keys or type",
      ]}
    >
      <div
        className={`ti-keypad flex w-80 select-none flex-col gap-2 rounded-2xl bg-zinc-900 p-4 ${
          state === "connected" ? "ring-4 ring-orange-400" : ""
        }`}
      >
        <div className="grid grid-cols-5 gap-1.5">
          {LAYOUT_84CE.top.map((id) => (
            <Key key={id} id={id} />
          ))}
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            {LAYOUT_84CE.upper.flat().map((id) => (
              <Key key={id} id={id} />
            ))}
          </div>
          <div className="grid grid-cols-3 grid-rows-3 place-self-center">
            <div className="col-start-2">
              <Key id="up" />
            </div>
            <div className="col-start-1 row-start-2">
              <Key id="left" />
            </div>
            <div className="col-start-3 row-start-2">
              <Key id="right" />
            </div>
            <div className="col-start-2 row-start-3">
              <Key id="down" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {LAYOUT_84CE.grid.flat().map((id) => (
            <Key key={id} id={id} />
          ))}
        </div>
      </div>
    </XpWindow>
  );
}
