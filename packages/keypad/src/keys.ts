// Canonical key ids shared by every input source (physical calculator,
// on-screen keypad, computer keyboard). The calculator programs in /calc
// send these exact ids over USB, e.g. "D sin".

export type KeyAction =
  | { type: 'insert'; text: string }
  | { type: 'command'; name: string }
  | { type: 'menu'; name: string }
  | { type: 'unsupported'; name: string };

export type KeyKind = 'fn' | 'second' | 'alpha' | 'dark' | 'num' | 'op' | 'arrow';

export interface KeyDefinition {
  /** Printed on the key face. */
  label: string;
  /** Printed above the key in blue (2nd function). */
  second?: string;
  /** Printed above the key in green (alpha function). */
  alpha?: string;
  kind: KeyKind;
  action: KeyAction;
  secondAction?: KeyAction;
  /** What [alpha] + this key does, when it isn't printed on the key (e.g. the n/d template). */
  alphaAction?: KeyAction;
}

const ins = (text: string): KeyAction => ({ type: 'insert', text });
const cmd = (name: string): KeyAction => ({ type: 'command', name });
const menu = (name: string): KeyAction => ({ type: 'menu', name });

/**
 * label/second/alpha are what's printed on the TI-84 Plus CE key.
 * action/secondAction are what the practice site does with the key.
 */
export const KEYS = {
  yequ:   { label: 'y=',     second: 'stat plot', alpha: 'f1', kind: 'fn',    action: menu('Y=') },
  window: { label: 'window', second: 'tblset',    alpha: 'f2', kind: 'fn',    action: menu('WINDOW') },
  zoom:   { label: 'zoom',   second: 'format',    alpha: 'f3', kind: 'fn',    action: menu('ZOOM') },
  trace:  { label: 'trace',  second: 'calc',      alpha: 'f4', kind: 'fn',    action: menu('TRACE') },
  graph:  { label: 'graph',  second: 'table',     alpha: 'f5', kind: 'fn',    action: menu('GRAPH') },

  '2nd':  { label: '2nd',                                     kind: 'second', action: cmd('2nd') },
  mode:   { label: 'mode',   second: 'quit',                  kind: 'dark',   action: cmd('mode'), secondAction: cmd('quit') },
  del:    { label: 'del',    second: 'ins',                   kind: 'dark',   action: cmd('del'),  secondAction: cmd('ins') },

  alpha:  { label: 'alpha',  second: 'A-lock',                kind: 'alpha',  action: cmd('alpha') },
  // [alpha][X,T,θ,n] is the n/d fraction template shortcut.
  xton:   { label: 'X,T,θ,n', second: 'link',                 kind: 'dark',   action: ins('X'), alphaAction: cmd('fraction') },
  stat:   { label: 'stat',   second: 'list',                  kind: 'dark',   action: menu('STAT') },

  math:   { label: 'math',   second: 'test',   alpha: 'A',    kind: 'dark',   action: menu('MATH') },
  apps:   { label: 'apps',   second: 'angle',  alpha: 'B',    kind: 'dark',   action: menu('APPS') },
  prgm:   { label: 'prgm',   second: 'draw',   alpha: 'C',    kind: 'dark',   action: menu('PRGM') },
  vars:   { label: 'vars',   second: 'distr',                 kind: 'dark',   action: menu('VARS') },
  clear:  { label: 'clear',                                   kind: 'dark',   action: cmd('clear') },

  recip:  { label: 'x⁻¹',    second: 'matrix', alpha: 'D',    kind: 'dark',   action: ins('⁻¹') },
  sin:    { label: 'sin',    second: 'sin⁻¹',  alpha: 'E',    kind: 'dark',   action: ins('sin('), secondAction: ins('sin⁻¹(') },
  cos:    { label: 'cos',    second: 'cos⁻¹',  alpha: 'F',    kind: 'dark',   action: ins('cos('), secondAction: ins('cos⁻¹(') },
  tan:    { label: 'tan',    second: 'tan⁻¹',  alpha: 'G',    kind: 'dark',   action: ins('tan('), secondAction: ins('tan⁻¹(') },
  // [^] opens the MathPrint exponent template.
  power:  { label: '^',      second: 'π',      alpha: 'H',    kind: 'dark',   action: cmd('exponent'), secondAction: ins('π') },

  square: { label: 'x²',     second: '√',      alpha: 'I',    kind: 'dark',   action: ins('²'),    secondAction: ins('√(') },
  comma:  { label: ',',      second: 'EE',     alpha: 'J',    kind: 'dark',   action: ins(','),    secondAction: ins('ᴇ') },
  lparen: { label: '(',      second: '{',      alpha: 'K',    kind: 'dark',   action: ins('(') },
  rparen: { label: ')',      second: '}',      alpha: 'L',    kind: 'dark',   action: ins(')') },
  div:    { label: '÷',      second: 'e',      alpha: 'M',    kind: 'op',     action: ins('÷'),    secondAction: ins('e') },

  log:    { label: 'log',    second: '10ˣ',    alpha: 'N',    kind: 'dark',   action: ins('log('), secondAction: ins('10^(') },
  '7':      { label: '7',      second: 'u',      alpha: 'O',    kind: 'num',    action: ins('7') },
  '8':      { label: '8',      second: 'v',      alpha: 'P',    kind: 'num',    action: ins('8') },
  '9':      { label: '9',      second: 'w',      alpha: 'Q',    kind: 'num',    action: ins('9') },
  mul:    { label: '×',      second: '[',      alpha: 'R',    kind: 'op',     action: ins('×') },

  ln:     { label: 'ln',     second: 'eˣ',     alpha: 'S',    kind: 'dark',   action: ins('ln('),  secondAction: ins('e^(') },
  '4':      { label: '4',      second: 'L4',     alpha: 'T',    kind: 'num',    action: ins('4') },
  '5':      { label: '5',      second: 'L5',     alpha: 'U',    kind: 'num',    action: ins('5') },
  '6':      { label: '6',      second: 'L6',     alpha: 'V',    kind: 'num',    action: ins('6') },
  sub:    { label: '−',      second: ']',      alpha: 'W',    kind: 'op',     action: ins('−') },

  sto:    { label: 'sto→',   second: 'rcl',    alpha: 'X',    kind: 'dark',   action: menu('STO→') },
  '1':      { label: '1',      second: 'L1',     alpha: 'Y',    kind: 'num',    action: ins('1') },
  '2':      { label: '2',      second: 'L2',     alpha: 'Z',    kind: 'num',    action: ins('2') },
  '3':      { label: '3',      second: 'L3',     alpha: 'θ',    kind: 'num',    action: ins('3') },
  add:    { label: '+',      second: 'mem',    alpha: '"',    kind: 'op',     action: ins('+') },

  on:     { label: 'on',     second: 'off',                   kind: 'dark',   action: cmd('on') },
  '0':      { label: '0',      second: 'catalog', alpha: '␣',   kind: 'num',    action: ins('0') },
  dot:    { label: '.',      second: 'i',      alpha: ':',    kind: 'num',    action: ins('.') },
  chs:    { label: '(−)',    second: 'ans',    alpha: '?',    kind: 'num',    action: ins('⁻'),    secondAction: ins('Ans') },
  enter:  { label: 'enter',  second: 'entry',  alpha: 'solve', kind: 'op',    action: cmd('enter'), secondAction: cmd('entry') },

  up:     { label: '▲', kind: 'arrow', action: cmd('up') },
  down:   { label: '▼', kind: 'arrow', action: cmd('down') },
  left:   { label: '◀', kind: 'arrow', action: cmd('left') },
  right:  { label: '▶', kind: 'arrow', action: cmd('right') },
} satisfies Record<string, KeyDefinition>;

