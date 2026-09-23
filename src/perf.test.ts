import { test, expect } from 'vitest';
import { solveSystem } from './solver/solve';

test('k=16 n=8 m=12 随机系统性能', () => {
  const k = 16, n = 8, m = 12, M = 1 << 16;
  let seed = 99;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const A: bigint[][] = [];
  const b: bigint[] = [];
  for (let i = 0; i < m; i++) {
    const row: bigint[] = [];
    for (let j = 0; j < n; j++) {
      let v = Math.floor(rand() * M);
      if (j % 2 === 0) v = v & ~1;
      row.push(BigInt(v));
    }
    A.push(row);
    b.push(BigInt(Math.floor(rand() * M)));
  }
  const t0 = Date.now();
  const r = solveSystem({ A, b, n, m, k });
  const ms = Date.now() - t0;
  expect(ms).toBeLessThan(500);
  for (const rc of r.rechecks) for (const x of rc) expect(x.pass).toBe(true);
  expect(/^\d+$/.test(r.count)).toBe(true);
});

test('k=16 n=8 m=12 保证有解（由随机见证生成 b）含偶数系数', () => {
  const k = 16, n = 8, m = 12;
  const M = 1n << 16n;
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const xs = Array.from({ length: n }, () => BigInt(Math.floor(rand() * Number(M))));
  const A: bigint[][] = [];
  const b: bigint[] = [];
  for (let i = 0; i < m; i++) {
    const row: bigint[] = [];
    let dot = 0n;
    for (let j = 0; j < n; j++) {
      let v = BigInt(Math.floor(rand() * Number(M)));
      if (j % 2 === 0) v = v & ~1n;
      row.push(v);
      dot += v * xs[j];
    }
    A.push(row);
    b.push(dot % M);
  }
  // 追加全零等式与重复等式，验证不重复计数
  A.push(new Array(n).fill(0n)); b.push(0n);
  A.push(A[0].slice()); b.push(b[0]);

  const t0 = Date.now();
  const r = solveSystem({ A, b, n, m: m + 2, k });
  const ms = Date.now() - t0;
  expect(ms).toBeLessThan(500);
  expect(['unique', 'multiple']).toContain(r.verdict);
  for (const rc of r.rechecks) for (const x of rc) expect(x.pass).toBe(true);
  if (r.verdict === 'multiple') {
    expect(r.witnesses.length).toBe(2);
    // 第二份见证严格按字典序大于第一份
    const cmp = r.witnesses[1].findIndex((v, j) => v !== r.witnesses[0][j]);
    expect(cmp).toBeGreaterThanOrEqual(0);
    expect(r.witnesses[1][cmp] > r.witnesses[0][cmp]).toBe(true);
  }
  // 第一份见证必须不大于生成它的随机解（字典序）
  const w0 = r.witnesses[0];
  let le = true;
  for (let j = 0; j < n; j++) {
    if (w0[j] < xs[j]) break;
    if (w0[j] > xs[j]) { le = false; break; }
  }
  expect(le).toBe(true);
});

test('k=16 全锁唯一解', () => {
  const k = 16, n = 8;
  const A: bigint[][] = [];
  const b: bigint[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<bigint>(n).fill(0n);
    row[i] = 1n;
    A.push(row);
    b.push(BigInt(12345 + i));
  }
  const r = solveSystem({ A, b, n, m: n, k });
  expect(r.verdict).toBe('unique');
  expect(r.count).toBe('1');
  expect(r.witnesses[0].map(Number)).toEqual([12345,12346,12347,12348,12349,12350,12351,12352]);
});

test('进位必须越过被锁定的末位', () => {
  const k = 16, n = 3;
  const r = solveSystem({ A: [[0n,0n,1n]], b: [0n], n, m: 1, k });
  expect(r.count).toBe((1n << 32n).toString(10));
  expect(r.witnesses.map(w => w.map(Number))).toEqual([[0,0,0],[0,1,0]]);
});
