# @calc-uil/keypad

Use a TI-84 Plus CE as a USB keypad in the browser, plus a TI-style home screen and evaluator.
Works with no framework. React hooks are available from `@calc-uil/keypad/react`.

Needs Chrome or Edge (desktop or ChromeOS), served from `localhost` or HTTPS.
Web Serial handles the keypad, and WebUSB handles installing the program.

## Entry points

| Import | What's in it |
|---|---|
| `@calc-uil/keypad` | `Keypad`, `SerialCalculator`, `CalculatorInstaller`, `HomeScreen`, `evaluate`, `formatResult`, `bindKeyboard`, key data (`KEYS`, `LAYOUT_84CE`, `KEYBOARD_MAP`), practice problems (`newProblem`, `grade`, `threeSigFigs`), `createCalcKeypad` |
| `@calc-uil/keypad/react` | `CalcKeypadProvider` and hooks (all `'use client'`) |
| `@calc-uil/keypad/assets/ti84ce/*` | `KEYPAD.8xp` plus the CE C libraries it needs |

Nothing touches `window` or `navigator` at import time, so it's safe to import during server rendering.

## Next.js (App Router)

**1. Serve the calculator files.** The installer downloads them from `/calc-keypad/ti84ce/` by default:

```sh
mkdir -p public/calc-keypad && cp -R node_modules/@calc-uil/keypad/assets/ti84ce public/calc-keypad/
```

Or pass `installer={{ baseUrl: '/somewhere/else/' }}` to the provider.

**2. Mount the provider once**, for example in a layout. It's a client component, so it can go straight into a server layout:

```tsx
// app/practice/layout.tsx
import { CalcKeypadProvider } from '@calc-uil/keypad/react';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <CalcKeypadProvider>{children}</CalcKeypadProvider>;
}
```

**3. Use the hooks** in client components:

```tsx
'use client';
import {
  useCalculatorConnection,
  useCalculatorInstaller,
  useHomeScreen,
  useKeyButton,
  useKeyboardInput,
  useKeypad,
} from '@calc-uil/keypad/react';
import { KEYS, type KeyId } from '@calc-uil/keypad';

export function Practice() {
  const conn = useCalculatorConnection();
  const installer = useCalculatorInstaller();
  const { second } = useKeypad();
  const { tokens, history } = useHomeScreen({
    onResult: ({ value }) => console.log('student got', value),
    onUnhandled: (press) => console.log('not handled:', press.id),
  });
  useKeyboardInput(); // optional: computer keyboard as a keypad

  return (
    <>
      <button onClick={installer.install} disabled={!installer.supported || installer.status === 'installing'}>
        Install KEYPAD
      </button>
      {installer.message && <p>{installer.message}</p>}

      <button onClick={conn.state === 'connected' ? conn.disconnect : conn.connect} disabled={!conn.supported}>
        {conn.state === 'connected' ? `Disconnect ${conn.modelName}` : 'Connect calculator'}
      </button>

      {history.map((h, i) => <p key={i}>{h.input} = {h.output}</p>)}
      <p>{second && '[2nd] '}{tokens.join('')}</p>

      <Key id="7" />
    </>
  );
}

function Key({ id }: { id: KeyId }) {
  const { pressedBy, buttonProps } = useKeyButton(id);
  return (
    <button data-pressed-by={pressedBy} {...buttonProps}>
      {KEYS[id].label}
    </button>
  );
}
```

### Hooks

