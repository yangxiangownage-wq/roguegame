import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the real view timeline with lightweight DOM/layout stand-ins.
const source = readFileSync(new URL('../src/ui/BattleView.ts', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '');
const stubs = `const ICON_FRAC = 1; const battleLayout = () => ({scale: 1, foeX: 0, foeTop: 0, foeBottom: 0, heroX: 0, heroBottom: 0});`;
const { outputText } = ts.transpileModule(stubs + source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { BattleView } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const element = () => ({
  style: { setProperty(name, value) { this[name] = value; } }, classList: { toggle() {}, remove() {} },
  setAttribute() {}, isConnected: true, remove() { this.isConnected = false; },
});
function fixture(count, y, reduced = false) {
  const view = Object.create(BattleView.prototype);
  const cards = Array.from({ length: count }, (_, id) => ({ id }));
  Object.assign(view, {
    settings: { tileSize: 126, handCardY: 0, handCardScale: 100, handCardSpread: 100 },
    battle: { hand: cards, phase: 'player', endTurn() { this.hand = []; this.phase = 'enemy'; } },
    nodes: new Map(cards.map(card => [card.id, {
      card, element: element(), preview: element(), morph: 0, pose: { x: 600 + card.id * 90, y, angle: -8, scale: 1 },
      vx: 0, vy: 0, va: 0, vs: 0, state: 'hand', press: 0, release: 1, elapsed: 2, delay: 0, layer: 0,
    }])),
    departing: [], pileDialog: { hidden: true }, result: { hidden: true },
    intent: element(), guard: element(), turnCue: 'none', turnPause: 0,
    resultTimer: 0, noticeTimer: 0, reduced: { matches: reduced },
    hover: null, selected: null, drag: null, expanded: true,
    cancel() {}, sync() {}, message() {}, advanceTurnCue() { this.advanced = true; },
  });
  return view;
}
for (const fps of [30, 60, 144]) for (const y of [813, 990, 1230]) {
  const view = fixture(5, y);
  const nodes = [...view.nodes.values()];
  view.endTurn();
  assert(nodes.every(node => node.pose.y === y && node.origin.y === y), 'discard must not teleport tucked/hovered cards');
  assert(Math.abs(view.turnPause - 0.72) < 1e-9, 'enemy cue follows the final flight');
  view.update(1 / fps);
  assert(nodes[4].pose.x > nodes[4].origin.x, 'first departure moves on the next frame');
  for (let frame = 1; frame <= Math.floor(0.68 * fps); frame++) {
    for (const node of nodes) {
      if (node.element.isConnected) {
        assert(Number(node.element.style.opacity) >= -1e-9 && Number(node.element.style.opacity) <= 1, 'bounded fade');
      }
    }
    view.update(1 / fps);
  }
  assert(nodes.every(node => !node.element.isConnected), 'all cards finish without a spring-settle tail');
  assert(!view.advanced, 'enemy action waits for departures');
  view.update(0.1);
  assert(view.advanced);
}
const reduced = fixture(5, 860, true);
reduced.endTurn();
reduced.update(1 / 60);
assert.equal(reduced.nodes.size, 0, 'reduced motion skips all flights and stagger delays');
const empty = fixture(0, 860);
empty.endTurn();
assert.equal(empty.turnPause, 0.08, 'empty hands do not wait for nonexistent flights');
console.log('Discard animation passed: 30/60/144 FPS, hovered/tucking/collapsed origins, immediate departure, completion/cue timing, reduced motion and empty hands.');

// The same real update loop must restore the card after an piece preview drag and clean up both visuals.
for (const fps of [30, 60, 144]) {
  const view = fixture(1, 860);
  const node = view.nodes.get(0);
  let reveals = 0;
  view.board = { hasPiece: () => false, revealPlacedPiece(col, row) { assert.deepEqual([col, row], [2, 2]); reveals++; } };
  view.target = null;
  view.drag = { id: 0, moved: true, condensed: true, x: 800, y: 500 };
  for (let i = 0; i < fps / 2; i++) view.update(1 / fps);
  assert(node.morph > 0.99 && Number(node.element.style.opacity) < 0.01, 'aiming hides the obstructing card');
  assert(Number(node.preview.style.opacity) > 0.99, 'piece preview replaces the card');
  assert(Math.abs(node.pose.y - 444) < 1, 'piece preview stays above the pointer');
  view.drag.condensed = false;
  for (let i = 0; i < fps / 2; i++) view.update(1 / fps);
  assert(node.morph < 0.01 && Number(node.element.style.opacity) > 0.99, 'returning to hand restores the card');
  assert(Number(node.preview.style.opacity) < 0.01, 'returning leaves no piece preview');
  view.drag.condensed = true;
  for (let i = 0; i < fps / 2; i++) view.update(1 / fps);
  view.drag = null;
  node.state = 'play'; node.origin = { ...node.pose }; node.destination = { x: 810, y: 520, size: 126, col: 2, row: 2 }; node.elapsed = 0;
  for (let i = 0; i < Math.ceil(0.34 * fps); i++) view.update(1 / fps);
  assert(Math.abs(node.pose.x - 810) < 0.01 && Math.abs(node.pose.y - 520) < 0.01, 'piece preview lands at the reserved cell center');
  for (let i = 0; i < fps / 3; i++) view.update(1 / fps);
  assert(!node.element.isConnected && !node.preview.isConnected, 'landing removes both visuals');
  assert.equal(reveals, 1, 'board takes over the exact sprite once at landing');
  assert.equal(node.preview.style.width, '126px', 'held sprite matches the final cell size');
}
{
  const view = fixture(1, 860);
  const node = view.nodes.get(0);
  Object.assign(view, {
    selected: 0, target: null, placementTarget: { hidden: true },
    point: e => e, setExpanded(value) { this.expanded = value; },
    previewTarget() {}, board: { setDropHighlight() {}, setMinePreview() {} },
    drag: { id: 0, pointer: 1, moved: false, condensed: false, startX: 600, startY: 860, x: 600, y: 860 },
  });
  for (const [x, condensed] of [[661, true], [640, true], [631, false], [640, false]]) {
    view.pointerMove({ x, y: 860, pointerId: 1 });
    assert.equal(view.drag.condensed, condensed, 'hysteresis prevents boundary flicker');
    assert.equal(view.expanded, !condensed);
  }
  view.root = element(); node.element.hasPointerCapture = () => false;
  view.cancel = BattleView.prototype.cancel;
  view.canDrop = () => { throw new Error('return to hand must never play through to board'); };
  view.pointerUp({ x: 640, y: 860, pointerId: 1 });
  assert.equal(view.drag, null);
  assert.equal(view.selected, null);
  assert(view.expanded);
}
console.log('Piece placement passed: card/piece preview morph, reversible return, offset aim, exact landing, visual cleanup and pickup-boundary cancellation.');

// Transformation has an observable source-first phase, not two simultaneous fades.
for (const fps of [30, 60, 144]) {
  const view = fixture(1, 860);
  const node = view.nodes.get(0);
  view.target = null;
  view.drag = { id: 0, moved: true, condensed: true, x: 800, y: 500 };
  view.update(1 / fps);
  assert.equal(Number(node.element.style.opacity), 1, 'original card remains visible when charging starts');
  assert.equal(Number(node.preview.style.opacity), 0, 'piece cannot appear before the source charges');
  assert(Number(node.element.style['--morph-charge']) > 0, 'charge belongs to the original illustration');
  let elapsed = 1 / fps;
  while (elapsed < 0.25) { view.update(1 / fps); elapsed += 1 / fps; }
  assert(Number(node.preview.style.opacity) > 0, 'piece emerges during extraction');
  assert.equal(Number(node.element.style['--morph-art']), 0, 'old artwork is gone before the new sprite appears');
  view.drag.condensed = false;
  const progress = node.morph;
  view.update(1 / fps);
  assert(node.morph > 0 && node.morph < progress, 'cancellation reverses from current progress');
}
{
  const view = fixture(1, 860, true);
  view.target = null;
  view.drag = { id: 0, moved: true, condensed: true, x: 800, y: 500 };
  view.update(1 / 60);
  const node = view.nodes.get(0);
  assert.equal(node.morph, 1);
  assert.equal(Number(node.preview.style.opacity), 1);
  assert.equal(Number(node.element.style.opacity), 0);
}
console.log('Card transmutation passed: source-first charge, continuous image handoff, mid-transition reversal, reduced motion.');

for (const fps of [30, 60, 144]) {
  const view = fixture(1, 860);
  const node = view.nodes.get(0);
  view.target = null;
  view.drag = { id: 0, moved: true, condensed: true, x: 800, y: 500 };
  for (const forward of [true, false]) {
    view.drag.condensed = forward;
    for (let i = 0; i < Math.ceil(fps * 0.4); i++) {
      view.update(1 / fps);
      const oldArt = Number(node.element.style['--morph-art']);
      const newArt = Number(node.preview.style['--piece-reveal']) * Number(node.preview.style.opacity);
      assert(oldArt === 0 || newArt === 0, 'recognizable images never overlap, even in reverse');
      if (newArt > 0) assert.equal(Number(node.element.style['--morph-shell']), 0, 'no card frame remains behind the piece');
      if (oldArt === 0 && newArt === 0 && node.morph > 0 && node.morph < 1) {
        assert(Number(node.preview.style['--gather-glow']) > 0.9, 'bright point bridges the image handoff');
      }
    }
  }
}
console.log('No-overlap handoff passed in both directions at 30/60/144 FPS.');
