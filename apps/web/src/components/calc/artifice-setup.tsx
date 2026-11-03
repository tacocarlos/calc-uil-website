"use client";

import {
  ARTIFICE_EXAM_NOTE,
  ARTIFICE_STEPS,
  ARTIFICE_URL,
  type ArtificeStage,
  artificeReleaseFor,
  FIND_OS_VERSION,
} from "@calc-uil/keypad";
import { useCalculatorInstaller } from "@calc-uil/keypad/react";
import { useId, useState } from "react";

/** Optional arTIfiCE jailbreak setup, needed on OS 5.5+ to run KEYPAD. */
export function ArtificeSetup({ onClose }: { onClose(): void }) {
  const installer = useCalculatorInstaller();
  const [os, setOs] = useState("");
  const [sent, setSent] = useState<ReadonlySet<ArtificeStage>>(new Set());
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const inputId = useId();
  const release = os.trim() ? artificeReleaseFor(os) : undefined;
  const busy = installer.status === "installing";
  const artificeJob = installer.job !== null && installer.job !== "keypad";

  const detect = async () => {
    setDetecting(true);
    setDetectNote(null);
    const result = await installer.detectOsVersion();
    setDetecting(false);
    if (result.ok) {
      setOs(result.version);
      setDetectNote(`Read OS ${result.version} from the calculator.`);
    } else if (result.message) {
      setDetectNote(`⚠ ${result.message}`);
    }
  };

  const send = async (stage: ArtificeStage) => {
    if (await installer.installArtifice(stage)) {
      setSent((s) => new Set(s).add(stage));
    }
  };

  return (
    <div className="xp-modal">
      <div
        className="window w-[min(34rem,95vw)]"
        role="dialog"
        aria-label="Set up arTIfiCE"
      >
        <div className="title-bar">
          <div className="title-bar-text">Set up arTIfiCE</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="window-body flex max-h-[80vh] flex-col gap-3 overflow-y-auto">
          <p>
            Calculators on OS 5.5 or later need{" "}
            <a href={ARTIFICE_URL} target="_blank" rel="noopener">
              arTIfiCE
            </a>{" "}
            before they can run KEYPAD. Skip this if KEYPAD already runs on
            yours.
          </p>

          <fieldset>
            <legend>Your calculator</legend>
            <div className="field-row-stacked">
              <label htmlFor={inputId}>OS version</label>
              <div className="flex gap-1.5">
                <input
                  id={inputId}
                  type="text"
                  className="flex-1"
                  placeholder="e.g. 5.8.5.0021"
                  value={os}
                  onChange={(e) => setOs(e.target.value)}
                />
                <button
                  type="button"
                  onClick={detect}
                  disabled={detecting || busy || !installer.supported}
                  title="Read the OS version from the plugged-in calculator"
                >
                  {detecting ? "Reading…" : "Detect"}
                </button>
              </div>
            </div>
            {detectNote && <p className="mt-1">{detectNote}</p>}
            <p className="mt-1">
              Plug the calculator in (on the home screen) and click Detect, or
              type the version yourself. {FIND_OS_VERSION}
            </p>
          </fieldset>

          {release === null && <p>Enter a version number like 5.8.5.</p>}
          {release === "not-needed" && (
            <p>
              ✔ OS {os.trim()} runs KEYPAD without arTIfiCE. Just use Install
              KEYPAD.
            </p>
          )}
          {release === "unsupported" && (
            <p>
              ⚠ arTIfiCE doesn’t support OS {os.trim()} yet. Check the{" "}
              <a href={ARTIFICE_URL} target="_blank" rel="noopener">
                arTIfiCE page
              </a>{" "}
              for updates.
            </p>
          )}

          {(release === "v2.1" || release === "v3") && (
            <fieldset>
              <legend>
                arTIfiCE {release} steps (OS {os.trim()})
              </legend>
              <ol className="list-decimal space-y-2 pl-5">
                {ARTIFICE_STEPS[release].map((step) => (
                  <li key={step.text}>
                    <span className={step.warning ? "font-bold" : undefined}>
                      {step.warning && "⚠ "}
                      {step.text}
                    </span>
                    {step.link && (
                      <>
                        {" "}
                        <a href={step.link.href} target="_blank" rel="noopener">
                          {step.link.label}
                        </a>
                      </>
                    )}
                    {step.send && (
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy || !installer.supported}
                          onClick={() => step.send && send(step.send)}
                        >
                          Send
                        </button>
                        {sent.has(step.send) && <span>✔ Sent</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </fieldset>
          )}

          {artificeJob && installer.status !== "idle" && (
            <div role="status">
              <p>
                {installer.status === "error" && "⚠ "}
                {installer.message}
              </p>
              {busy && (
                <progress
                  className="mt-1 w-full"
                  max={installer.total || 1}
                  value={installer.done}
                />
              )}
            </div>
          )}

          <p className="text-[11px] opacity-80">
            {ARTIFICE_EXAM_NOTE} arTIfiCE is made by YvanTT and used at your own
            risk.
          </p>

          <div className="flex justify-end">
            <button type="button" className="default" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
