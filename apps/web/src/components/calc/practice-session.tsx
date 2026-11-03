"use client";

import {
  grade,
  newProblem,
  type Problem,
  type ResultEvent,
  threeSigFigsLatex,
} from "@calc-uil/keypad";
import {
  useHomeScreen,
  useKeyboardInput,
  useKeypad,
} from "@calc-uil/keypad/react";
import { useCallback, useEffect, useState } from "react";
import {
  ConnectionStatus,
  ConnectionToolbar,
} from "@/components/calc/connection";
import { TiEntry } from "@/components/calc/ti-entry";
import { MathDisplay } from "@/components/math-display";
import { XpWindow } from "@/components/xp/window";

type Feedback =
  | { kind: "prompt" }
  | { kind: "correct" | "close"; seconds: string; answer: string }
  | { kind: "wrong"; got: string }
  | { kind: "skipped"; answer: string };

interface Round {
  problem: Problem;
  number: number;
  startedAt: number;
  feedback: Feedback;
}

const isFinished = (f: Feedback) =>
  f.kind === "correct" || f.kind === "close" || f.kind === "skipped";

const isCorrect = (f: Feedback) => f.kind === "correct" || f.kind === "close";

/** How long the green checkmark shows before the next problem. */
const ADVANCE_MS = 1500;

export function PracticeSession() {
  // Problems are random, so they're only created in event handlers (Start /
  // Next): random values can't be part of the prerendered HTML.
  const [round, setRound] = useState<Round | null>(null);
  const [solved, setSolved] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const next = useCallback(() => {
    setRound((r) => ({
      problem: newProblem(),
      number: (r?.number ?? 0) + 1,
      startedAt: performance.now(),
      feedback: { kind: "prompt" },
    }));
  }, []);

  // After a correct answer, show the checkmark briefly, then move on.
  const correctProblem =
    round && isCorrect(round.feedback) ? round.number : null;
  useEffect(() => {
    if (correctProblem === null) return;
    const timer = setTimeout(next, ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [correctProblem, next]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const onResult = ({ value }: ResultEvent) => {
    if (!round || isFinished(round.feedback)) return;
    const answer = threeSigFigsLatex(round.problem.answer);
    const seconds = ((performance.now() - round.startedAt) / 1000).toFixed(1);
    const result = grade(value, round.problem.answer);
    if (result) setSolved((n) => n + 1);
    setRound({
      ...round,
      feedback: result
        ? { kind: result === "exact" ? "correct" : "close", seconds, answer }
        : { kind: "wrong", got: threeSigFigsLatex(value) },
    });
  };

  const screen = useHomeScreen({
    onResult,
    onUnhandled: (press) => {
      if (press.action.type === "menu")
        setNotice(
          `The ${press.action.name} menu isn’t available in practice mode.`,
        );
      else if (press.action.type === "unsupported")
        setNotice(`${press.action.name} isn’t used in practice mode.`);
      else if (press.id === "on")
        setNotice("On the real calculator, [on] exits keypad mode.");
    },
  });
  useKeyboardInput();

  return (
    <XpWindow
      id="practice"
      title="Number Crunchers Practice"
      bodyClassName="flex flex-col gap-3"
      statusBar={[
        <ConnectionStatus key="conn" />,
        `Solved: ${solved}`,
        notice ?? "Ready",
      ]}
    >
      <ConnectionToolbar />

      <fieldset className="relative">
        <legend>{round ? `Problem ${round.number}` : "Problem"}</legend>
        {round && isCorrect(round.feedback) && <CorrectCheck />}
        <div className="flex min-h-24 flex-col items-center justify-center py-2 text-center">
          {round ? (
            <>
              {/* Long problems scroll sideways instead of overflowing the window. */}
              <div className="max-w-full overflow-x-auto">
                <MathDisplay latex={round.problem.latex} className="text-3xl" />
              </div>
              {round.problem.note && <p>({round.problem.note})</p>}
            </>
          ) : (
            <p>
              Connect your calculator (or use the keypad), then press Start.
            </p>
          )}
        </div>
        {round && <FeedbackLine feedback={round.feedback} />}
        <div className="mt-2 flex justify-end gap-1.5">
          {round && !isFinished(round.feedback) ? (
            <button
              type="button"
              onClick={() =>
                setRound({
                  ...round,
                  feedback: {
                    kind: "skipped",
                    answer: threeSigFigsLatex(round.problem.answer),
                  },
                })
              }
            >
              Skip
            </button>
          ) : (
            <button type="button" className="default" onClick={next}>
              {round ? "Next problem" : "Start"}
            </button>
          )}
        </div>
      </fieldset>

      <CalcDisplay {...screen} />
    </XpWindow>
  );
}

/** Large green checkmark shown over a correctly answered problem. */
function CorrectCheck() {
  return (
    <span
      role="img"
      aria-label="Correct"
      className="pointer-events-none absolute top-2 right-3 grid size-14 animate-[xp-pop_200ms_ease-out] place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#7be07b,#1f9a1f)] text-3xl font-bold text-white shadow-[0_2px_6px_rgb(0_0_0/0.35),inset_0_-3px_4px_rgb(0_0_0/0.2)]"
    >
      ✔
    </span>
  );
}

/** The form students always write answers in. */
const ANSWER_FORMAT = "X.YZ\\times 10^{\\textstyle k}";

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  switch (feedback.kind) {
    case "prompt":
      return (
        <p>
          Key the expression in on your calculator and press [enter]. Write your
          answer as <MathDisplay latex={ANSWER_FORMAT} />.
        </p>
      );
    case "correct":
      return (
        <p>
          ✔ Correct in {feedback.seconds}s. Write it as{" "}
          <MathDisplay latex={feedback.answer} />. Next problem coming up…
        </p>
      );
    case "close":
      return (
        <p>
          ✔ Good to 3 significant digits (
          <MathDisplay latex={feedback.answer} />
          ), but not exact. Rounded an intermediate value? Next problem coming
          up…
        </p>
      );
    case "wrong":
      return (
        <p>
          ✘ <MathDisplay latex={feedback.got} /> isn’t it. Check your
          parentheses and try again.
        </p>
      );
    case "skipped":
      return (
        <p>
          Answer: <MathDisplay latex={feedback.answer} />
        </p>
      );
  }
}

function CalcDisplay({
  tokens,
  cursor,
  history,
  mode,
  insertMode,
}: ReturnType<typeof useHomeScreen>) {
  const { second, alpha } = useKeypad();
  const cursorText = second ? "↑" : alpha ? "A" : undefined;

  return (
    <section className="overflow-hidden border border-[#7f9db9] bg-white font-mono text-black shadow-[inset_1px_1px_2px_rgb(0_0_0/0.2)]">
      <div className="flex justify-between bg-zinc-200 px-2 py-0.5 text-xs">
        <span className="font-bold">
          {second ? "2ND" : alpha ? "ALPHA" : ""}
        </span>
        <span>NORMAL FLOAT AUTO REAL {mode.toUpperCase()} MP</span>
      </div>
      <div className="flex h-52 flex-col justify-end overflow-y-auto px-2 py-1 text-lg leading-relaxed">
        {history.map((item) => (
          <div key={item.id}>
            <div className="break-all">
              <TiEntry tokens={item.tokens} />
            </div>
            <div className={`text-right ${item.error ? "text-red-700" : ""}`}>
              {item.output}
            </div>
          </div>
        ))}
        <div className="break-all whitespace-pre-wrap">
          <TiEntry
            tokens={tokens}
            cursor={{ position: cursor, text: cursorText, insert: insertMode }}
          />
        </div>
      </div>
    </section>
  );
}
