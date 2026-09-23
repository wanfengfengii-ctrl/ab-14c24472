import { describe, it, expect } from 'vitest';
import { LIMITS, parseModel, solve, type ParsedModel, type RawModel } from './solver';

/** 简易确定性随机数（mulberry32），保证对拍可复现。 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRaw(k: number, A: number[][], b: number[]): RawModel {
  return {
    k: String(k),
    cells: A.map((row, i) => [...row.map(String), String(b[i])]),
  };
}

function parse(k: number, A: number[][], b: number[]): ParsedModel {
  const model = parseModel(makeRaw(k, A, b));
  if (!model.valid) throw new Error('model invalid: ' + JSON.stringify(model.issues));
  return model;
}

/** 暴力枚举全部解（仅用于小规模对拍），按字典序返回。 */
function bruteForce(k: number, A: bigint[][], b: bigint[]): bigint[][] {
  const n = A[0]?.length ?? 0;
  const M = 1n << BigInt(k);
  const sols: bigint[][] = [];
  const x = new Array<bigint>(n).fill(0n);
  const recurse = (j: number) => {
    if (j === n) {
      let ok = true;
      for (let i = 0; i < A.length; i++) {
        let s = 0n;
        for (let t = 0; t < n; t++) s += A[i][t] * x[t];
        if (s % M !== b[i]) {
          ok = false;
          break;
        }
      }
      if (ok) sols.push(x.slice());
      return;
    }
    for (let v = 0n; v < M; v++) {
      x[j] = v;
      recurse(j + 1);
    }
  };
  recurse(0);
  return sols; // x[0] 变化最慢 ⇒ 字典序
}

describe('求解器 — 与暴力枚举对拍', () => {
  it('k/n/m 小规模随机模型全部对拍（计数 + 前两份字典序见证 + 回算）', () => {
    const rand = rng(20260923);
    let trials = 0;
    for (let k = 1; k <= 3; k++) {
      for (let n = 2; n <= 3; n++) {
        for (let m = 1; m <= 5; m++) {
          for (let t = 0; t < 60; t++) {
            const M = 1 << k;
            const A = Array.from({ length: m }, () =>
              Array.from({ length: n }, () => BigInt(Math.floor(rand() * M))),
            );
            const b = Array.from({ length: m }, () => BigInt(Math.floor(rand() * M)));
            const model = parse(k, A.map((r) => r.map(Number)), b.map(Number));
            const out = solve(model);
            const expectSols = bruteForce(k, A, b);
            trials++;

            expect(out.count).toBe(BigInt(expectSols.length).toString());
            expect(out.verdict).toBe(
              expectSols.length === 0 ? 'none' : expectSols.length === 1 ? 'unique' : 'many',
            );
            if (expectSols.length >= 1) expect(out.witnesses[0]).toEqual(expectSols[0]);
            if (expectSols.length >= 2) expect(out.witnesses[1]).toEqual(expectSols[1]);
            if (expectSols.length > 2) expect(out.witnesses.length).toBe(2);

            for (const checks of out.checks) {
              for (const c of checks) expect(c.match).toBe(true);
            }
          }
        }
      }
    }
    expect(trials).toBeGreaterThan(1500);
  });

  it('k=4、n=2 稍大空间也对拍（含偶数系数高发场景）', () => {
    const rand = rng(4242);
    for (let t = 0; t < 200; t++) {
      const m = 1 + Math.floor(rand() * 6);
      const A = Array.from({ length: m }, () => [
        BigInt(2 * Math.floor(rand() * 8)),
        BigInt(Math.floor(rand() * 16)),
      ]);
      const b = Array.from({ length: m }, () => BigInt(Math.floor(rand() * 16)));
      const model = parse(4, A.map((r) => r.map(Number)), b.map(Number));
      const out = solve(model);
      const expectSols = bruteForce(4, A, b);
      expect(out.count).toBe(BigInt(expectSols.length).toString());
      if (expectSols.length >= 2) expect(out.witnesses[1]).toEqual(expectSols[1]);
    }
  });

  it('n 扩大到 8（k=1,2）对拍：列交换、自由列与第二见证', () => {
    const rand = rng(99);
    let trials = 0;
    for (const k of [1, 2]) {
      for (let n = 2; n <= 8; n++) {
        for (const m of [1, Math.max(1, n - 1), n, Math.min(12, n + 2)]) {
          for (let t = 0; t < 12; t++) {
            const M = 1 << k;
            const A = Array.from({ length: m }, () =>
              Array.from({ length: n }, () => BigInt(Math.floor(rand() * M))),
            );
            const b = Array.from({ length: m }, () => BigInt(Math.floor(rand() * M)));
            const model = parse(k, A.map((r) => r.map(Number)), b.map(Number));
            const out = solve(model);
            const expectSols = bruteForce(k, A, b);
            trials++;
            expect(out.count).toBe(BigInt(expectSols.length).toString());
            if (expectSols.length >= 1) expect(out.witnesses[0]).toEqual(expectSols[0]);
            if (expectSols.length >= 2) expect(out.witnesses[1]).toEqual(expectSols[1]);
          }
        }
      }
    }
    expect(trials).toBeGreaterThan(600);
  });
});