export type KeyId = keyof typeof KEYS;

export const isKeyId = (id: string): id is KeyId => Object.hasOwn(KEYS, id);

/** Look up a key definition by id. */
export const getKey = (id: KeyId): KeyDefinition => KEYS[id];

// Keys that auto-repeat while held, like on the real calculator.
export const REPEATING_KEYS: ReadonlySet<KeyId> = new Set<KeyId>(['up', 'down', 'left', 'right', 'del']);

// Visual layout of the TI-84 Plus CE keypad, top to bottom.
// Rows 2–3 leave room for the arrow pad on the right.
export const LAYOUT_84CE = {
  top: ['yequ', 'window', 'zoom', 'trace', 'graph'],
  upper: [['2nd', 'mode', 'del'], ['alpha', 'xton', 'stat']],
  arrows: ['up', 'left', 'right', 'down'],
  grid: [
    ['math', 'apps', 'prgm', 'vars', 'clear'],
    ['recip', 'sin', 'cos', 'tan', 'power'],
    ['square', 'comma', 'lparen', 'rparen', 'div'],
    ['log', '7', '8', '9', 'mul'],
    ['ln', '4', '5', '6', 'sub'],
    ['sto', '1', '2', '3', 'add'],
    ['on', '0', 'dot', 'chs', 'enter'],
  ],
} as const satisfies {
  top: readonly KeyId[];
  upper: readonly (readonly KeyId[])[];
  arrows: readonly KeyId[];
  grid: readonly (readonly KeyId[])[];
};

/** Keyboard mapping value: a key id, or [modifier, key] to press 2nd or alpha first. */
export type KeyboardBinding = KeyId | readonly ['2nd' | 'alpha', KeyId];

// Computer keyboard (KeyboardEvent.key) → calculator key, for use without hardware.
export const KEYBOARD_MAP: Readonly<Record<string, KeyboardBinding>> = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'dot', '+': 'add', '-': 'sub', '*': 'mul', '/': 'div',
  '^': 'power', '(': 'lparen', ')': 'rparen', ',': 'comma',
  Enter: 'enter', Backspace: 'del', Escape: 'clear', Delete: 'clear',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  s: 'sin', c: 'cos', t: 'tan', l: 'ln', g: 'log', q: 'square', i: 'recip',
  n: 'chs', '~': 'chs', m: 'mode', '`': '2nd',
  f: ['alpha', 'xton'], // n/d fraction template
  p: ['2nd', 'power'], r: ['2nd', 'square'], e: ['2nd', 'div'],
  E: ['2nd', 'comma'], a: ['2nd', 'chs'],
};
