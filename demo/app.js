// Vanilla-JS demo of @calc-uil/keypad (no framework). Run `npm run build` first.
import {
  FRACTION,
  POWER,
  KEYS,
  LAYOUT_84CE,
  MODEL_NAMES,
  CalculatorInstaller,
  HomeScreen,
  SerialCalculator,
  bindKeyboard,
  createCalcKeypad,
  grade,
  newProblem,
  threeSigFigs,
} from '../packages/keypad/dist/index.js';
import { MathfieldElement } from '../node_modules/mathlive/mathlive.min.mjs';

MathfieldElement.soundsDirectory = null;

const $ = (id) => document.getElementById(id);

const SOURCE_LABELS = { calculator: 'Calculator', screen: 'On-screen', keyboard: 'Keyboard' };

const { keypad, serial, installer, start } = createCalcKeypad({
  installer: { baseUrl: '../packages/keypad/assets/ti84ce/' },
});
const screen = new HomeScreen();

// ---------- On-screen keypad ----------

const keyElements = new Map();

function makeKey(id) {
  const key = KEYS[id];
  const el = document.createElement('button');
  el.className = `key key-${key.kind}`;
  el.dataset.key = id;
  el.type = 'button';
  el.tabIndex = -1; // keyboard input goes through bindKeyboard, not focus
  el.setAttribute('aria-label', key.label);

  if (key.kind !== 'arrow') {
    const labels = document.createElement('span');
    labels.className = 'key-labels';
    labels.innerHTML =
      `<span class="lbl-second">${key.second ?? ''}</span>` +
      `<span class="lbl-alpha">${key.alpha ?? ''}</span>`;
    el.append(labels);
  }
  const face = document.createElement('span');
  face.className = 'key-face';
  face.textContent = key.label;
  el.append(face);

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    keypad.keyDown(id, 'screen');
  });
  const release = () => keypad.keyUp(id, 'screen');
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);

  keyElements.set(id, el);
  return el;
}

function buildKeypad() {
  const root = $('keypad');

  const top = document.createElement('div');
  top.className = 'row row-top';
  LAYOUT_84CE.top.forEach((id) => top.append(makeKey(id)));

  const upper = document.createElement('div');
  upper.className = 'upper';
  const upperKeys = document.createElement('div');
  upperKeys.className = 'upper-keys';
  LAYOUT_84CE.upper.flat().forEach((id) => upperKeys.append(makeKey(id)));
  const arrows = document.createElement('div');
  arrows.className = 'arrows';
  LAYOUT_84CE.arrows.forEach((id) => arrows.append(makeKey(id)));
  upper.append(upperKeys, arrows);

  const grid = document.createElement('div');
  grid.className = 'grid';
  LAYOUT_84CE.grid.flat().forEach((id) => grid.append(makeKey(id)));

  root.append(top, upper, grid);
}

// ---------- Physical calculator over USB ----------

const STATUS_TEXT = {
  disconnected: 'No calculator',
  connecting: 'Connecting…',
  'no-handshake': 'Waiting for KEYPAD…',
  connected: 'Calculator connected',
};

serial.subscribe(() => {
  const { state, model } = serial.getSnapshot();
  const pill = $('conn-status');
  pill.dataset.state = state;
  pill.textContent = state === 'connected' && model ? `${MODEL_NAMES[model] ?? model} connected` : STATUS_TEXT[state];
  $('connect-btn').textContent = state === 'connected' ? 'Disconnect' : 'Connect calculator';
  $('no-handshake').hidden = state !== 'no-handshake';
  $('calc').classList.toggle('linked', state === 'connected');
  if (state === 'connected') toast('Calculator connected. Start typing on it!');
});

serial.on('line', ({ text }) => {
  if ($('raw-toggle').checked) logLine(`<span class="raw">⇠ ${escapeHtml(text)}</span>`);
});

$('connect-btn').addEventListener('click', async () => {
  if (serial.port) {
    await serial.close();
    return;
  }
  try {
    await serial.requestAndOpen();
  } catch (err) {
    if (err.name !== 'NotFoundError') toast(`Couldn’t open the calculator: ${err.message}`);
  }
});

// ---------- Installing KEYPAD over WebUSB ----------

