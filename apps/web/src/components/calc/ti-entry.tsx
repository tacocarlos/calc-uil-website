"use client";

import { findTemplates, type TemplateSpan } from "@calc-uil/keypad";
import type { ReactNode } from "react";

interface CursorOptions {
  /** Token index the cursor sits before (tokens.length = end of line). */
  position: number;
  /** Text to show in the cursor instead of the token under it (2nd/alpha). */
  text?: string;
  insert: boolean;
}

/**
 * A TI-84 entry line in MathPrint style: n/d templates stacked, exponent
 * templates raised. Pass `cursor` for the line being edited; leave it out for
 * history.
 */
export function TiEntry({
  tokens,
  cursor,
}: {
  tokens: readonly string[];
  cursor?: CursorOptions;
}) {
  const spans = new Map(findTemplates(tokens).map((s) => [s.start, s]));
  return <>{renderRange(tokens, 0, tokens.length, spans, cursor)}</>;
}

/** Render tokens[from, to), where `to` is the end of the line or of a template part. */
function renderRange(
  tokens: readonly string[],
  from: number,
  to: number,
  spans: ReadonlyMap<number, TemplateSpan>,
  cursor: CursorOptions | undefined,
): ReactNode[] {
  const part = (a: number, b: number) =>
    renderRange(tokens, a, b, spans, cursor);
  const out: ReactNode[] = [];
  let i = from;
  while (i < to) {
    const span = spans.get(i);
    if (span) {
      // Cursor right before a template: a blank cursor, then the template.
      if (cursor?.position === i) {
        out.push(<Cursor key={`c${i}`} cursor={cursor} />);
      }
      out.push(
        span.kind === "fraction" ? (
          <Fraction
            key={i}
            numerator={part(i + 1, span.bar)}
            denominator={part(span.bar + 1, span.end)}
          />
        ) : (
          <sup key={i} className="text-[0.75em]">
            {part(i + 1, span.end)}
          </sup>
        ),
      );
      i = span.end + 1;
      continue;
    }
    const token = tokens[i] ?? "";
    out.push(
      cursor?.position === i ? (
        <Cursor key={i} cursor={cursor} token={token} />
      ) : (
        <span key={i}>{token}</span>
      ),
    );
    i++;
  }
  // Cursor at the end of this range: end of the line, or of a template part.
  if (cursor?.position === to) {
    out.push(<Cursor key={`c${to}`} cursor={cursor} />);
  } else if (from === to) {
    out.push(<EmptySlot key={`e${to}`} />);
  }
  return out;
}

function Fraction({
  numerator,
  denominator,
}: {
  numerator: ReactNode;
  denominator: ReactNode;
}) {
  return (
    <span className="mx-0.5 inline-flex flex-col items-center align-middle text-[0.8em] leading-tight">
      <span className="border-b border-current px-0.5">{numerator}</span>
      <span className="px-0.5">{denominator}</span>
    </span>
  );
}

/** The dotted box the TI shows in an empty template slot. */
function EmptySlot() {
  return (
    <span className="inline-block h-[0.9em] w-[0.6em] border border-dotted border-current align-middle" />
  );
}

function Cursor({ cursor, token }: { cursor: CursorOptions; token?: string }) {
  return (
    <span
      className={
        cursor.insert
          ? "border-b-2 border-black"
          : "animate-pulse bg-black text-white"
      }
    >
      {cursor.text ?? token ?? " "}
    </span>
  );
}
