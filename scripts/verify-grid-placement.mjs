import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64');
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const design = url(read('../src/config/design.ts'));
const board = url(read('../src/config/board.ts').replace('@/config/design', design));
const layout = url(read('../src/config/battleLayout.ts').replace('./board', board));
const { battleLayout, boardTarget } = await import(layout);
const { boardMetrics, createBoardSettings } = await import(board);
for (const n of [5, 6, 10]) {
  const s = { ...createBoardSettings(), cols: n, rows: n };
  const m = boardMetrics(s);
  const l = battleLayout(s);
  assert.equal(l.centerY, 540, 'board remains at its original center');
  if (n <= 6) assert.equal(l.scale, 1, 'ordinary layouts are not shrunk for the hand');
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const x = 960 + (m.x + col * m.pitch + s.tileSize / 2 - 960) * l.scale;
    const y = 540 + (m.y + row * m.pitch + s.tileSize / 2 - 540) * l.scale;
    const cell = boardTarget(s, x, y);
    assert.equal(cell.col, col);
    assert.equal(cell.row, row);
    assert(Math.abs(cell.x + cell.size / 2 - x) < 0.001);
    assert(Math.abs(cell.y + cell.size / 2 - y) < 0.001);
  }
  const left = 960 + (m.x - 960) * l.scale;
  const top = 540 + (m.y - 540) * l.scale;
  assert.equal(boardTarget(s, left - 1, top + 10), null);
  assert.equal(boardTarget(s, left + 10, top - 1), null);
  assert.equal(boardTarget(s, left + (s.tileSize + s.tileGap / 2) * l.scale, top + 10), null, 'gaps reject drops');
  assert(l.boardBottom < 1026, 'collapsed hand trigger stays below the board');
  assert.equal(l.heroX, 960 - (m.spanW / 2 + 170) * l.scale);
  assert.equal(l.foeX, 960 + (m.spanW / 2 + 170) * l.scale);
}
{
  const s = { ...createBoardSettings(), boardNudgeX: 40, boardNudgeY: -20, heroNudgeX: 12, heroNudgeY: 8, foeNudgeX: -6, foeNudgeY: 15 };
  const m = boardMetrics(s);
  const base = boardMetrics(createBoardSettings());
  assert.equal(m.x, base.x + 40);
  assert.equal(m.y, base.y + 20 * -1);
  assert.equal(m.originX, base.originX);
  const l = battleLayout(s);
  const still = battleLayout(createBoardSettings());
  assert.equal(l.heroX, still.heroX + 12);
  assert.equal(l.foeX, still.foeX - 6);
  assert.equal(l.heroTop, still.fighterTop + 8);
  assert.equal(l.foeTop, still.fighterTop + 15);
  const cell = boardTarget(s, 960 + (m.x + s.tileSize / 2 - 960), 540 + (m.y + s.tileSize / 2 - 540));
  assert.equal(cell.col, 0);
  assert.equal(cell.row, 0);
}
console.log('Grid placement checks passed: 5×5, 6×6, scaled boards, center, bounds, gaps, hand clearance.');