installer.subscribe(() => {
  const { status, message, done, total } = installer.getSnapshot();
  const banner = $('install-status');
  banner.hidden = status === 'idle';
  banner.className = status === 'error' ? 'banner warn' : 'banner';
  banner.textContent =
    status === 'error' ? `Install failed: ${message}` :
    status === 'installing' && total ? `${message} (${done}/${total})` : message ?? '';
  $('install-btn').disabled = status === 'installing';
});

$('install-btn').addEventListener('click', () => installer.install());

// ---------- Key → action routing ----------

keypad.on('keystate', ({ id, down, source }) => {
  const el = keyElements.get(id);
  if (!el) return;
  el.classList.toggle('pressed', down);
  if (down) el.dataset.source = source;
});

keypad.subscribe(renderScreen);

keypad.on('press', (press) => {
  const { id, layer, action, source, repeat } = press;
  if (!repeat) logPress(id, layer, action, source);

  if (screen.handle(press)) {
    if (action.type === 'command' && action.name === 'mode') {
      toast(`Angle mode: ${screen.getSnapshot().mode.toUpperCase()}`);
    }
    return;
  }
  if (action.type === 'menu') toast(`The ${action.name} menu isn’t part of this demo yet.`);
  else if (action.type === 'unsupported') toast(`${layer === 'alpha' ? 'alpha' : '2nd'} ${action.name} isn’t used in practice mode.`);
  else if (id === 'on') toast('On the real calculator, [on] exits keypad mode.');
});

// ---------- Home screen rendering ----------

screen.subscribe(renderScreen);

function renderScreen() {
  const s = screen.getSnapshot();
  const { second, alpha } = keypad.getSnapshot();
  $('lcd-mode').textContent = s.mode.toUpperCase();
  $('lcd-mod').textContent = second ? '2ND' : alpha ? 'ALPHA' : '';
  $('lcd-mod').className = `lcd-mod ${second ? 'second' : alpha ? 'alpha' : ''}`;

  const body = $('lcd-body');
  body.replaceChildren();

  for (const item of s.history) {
    const input = document.createElement('div');
    input.className = 'lcd-line';
    input.textContent = item.tokens.map(displayToken).join('');
    const output = document.createElement('div');
    output.className = `lcd-line lcd-out${item.error ? ' lcd-err' : ''}`;
    output.textContent = item.output;
    body.append(input, output);
  }

  const entry = document.createElement('div');
  entry.className = 'lcd-line lcd-entry';
  s.tokens.forEach((tok, i) => {
    const text = displayToken(tok);
    entry.append(i === s.cursor ? cursorEl(text, s.insertMode) : document.createTextNode(text));
  });
  if (s.cursor >= s.tokens.length) entry.append(cursorEl(null, s.insertMode));
  body.append(entry);
  body.scrollTop = body.scrollHeight;
}

// This demo shows templates in a line, as (1⁄4) and 2^(3); the Next app draws them MathPrint-style.
const TEMPLATE_TEXT = {
  [FRACTION.start]: '(', [FRACTION.bar]: '⁄', [FRACTION.end]: ')',
  [POWER.start]: '^(', [POWER.end]: ')',
};
const displayToken = (tok) => TEMPLATE_TEXT[tok] ?? tok;

function cursorEl(token, insertMode) {
  const el = document.createElement('span');
  el.className = 'cursor';
  if (keypad.second) { el.classList.add('cursor-mod'); el.textContent = '↑'; }
  else if (keypad.alpha) { el.classList.add('cursor-mod'); el.textContent = 'A'; }
  else if (insertMode) { el.classList.add('cursor-ins'); el.textContent = token ?? ' '; }
  else el.textContent = token ?? ' ';
  return el;
}

// ---------- Practice problems ----------

const practice = { problem: null, number: 0, solved: 0, start: 0, done: false, timer: null, advance: null };

// After a correct answer, show a green checkmark briefly, then move on.
const ADVANCE_MS = 1500;

function advanceAfterCorrect() {
  const check = document.createElement('span');
  check.className = 'correct-check';
  check.setAttribute('role', 'img');
  check.setAttribute('aria-label', 'Correct');
  check.textContent = '✔';
  $('problem').append(check);
  practice.advance = setTimeout(nextProblem, ADVANCE_MS);
}