describe('求解器 — 定向用例', () => {
  it('全零等式：全部参数未约束，计数 2^(k·n)，见证 0 与最后一位进位', () => {
    const model = parse(16, [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ], [0, 0]);
    const out = solve(model);
    expect(out.verdict).toBe('many');
    expect(BigInt(out.count)).toBe(2n ** 128n);
    expect(out.count).toBe('340282366920938463463374607431768211456');
    expect(out.witnesses[0]).toEqual(Array(8).fill(0n));
    expect(out.witnesses[1]).toEqual([0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n]);
  });

  it('全零系数但右端非零：无解', () => {
    const model = parse(3, [[0, 0], [0, 0]], [1, 0]);
    expect(solve(model).verdict).toBe('none');
  });

  it('偶数系数产生倍数解：2x₁≡0 (mod 8)，x₂ 自由', () => {
    const model = parse(3, [[2, 0]], [0]);
    const out = solve(model);
    expect(out.verdict).toBe('many');
    expect(out.count).toBe('16');
    expect(out.witnesses[0]).toEqual([0n, 0n]);
    expect(out.witnesses[1]).toEqual([0n, 1n]);
  });

  it('偶数系数右端偏移：2x₁≡4 (mod 8)，最小见证 x₁=2', () => {
    const model = parse(3, [[2, 0]], [4]);
    const out = solve(model);
    expect(out.count).toBe('16');
    expect(out.witnesses[0]).toEqual([2n, 0n]);
    expect(out.witnesses[1]).toEqual([2n, 1n]);
    out.checks[0].forEach((c) => expect(c.match).toBe(true));
  });

  it('偶数系数矛盾：2x₁≡1 (mod 8) 无解', () => {
    const model = parse(3, [[2, 0], [0, 2]], [1, 0]);
    expect(solve(model).verdict).toBe('none');
  });

  it('重复等式只计数一次解空间规模', () => {
    const model = parse(4, [
      [2, 2],
      [2, 2],
      [2, 2],
    ], [4, 4, 4]);
    const single = solve(parse(4, [[2, 2]], [4]));
    const out = solve(model);
    expect(out.count).toBe(single.count);
    expect(out.rank).toBe(1);
    const sols = bruteForce(4, [[2n, 2n]], [4n]);
    expect(out.count).toBe(BigInt(sols.length).toString());
  });

  it('相互冗余的等式不放大秩', () => {
    // 行2 = 3·行1 (mod 16)；行3 = 行1 + 行2
    const model = parse(4, [
      [2, 4],
      [6, 12],
      [8, 0],
    ], [6, 18 % 16, (6 + 18 % 16) % 16]);
    const out = solve(model);
    expect(out.rank).toBe(1);
    expect(out.verdict).toBe('many');
  });

  it('唯一解裁决为 unique，仅一份见证', () => {
    // 单位阵式约束
    const model = parse(3, [
      [1, 0],
      [0, 1],
    ], [3, 5]);
    const out = solve(model);
    expect(out.verdict).toBe('unique');
    expect(out.count).toBe('1');
    expect(out.witnesses).toEqual([[3n, 5n]]);
  });

  it('解为全零且唯一', () => {
    const model = parse(2, [
      [1, 2],
      [3, 1],
    ], [0, 0]);
    const out = solve(model);
    expect(out.count).toBe('1');
    expect(out.witnesses[0]).toEqual([0n, 0n]);
  });

  it('见证字典序：约束迫使靠前寄存器取大值', () => {
    // x₁ ≡ 7 (mod 8)，x₂ 半自由
    const model = parse(3, [[1, 0], [0, 2]], [7, 0]);
    const out = solve(model);
    expect(out.witnesses[0]).toEqual([7n, 0n]);
    expect(out.witnesses[1]).toEqual([7n, 4n]);
    const sols = bruteForce(3, [[1n, 0n], [0n, 2n]], [7n, 0n]);
    expect(out.witnesses[0]).toEqual(sols[0]);
    expect(out.witnesses[1]).toEqual(sols[1]);
  });

  it('回算逐行给出余数与期望值', () => {
    const model = parse(4, [
      [13, 7],
      [5, 11],
    ], [9, 3]);
    const out = solve(model);
    out.checks.forEach((checks, wi) => {
      expect(checks).toHaveLength(2);
      for (const c of checks) {
        expect(c.remainder).toBe(c.expected);
        expect(c.match).toBe(true);
      }
      const x = out.witnesses[wi];
      expect(checks[0].sum).toBe(13n * x[0] + 7n * x[1]);
    });
  });

  it('偶数枢轴必然贡献 2^d 个解：[2 0;0 2] 有 4 个解，最小两份见证按字典序', () => {
    // 2x1≡6 ⇒ x1∈{3,7}；2x2≡2 ⇒ x2∈{1,5}
    const model = parse(3, [
      [2, 0],
      [0, 2],
    ], [6, 2]);
    const out = solve(model);
    expect(out.verdict).toBe('many');
    expect(out.count).toBe('4');
    expect(out.witnesses[0]).toEqual([3n, 1n]);
    expect(out.witnesses[1]).toEqual([3n, 5n]);
  });

  it('唯一解要求所有枢轴为奇数（行列式为奇单位），偶数枢轴绝不唯一', () => {
    // 随机若干含偶数系数但满秩奇行列式的系统应唯一；含偶枢轴则计数必为偶数
    const rand = rng(7);
    for (let t = 0; t < 300; t++) {
      const k = 1 + Math.floor(rand() * 4);
      const n = 2 + Math.floor(rand() * 3);
      const m = n + Math.floor(rand() * 3);
      const M = 1 << k;
      const A = Array.from({ length: m }, () =>
        Array.from({ length: n }, () => BigInt(Math.floor(rand() * M))),
      );
      const xstar = Array.from({ length: n }, () => BigInt(Math.floor(rand() * M)));
      const b = A.map((row) => row.reduce((s, a, j) => s + a * xstar[j], 0n) & BigInt(M - 1));
      const model = parse(k, A.map((r) => r.map(Number)), b.map(Number));
      const out = solve(model);
      if (out.verdict === 'unique') {
        expect(out.rank).toBe(n);
        expect(out.pivotValuations.every((d) => d === 0)).toBe(true);
      } else {
        expect(BigInt(out.count) % 2n).toBe(0n);
      }
    }
  });

  it('计数可达上界 2^128 且为十进制字符串', () => {
    const model = parse(16, Array.from({ length: 12 }, () => Array(8).fill(0)), Array(12).fill(0));
    const out = solve(model);
    expect(out.count).toMatch(/^\d+$/);
    expect(BigInt(out.count)).toBe(2n ** 128n);
    expect(out.count).toHaveLength(39);
    expect(out.exponent).toBe(128);
  });
});

