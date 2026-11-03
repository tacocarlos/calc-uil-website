import {
  evaluate, formatResult, CalcError, FRACTION, POWER, isTemplateToken, type AngleMode,
} from './evaluate.js';
import type { KeyPress } from './keypad.js';
import { Store } from './store.js';

// Operators that auto-insert "Ans" when typed on an empty line, like the TI.
const ANS_OPERATORS = new Set(['+', '−', '×', '÷', '^', '²', '⁻¹']);
const MAX_HISTORY = 30;

export interface HistoryItem {
  /** Unique per screen; use it as a list key. */
  id: number;
  /** The entry as plain text; fractions as (n)/(d). Render `tokens` to show them stacked. */
  input: string;
  output: string;
  error?: boolean;
  /** The entry as typed, for rendering and recall. */
  tokens: readonly string[];
}

/** Where an n/d template sits in a token list: indexes of its start, bar and end tokens. */
export interface FractionSpan {
  start: number;
  bar: number;
  end: number;
}

/** Where a template sits in a token list. */
export type TemplateSpan =
  | ({ kind: 'fraction' } & FractionSpan)
  | { kind: 'power'; start: number; end: number };

/** Every template (n/d and exponent) in `tokens`, ordered by start. Nested templates are included. */
export function findTemplates(tokens: readonly string[]): TemplateSpan[] {
  const spans: TemplateSpan[] = [];
  const open: { kind: 'fraction' | 'power'; start: number; bar: number }[] = [];
  tokens.forEach((t, i) => {
    if (t === FRACTION.start) open.push({ kind: 'fraction', start: i, bar: -1 });
    else if (t === POWER.start) open.push({ kind: 'power', start: i, bar: -1 });
    else if (t === FRACTION.bar && open.length) open[open.length - 1]!.bar = i;
    else if (t === FRACTION.end || t === POWER.end) {
      const span = open.pop();
      if (!span) return;
      spans.push(
        span.kind === 'fraction'
          ? { kind: 'fraction', start: span.start, bar: span.bar, end: i }
          : { kind: 'power', start: span.start, end: i },
      );
    }
  });
  return spans.sort((a, b) => a.start - b.start);
}

/** Every n/d template in `tokens`, ordered by start. Nested templates are included. */
export function findFractions(tokens: readonly string[]): FractionSpan[] {
  return findTemplates(tokens).flatMap((t) => (t.kind === 'fraction' ? [{ start: t.start, bar: t.bar, end: t.end }] : []));
}

/** The innermost template (n/d or exponent) the cursor is inside. */
export function templateAtCursor(tokens: readonly string[], cursor: number): TemplateSpan | null {
  let found: TemplateSpan | null = null;
  for (const span of findTemplates(tokens)) {
    if (span.start < cursor && cursor <= span.end) found = span; // later starts are more deeply nested
  }
  return found;
}

const isEmptyTemplate = (t: TemplateSpan): boolean =>
  t.kind === 'fraction' ? t.bar === t.start + 1 && t.end === t.bar + 1 : t.end === t.start + 1;

/** The innermost fraction the cursor is inside, and whether it's in the numerator or denominator. */
export function fractionAtCursor(
  tokens: readonly string[],
  cursor: number,
): { span: FractionSpan; part: 'numerator' | 'denominator' } | null {
  let found: FractionSpan | null = null;
  for (const span of findFractions(tokens)) {
    if (span.start < cursor && cursor <= span.end) found = span; // later starts are more deeply nested
  }
  if (!found) return null;
  return { span: found, part: cursor <= found.bar ? 'numerator' : 'denominator' };
}

const TEMPLATE_TEXT: Readonly<Record<string, string>> = {
  [FRACTION.start]: '(',
  [FRACTION.bar]: ')/(',
  [FRACTION.end]: ')',
  [POWER.start]: '^(',
  [POWER.end]: ')',
};

/** Plain-text form of an entry: fractions as (n)/(d), exponents as ^(k). */
export function tokensToText(tokens: readonly string[]): string {
  return tokens.map((t) => TEMPLATE_TEXT[t] ?? t).join('');
}

export interface HomeScreenState {
  /** Entry line as whole TI tokens ("sin(", "7", "ᴇ"), so DEL removes "sin(" at once. */
  tokens: readonly string[];
  cursor: number;
  history: readonly HistoryItem[];
  ans: number;
  mode: AngleMode;
  insertMode: boolean;
}

export interface ResultEvent {
  tokens: readonly string[];
  value: number;
  text: string;
}

interface HomeScreenEvents {
  result: ResultEvent;
  error: { message: string };
}

/** TI-84 home screen: an editable entry line plus history. */
export class HomeScreen extends Store<HomeScreenState, HomeScreenEvents> {
  #lastEntry: readonly string[] = [];
  #nextHistoryId = 0;
  #recallIndex = -1;

  constructor() {
    super({ tokens: [], cursor: 0, history: [], ans: 0, mode: 'radian', insertMode: false });
  }

  /**
   * Apply a keypad press. Returns false for presses the home screen doesn't
   * handle (menus, unsupported 2nd/alpha functions, [on]) so callers can react.
   */
  handle(press: KeyPress): boolean {
    const { action } = press;
    if (press.id === '2nd' || press.id === 'alpha') return true; // tracked by Keypad
    if (action.type === 'insert') {
      this.insert(action.text);
      return true;
    }
    if (action.type === 'command') return this.command(action.name);
    return false;
  }

