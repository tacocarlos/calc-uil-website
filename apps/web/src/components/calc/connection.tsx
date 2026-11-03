"use client";

import {
  useCalculatorConnection,
  useCalculatorInstaller,
} from "@calc-uil/keypad/react";
import { useState } from "react";
import { ArtificeSetup } from "@/components/calc/artifice-setup";
import { MessageBox } from "@/components/xp/window";

const STATUS_TEXT = {
  disconnected: "No calculator",
  connecting: "Connecting…",
  "no-handshake": "Waiting for KEYPAD…",
  connected: "Calculator connected",
} as const;

/** Install / Connect buttons for a window's toolbar. */
export function ConnectionToolbar() {
  const conn = useCalculatorConnection();
  const installer = useCalculatorInstaller();
  const connected = conn.state === "connected";
  const [artificeOpen, setArtificeOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={installer.install}
          disabled={
            !installer.supported ||
            installer.status === "installing" ||
            connected
          }
          title={
            installer.supported
              ? undefined
              : "Installing needs WebUSB (Chrome or Edge)."
          }
        >
          Install KEYPAD…
        </button>
        <button
          type="button"
          onClick={() => setArtificeOpen(true)}
          title="Needed on OS 5.5 and later before KEYPAD will run"
        >
          Set up arTIfiCE…
        </button>
        <button
          type="button"
          onClick={connected ? conn.disconnect : conn.connect}
          disabled={!conn.supported}
        >
          {connected ? "Disconnect" : "Connect calculator…"}
        </button>
      </div>

      {conn.error && (
        <MessageBox
          title="Connect calculator"
          kind="error"
          actions={
            <button type="button" onClick={conn.clearError}>
              OK
            </button>
          }
        >
          Couldn’t open the calculator: {conn.error}
        </MessageBox>
      )}
      {conn.state === "no-handshake" && (
        <MessageBox
          title="Connect calculator"
          kind="warning"
          actions={
            <button type="button" onClick={conn.disconnect}>
              OK
            </button>
          }
        >
          The port opened but the calculator didn’t answer. Make sure KEYPAD is
          running on the calculator, then connect again.
        </MessageBox>
      )}
      <InstallDialog />
      {artificeOpen && (
        <ArtificeSetup
          onClose={() => {
            installer.reset();
            setArtificeOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Progress and result of installing KEYPAD (arTIfiCE shows its own, in ArtificeSetup). */
function InstallDialog() {
  const installer = useCalculatorInstaller();
  if (installer.job !== "keypad") return null;

  if (installer.status === "installing") {
    return (
      <MessageBox title="Install KEYPAD">
        <p>{installer.message}</p>
        <progress
          className="mt-2 w-full"
          max={installer.total || 1}
          value={installer.done}
        />
      </MessageBox>
    );
  }
  if (installer.status === "done" || installer.status === "error") {
    return (
      <MessageBox
        title="Install KEYPAD"
        kind={installer.status === "error" ? "error" : "info"}
        actions={
          <button type="button" onClick={installer.reset}>
            OK
          </button>
        }
      >
        {installer.status === "error" && "Install failed: "}
        {installer.message}
      </MessageBox>
    );
  }
  return null;
}

/** Connection status text, e.g. for a status bar. */
export function ConnectionStatus() {
  const conn = useCalculatorConnection();
  if (!conn.supported) return "USB needs Chrome or Edge";
  return conn.state === "connected" && conn.modelName
    ? `${conn.modelName} connected`
    : STATUS_TEXT[conn.state];
}

/** Taskbar tray light: green while a calculator is connected. */
export function ConnectionLight() {
  const { state } = useCalculatorConnection();
  const connected = state === "connected";
  return (
    <span
      className="xp-tray-light"
      data-on={connected}
      title={connected ? "Calculator connected" : "No calculator"}
      role="img"
      aria-label={connected ? "Calculator connected" : "No calculator"}
    />
  );
}