function nextProblem() {
  clearTimeout(practice.advance);
  practice.problem = newProblem();
  practice.number++;
  practice.done = false;
  practice.start = performance.now();
  $('problem-number').textContent = practice.number;
  $('problem').replaceChildren(mathField(practice.problem.latex));
  if (practice.problem.note) {
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = practice.problem.note;
    $('problem').append(note);
  }
  $('feedback').className = 'feedback';
  $('feedback').innerHTML = 'Key the expression in on your calculator and press <kbd>enter</kbd>. Write your answer as X.YZ × 10<sup>k</sup>.';
  $('next-btn').hidden = true;
  $('skip-btn').hidden = false;
  clearInterval(practice.timer);
  practice.timer = setInterval(updateTimer, 100);
  updateTimer();
}

/** Read-only MathLive field showing `latex`. */
function mathField(latex) {
  const mf = new MathfieldElement();
  mf.readOnly = true;
  mf.menuItems = [];
  mf.value = latex;
  return mf;
}

function updateTimer() {
  $('timer').textContent = `${((performance.now() - practice.start) / 1000).toFixed(1)}s`;
}

function finishProblem(className, html) {
  practice.done = true;
  clearInterval(practice.timer);
  $('feedback').className = `feedback ${className}`;
  $('feedback').innerHTML = html;
  $('next-btn').hidden = false;
  $('skip-btn').hidden = true;
}

screen.on('result', ({ value }) => {
  if (practice.done) return;
  const answer = practice.problem.answer;
  const result = grade(value, answer);
  const secs = ((performance.now() - practice.start) / 1000).toFixed(1);

  if (result === 'exact') {
    practice.solved++;
    $('solved-count').textContent = practice.solved;
    finishProblem('correct', `✔ Correct in ${secs}s. Write it as <strong>${threeSigFigs(answer)}</strong>. Next problem coming up…`);
    advanceAfterCorrect();
  } else if (result === 'sigfigs') {
    practice.solved++;
    $('solved-count').textContent = practice.solved;
    finishProblem('close', `✔ Good to 3 significant digits (<strong>${threeSigFigs(answer)}</strong>), but not exact. Rounded an intermediate value? Next problem coming up…`);
    advanceAfterCorrect();
  } else {
    $('feedback').className = 'feedback wrong';
    $('feedback').innerHTML = `✘ ${threeSigFigs(value)} isn’t it. Check your parentheses and try again.`;
  }
});

$('skip-btn').addEventListener('click', () => {
  finishProblem('skipped', `Answer: <strong>${threeSigFigs(practice.problem.answer)}</strong>`);
});
$('next-btn').addEventListener('click', nextProblem);

// ---------- Event log & toast ----------

const MAX_LOG = 40;

function logPress(id, layer, action, source) {
  const key = KEYS[id];
  const keyName = layer === 'second' ? `2nd ${key.second ?? key.label}` : layer === 'alpha' ? `alpha ${key.alpha ?? key.label}` : key.label;
  const did =
    action.type === 'insert' ? `inserts <code>${escapeHtml(action.text)}</code>` :
    action.type === 'command' ? action.name :
    action.type === 'menu' ? `${action.name} menu` : 'not used';
  logLine(
    `<span class="src src-${source}">${SOURCE_LABELS[source] ?? source}</span>` +
    `<span class="keyname">[${escapeHtml(keyName)}]</span><span class="did">${did}</span>`
  );
}

function logLine(html) {
  const li = document.createElement('li');
  li.innerHTML = html;
  const log = $('log');
  log.prepend(li);
  while (log.children.length > MAX_LOG) log.lastChild.remove();
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// ---------- Start ----------

buildKeypad();
renderScreen();
nextProblem();
start();
bindKeyboard(keypad);

if (!SerialCalculator.supported) {
  $('serial-unsupported').hidden = false;
  $('connect-btn').disabled = true;
}
if (!CalculatorInstaller.supported) {
  $('install-btn').disabled = true;
  $('install-btn').title = 'Installing needs WebUSB (Chrome or Edge).';
}