  insert(text: string): void {
    const s = this.getSnapshot();
    const tokens = [...s.tokens];
    let cursor = s.cursor;

    if (tokens.length === 0 && ANS_OPERATORS.has(text)) {
      tokens.push('Ans');
      cursor = 1;
    }
    // TI default is overwrite, but never over part of a template.
    if (s.insertMode || cursor >= tokens.length || isTemplateToken(tokens[cursor])) {
      tokens.splice(cursor, 0, text);
    } else {
      tokens[cursor] = text;
    }
    this.setState({ tokens, cursor: cursor + 1 });
  }

  /** Returns false for unknown commands. */
  command(name: string): boolean {
    const s = this.getSnapshot();
    switch (name) {
      case 'enter':
        this.enter();
        return true;
      case 'clear':
        this.setState({ tokens: [], cursor: 0, ...(s.tokens.length === 0 && { history: [] }) });
        return true;
      case 'quit':
        this.setState({ tokens: [], cursor: 0 });
        return true;
      case 'fraction': {
        // n/d template; the cursor goes into the numerator.
        const tokens = [...s.tokens];
        tokens.splice(s.cursor, 0, FRACTION.start, FRACTION.bar, FRACTION.end);
        this.setState({ tokens, cursor: s.cursor + 1 });
        return true;
      }
      case 'exponent': {
        // Exponent template, like [^] in MathPrint; on an empty line it applies to Ans.
        const tokens = [...s.tokens];
        let cursor = s.cursor;
        if (tokens.length === 0) {
          tokens.push('Ans');
          cursor = 1;
        }
        tokens.splice(cursor, 0, POWER.start, POWER.end);
        this.setState({ tokens, cursor: cursor + 1 });
        return true;
      }
      case 'del': {
        const tokens = [...s.tokens];
        if (!tokens.length) return true;
        const target = Math.min(s.cursor, tokens.length - 1);
        let cursor = s.cursor < tokens.length ? s.cursor : tokens.length - 1;
        if (isTemplateToken(tokens[target])) {
          // A template is removed only once it's empty, like on the TI.
          const span = findTemplates(tokens).find(
            (t) => t.start === target || t.end === target || (t.kind === 'fraction' && t.bar === target),
          );
          if (!span || !isEmptyTemplate(span)) return true;
          tokens.splice(span.start, span.end - span.start + 1);
          cursor = span.start;
        } else {
          tokens.splice(target, 1);
        }
        this.setState({ tokens, cursor, insertMode: false });
        return true;
      }
      case 'ins':
        this.setState({ insertMode: !s.insertMode });
        return true;
      case 'left':
        this.setState({ cursor: Math.max(0, s.cursor - 1) });
        return true;
      case 'right':
        this.setState({ cursor: Math.min(s.tokens.length, s.cursor + 1) });
        return true;
      case 'up': {
        // From a denominator, ▲ goes back up to the numerator. Outside any
        // template it recalls the previous entry.
        const at = templateAtCursor(s.tokens, s.cursor);
        if (at?.kind === 'fraction' && s.cursor > at.bar) this.setState({ cursor: at.bar });
        else if (!at) this.#recall();
        return true;
      }
      case 'entry':
        this.#recall();
        return true;
      case 'down': {
        // From a numerator, ▼ goes down to the denominator; from an exponent,
        // back down to the baseline after it.
        const at = templateAtCursor(s.tokens, s.cursor);
        let cursor = s.tokens.length;
        if (at?.kind === 'fraction' && s.cursor <= at.bar) cursor = at.bar + 1;
        else if (at?.kind === 'power') cursor = at.end + 1;
        this.setState({ cursor });
        return true;
      }
      case 'mode':
        this.setMode(s.mode === 'radian' ? 'degree' : 'radian');
        return true;
      default:
        return false;
    }
  }

  setMode(mode: AngleMode): void {
    this.setState({ mode });
  }

  enter(): void {
    const s = this.getSnapshot();
    const tokens = s.tokens.length ? s.tokens : this.#lastEntry;
    if (!tokens.length) return;

    const input = tokensToText(tokens);
    this.#lastEntry = [...tokens];
    this.#recallIndex = -1;
    let item: HistoryItem;
    let ans = s.ans;
    let event: { type: 'result'; detail: ResultEvent } | { type: 'error'; detail: { message: string } };

    try {
      const value = evaluate(tokens, { ans: s.ans, mode: s.mode });
      const text = formatResult(value);
      ans = value;
      item = { id: this.#nextHistoryId++, input, output: text, tokens: [...tokens] };
      event = { type: 'result', detail: { tokens: [...tokens], value, text } };
    } catch (err) {
      const message = err instanceof CalcError ? `ERR:${err.message}` : 'ERR:SYNTAX';
      item = { id: this.#nextHistoryId++, input, output: message, error: true, tokens: [...tokens] };
      event = { type: 'error', detail: { message } };
    }

    this.setState({
      tokens: [],
      cursor: 0,
      insertMode: false,
      ans,
      history: [...s.history, item].slice(-MAX_HISTORY),
    });
    if (event.type === 'result') this.emit('result', event.detail);
    else this.emit('error', event.detail);
  }

  // 2nd ENTRY / ▲ cycles back through previous entries.
  #recall(): void {
    const entries = this.getSnapshot().history;
    if (!entries.length) return;
    this.#recallIndex = Math.min(this.#recallIndex + 1, entries.length - 1);
    const tokens = [...entries[entries.length - 1 - this.#recallIndex]!.tokens];
    this.setState({ tokens, cursor: tokens.length });
  }
}