| Hook | Returns |
|---|---|
| `useCalculatorConnection()` | `{ supported, state, model, modelName, error, clearError(), connect(), disconnect() }`. `state` is `disconnected`, `connecting`, `no-handshake` (port open but KEYPAD isn't answering), or `connected`. |
| `useCalculatorInstaller()` | `{ supported, status, job, message, done, total, install(), installArtifice(stage), detectOsVersion(), reset() }`. Refuses while KEYPAD is connected. |
| `useKeypad()` | `{ second, alpha, held, keypad }`. `held` maps each held key id to its source. |
| `useKeyPress(handler)` | Calls `handler(press)` for every press from any source. |
| `useKeyButton(id, source?)` | `{ pressed, pressedBy, buttonProps }` for building an on-screen key. `pressedBy === 'calculator'` means the physical key is down. |
| `useKeyboardInput(enabled?, options?)` | Binds the computer keyboard while mounted. |
| `useHomeScreen(options?)` | `{ tokens, cursor, history, ans, mode, insertMode, screen }`. Each call gets its own screen. |
| `useSerialLines(handler)` | Raw protocol lines from the calculator, for debugging. |
| `useCalcKeypad()` | The underlying `{ keypad, serial, installer }` instances. |

`connect()` and `install()` open browser device pickers, so call them from a click handler.

## arTIfiCE (OS 5.5 and later)

TI's OS 5.5+ won't run C programs like KEYPAD without the [arTIfiCE](https://yvantt.github.io/arTIfiCE/) jailbreak.
Its release files are bundled in `assets/ti84ce/artifice/` (GPL-3.0, by YvanTT), and the installer can send them:

```ts
import { ARTIFICE_STEPS, artificeReleaseFor } from '@calc-uil/keypad';

artificeReleaseFor('5.8.5.0021');   // 'v3'  ('not-needed' ≤ 5.4, 'v2.1' for 5.5–5.8.4, 'unsupported' > 5.8.5)
ARTIFICE_STEPS.v3;                  // steps for the student; ones with `send` are done by the site
installer.installArtifice('v3-installer'); // then the student opens Inequalz…
installer.installArtifice('v3-trigger');   // …and the calculator installs AsmHook2 and reboots
```

v2.1 is one file (program `A`). v3 is sent in two stages around a RAM reset and the Inequalz app. The hook
`useCalculatorInstaller()` exposes `installArtifice(stage)`, and its state's `job` says which transfer is
running. `installer.detectOsVersion()` reads the OS version from the calculator (e.g. `"5.8.3"`), and
`FIND_OS_VERSION` tells students where to find it themselves. The Next app's setup window is
`apps/web/src/components/calc/artifice-setup.tsx`.

## MathPrint templates: n/d fractions and exponents

[alpha][X,T,θ,n] (or <kbd>f</kbd> on the computer keyboard) inserts MathPrint's n/d template, as on the
TI-84 Plus CE. On the entry line it's three tokens, `FRACTION.start`, `FRACTION.bar` and `FRACTION.end`,
around the numerator and denominator. Editing works like the TI:

- Typing goes into the numerator. ▼, or ▶ at the end of the numerator, moves to the denominator. ▶ at the end
  of the denominator leaves the fraction, and ▲ goes back up.
- Overwrite mode never types over the template, and DEL removes it only once it's empty.
- It evaluates as one value, so `2 n/d` multiplies and `(n/d)²` squares it. A function left open inside it
  closes at the template edge.

[^] works the same way: it opens an exponent template (`POWER.start`, `POWER.end`) that holds the whole
exponent and raises the operand right before it. ▶ at the end of the exponent, or ▼, returns to the baseline.
On an empty line it applies to Ans, so you get `Ans^□`.

To draw entries MathPrint-style, use `findTemplates(tokens)` and `templateAtCursor(tokens, cursor)`; see
`apps/web/src/components/calc/ti-entry.tsx`. `tokensToText(tokens)` gives a plain-text form, `(n)/(d)` and
`^(k)`. History items keep their `tokens` for this.

## Problems and LaTeX

`newProblem()` returns `{ expr, latex, answer, note? }`. The LaTeX and the answer both come from one
expression tree, so they always agree. Render `latex` with a read-only MathLive `<math-field>`; see
`apps/web/src/components/math-display.tsx`.

### The grammar generator

`newProblem()` draws from this grammar (`src/grammar.ts`):

```
OP   = + | - | * | /
P    = E | E OP P
E    = E OP E        (d < 4)
     | (E)^LIT       (d < 2)
     | LIT^E         (d < 2)
     | \frac{E}{E}   (d < 1)
     | F(E)
     | LIT           (added so expansion can stop)
LIT  = real numbers, e, pi
POS  = { x in LIT | x > 0 }
F    = TRIG(E) | ln(POS)
TRIG = sin | cos | tan | sin^-1 | cos^-1
```

- **`d` is global to each problem.** It's one counter, starting at 0, that goes up every time any E expands
  into a rule other than LIT. Expansion is depth-first, left to right, across all terms of P. After
  `maxExpansions` (default 6), E can only be LIT.
- **P follows normal order of operations:** `E₁ − E₂ × E₃` means `E₁ − (E₂ × E₃)`. `/` in OP renders as ÷;
  `\frac` is a separate rule.
- **Problems are regenerated** unless every subexpression is finite, no denominator is ~0, |answer| is
  between 10⁻⁶ and 10⁹, there are at least 3 operations, and keying it on the TI-84 (radian mode) gives the
  same answer. Problems with trig get `note: 'radians'`.

Customise it with `createGrammarGenerator(options)`:

```ts
import { createGrammarGenerator, seededRandom } from '@calc-uil/keypad';

const generate = createGrammarGenerator({
  random: seededRandom(2026),          // reproducible problem sets
  weights: { frac: 3, fn: 1 },         // relative odds of each E rule
  continueChance: 0.5, maxTerms: 4,    // how long P chains get
  maxExpansions: 6, minOperations: 3,
  literal: (random, positive) => …,    // your own LIT (positive = POS for ln)
  accept: (p) => Math.abs(p.answer) < 1e6,
});
const problem = generate();
```

Rules are named `binary`, `powLit`, `litPow`, `frac`, `fn` and `lit`, and their limits are in
`PRODUCTION_LIMITS`. `onProduction(rule, d)` reports every rule used, which helps when tuning.

### Building problems by hand

Build problems directly with the `expr` builders:

```ts
import { expr, problemFrom } from '@calc-uil/keypad';

const { frac, sci, sqrt, add, fn } = expr;
const problem = problemFrom(frac(sci(9.95, -6), add(sqrt(75.6), fn('ln', 4))));
problem.latex;  // \frac{9.95\times 10^{-6}}{\sqrt{75.6}+\ln\left(4\right)}
problem.answer; // exact value
```

Builders: `num`, `sci`, `pi`, `e`, `add`, `sub`, `mul`, `div` (inline ÷), `frac`, `pow`, `sqrt`, `exp` (eˣ),
`neg`, and `fn('ln' | 'log' | 'sin' | 'cos' | 'tan' | 'asin' | 'acos', x)`. Plain numbers are accepted
wherever an expression is. Parentheses are added automatically where precedence requires them. Exponents render at full size
(`^{\textstyle …}`, via the exported `superscript` helper) so they stay readable; inverse-trig `⁻¹` stays standard.
`expr.toLatex`, `expr.evaluateExpr` and `expr.toTiTokens` (the keystrokes a student would press; `\frac`
is keyed with the n/d template, powers with the exponent template) work on any tree. `threeSigFigsLatex(x)` formats an answer for display.

## Without a framework

```js
import { createCalcKeypad, HomeScreen, bindKeyboard } from '@calc-uil/keypad';

const { keypad, serial, installer, start } = createCalcKeypad();
const screen = new HomeScreen();
start();                                  // forward calculator keys, auto-reconnect
bindKeyboard(keypad);
keypad.on('press', (press) => screen.handle(press));
screen.subscribe(() => render(screen.getSnapshot()));
connectButton.onclick = () => serial.requestAndOpen();
installButton.onclick = () => installer.install();
```

Every stateful class has `subscribe(fn)` and `getSnapshot()` (immutable snapshots), plus typed `on(event, fn)`.
Both return an unsubscribe function. The demo in `/demo` uses this API.

## Development

```sh
npm run build      # tsc → dist/
npm test           # vitest: evaluator, keypad, serial protocol, installer, hooks, SSR
npm run typecheck
```