describe('输入解析与错误定位', () => {
  it('非整数精确定位到矩阵/向量单元', () => {
    const raw: RawModel = {
      k: '4',
      cells: [
        ['1', 'x', '0'],
        ['', '2', '3'],
      ],
    };
    const model = parseModel(raw);
    expect(model.valid).toBe(false);
    expect(model.issues).toContainEqual(expect.objectContaining({ row: 0, col: 1, kind: 'not-integer' }));
    expect(model.issues).toContainEqual(expect.objectContaining({ row: 1, col: 0, kind: 'empty' }));
  });

  it('结果向量（最后一列）错误 col 为 null', () => {
    const raw: RawModel = { k: '4', cells: [['1', '2', 'oops']] };
    const model = parseModel(raw);
    expect(model.issues).toEqual([
      expect.objectContaining({ row: 0, col: null, kind: 'not-integer' }),
    ]);
  });

  it('数值越界定位到具体单元（含负数与 ≥M）', () => {
    const raw: RawModel = {
      k: '3',
      cells: [
        ['8', '0', '0'],
        ['0', '-1', '7'],
        ['0', '0', '9'],
      ],
    };
    const model = parseModel(raw);
    expect(model.valid).toBe(false);
    expect(model.issues).toContainEqual(expect.objectContaining({ row: 0, col: 0, kind: 'out-of-range' }));
    expect(model.issues).toContainEqual(expect.objectContaining({ row: 1, col: 1, kind: 'out-of-range' }));
    expect(model.issues).toContainEqual(expect.objectContaining({ row: 2, col: null, kind: 'out-of-range' }));
  });

  it('维度不匹配给出结构性错误', () => {
    const raw: RawModel = {
      k: '4',
      cells: [
        ['1', '2', '0'],
        ['1', '2', '3', '0'],
      ],
    };
    const model = parseModel(raw);
    expect(model.valid).toBe(false);
    expect(model.structural.join(' ')).toContain('第 2 行');
  });

  it('位宽越界与非整数被拒绝', () => {
    expect(parseModel({ k: '0', cells: [['1', '2', '3']] }).valid).toBe(false);
    expect(parseModel({ k: '17', cells: [['1', '2', '3']] }).valid).toBe(false);
    expect(parseModel({ k: '2.5', cells: [['1', '2', '3']] }).valid).toBe(false);
  });

  it('n/m 边界校验', () => {
    const tooFewCols: RawModel = { k: '4', cells: [['1', '0']] };
    expect(parseModel(tooFewCols).valid).toBe(false);
    const tooManyRows = {
      k: '4',
      cells: Array.from({ length: 13 }, () => ['0', '0', '0']),
    };
    expect(parseModel(tooManyRows).valid).toBe(false);
  });

  it('合法极值：n=8、m=12、k=16', () => {
    const raw: RawModel = {
      k: '16',
      cells: Array.from({ length: LIMITS.MAX_M }, () =>
        Array(LIMITS.MAX_N + 1).fill('0'),
      ),
    };
    expect(parseModel(raw).valid).toBe(true);
  });
});
