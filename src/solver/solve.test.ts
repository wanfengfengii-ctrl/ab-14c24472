import { describe, it, expect } from 'vitest';
import { solveSystem, modInverseOdd, recheckRows, type SystemInput } from './solve';
import { validateSystem, parseImportText, exportSystemJson } from './parse';

function sys(k: number, A: number[][], b: number[]): SystemInput {
  return {
    A: A.map((row) => row.map((v) => BigInt(v))),
    b: b.map((v) => BigInt(v)),
    n: A[0]?.length ?? 0,
    m: A.length,
    k,
  };
}

function mod(a: number, M: number): number {
  return ((a % M) + M) % M;
}

/** 暴力枚举全部解（仅用于小规模交叉验证），按字典序返回 */
function bruteForce(s: SystemInput): number[][] {
  const M = 1 << s.k;
  const sols: number[][] = [];
  const x = new Array<number>(s.n).fill(0);
  const rec = (j: number): void => {
    if (j === s.n) {
      for (let i = 0; i < s.m; i++) {
        let dot = 0n;
        for (let t = 0; t < s.n; t++) dot += s.A[i][t] * BigInt(x[t]);
        if (dot % BigInt(M) !== s.b[i] % BigInt(M)) return;
      }
      sols.push(x.slice());
      return;
    }
    for (let v = 0; v < M; v++) {
      x[j] = v;
      rec(j + 1);
    }
  };
  rec(0);
  sols.sort((a, b2) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b2[i]) return a[i] - b2[i];
    return 0;
  });
  return sols;
}

function expectMatchesBrute(s: SystemInput): void {
  const got = solveSystem(s);
  const want = bruteForce(s);
  expect(got.count).toBe(BigInt(want.length).toString(10));
  if (want.length === 0) {
    expect(got.verdict).toBe('none');
    expect(got.witnesses).toEqual([]);
  } else {
    expect(got.verdict).toBe(want.length === 1 ? 'unique' : 'multiple');
    const w0 = got.witnesses[0].map((v) => Number(v));
    expect(w0).toEqual(want[0]);
    if (want.length >= 2) {
      const w1 = got.witnesses[1].map((v) => Number(v));
      expect(w1).toEqual(want[1]);
      expect(got.witnesses.length).toBe(2);
    } else {
      expect(got.witnesses.length).toBe(1);
    }
    // 每份见证逐行回算必须全部通过
    for (const rc of got.rechecks) for (const r of rc) expect(r.pass).toBe(true);
  }
}

describe('modInverseOdd', () => {
  it('对奇数模 2^t 求逆', () => {
    for (const t of [1, 2, 3, 4, 8, 16]) {
      const M = 1 << t;
      for (let a = 1; a < M; a += 2) {
        const inv = modInverseOdd(BigInt(a), BigInt(M));
        expect(Number((BigInt(a) * inv) % BigInt(M))).toBe(1 % M);
      }
    }
  });
});

describe('基础裁决', () => {
  it('唯一解', () => {
    // det = 1·1-2·3 = -5，与 8 互素；解为 (3,5)
    const r = solveSystem(sys(3, [[1, 2], [3, 1]], [5, 6]));
    expect(r.verdict).toBe('unique');
    expect(r.count).toBe('1');
    expect(r.witnesses.length).toBe(1);
    expect(r.witnesses[0].map(Number)).toEqual([3, 5]);
  });

  it('无解：偶数系数等于奇数结果', () => {
    const r = solveSystem(sys(2, [[2, 0]], [1]));
    expect(r.verdict).toBe('none');
    expect(r.count).toBe('0');
  });

  it('矛盾方程：x0=0 与 x0=1', () => {
    const r = solveSystem(sys(2, [[1, 0], [1, 0]], [0, 1]));
    expect(r.verdict).toBe('none');
  });

  it('单方程 2x0=0 mod 4：x1 自由，共 8 解，见证 (0,0) 与 (0,1)', () => {
    const r = solveSystem(sys(2, [[2, 0]], [0]));
    expect(r.verdict).toBe('multiple');
    expect(r.count).toBe('8');
    expect(r.witnesses.map((w) => w.map(Number))).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('2x0+2x1=0 mod 4：8 解，字典序前两名为 (0,0),(0,2)', () => {
    const r = solveSystem(sys(2, [[2, 2]], [0]));
    expect(r.count).toBe('8');
    expect(r.witnesses.map((w) => w.map(Number))).toEqual([
      [0, 0],
      [0, 2],
    ]);
  });

  it('4x0+2x1=2 mod 8：16 解，最小见证 (0,1)，下一份 (0,5)', () => {
    const r = solveSystem(sys(3, [[4, 2]], [2]));
    expect(r.count).toBe('16');
    expect(r.witnesses[0].map(Number)).toEqual([0, 1]);
    expect(r.witnesses[1].map(Number)).toEqual([0, 5]);
  });

  it('全零等式合法且不重复计数（全范围未约束：2^(k·n) 解）', () => {
    const r = solveSystem(sys(2, [[0, 0], [0, 0]], [0, 0]));
    expect(r.count).toBe('16'); // 4^2
    expect(r.witnesses.map((w) => w.map(Number))).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('重复等式不重复计数', () => {
    const r1 = solveSystem(sys(3, [[1, 1]], [0]));
    const r2 = solveSystem(sys(3, [[1, 1], [1, 1], [1, 1]], [0, 0, 0]));
    expect(r2.count).toBe(r1.count);
    expect(r2.witnesses).toEqual(r1.witnesses);
  });

  it('全零行但结果非零：无解', () => {
    const r = solveSystem(sys(3, [[0, 0]], [1]));
    expect(r.verdict).toBe('none');
  });

  it('相互冗余的偶系数方程', () => {
    // 2x0 = 2 (mod 8) 与 6x0 = 6 (mod 8) 等价：x0∈{1,5}，x1 自由 8 个
    const r = solveSystem(sys(3, [[2, 0], [6, 0]], [2, 6]));
    expect(r.verdict).toBe('multiple');
    expect(r.count).toBe('16');
    expect(r.witnesses[0].map(Number)).toEqual([1, 0]);
  });

  it('冗余矛盾：第二行是第一行的偶数倍且右端不兼容', () => {
    // 2x0 = 0 (mod 8) 与 4x0 = 2 (mod 8)：后者要求 2 | x0... 4x0≡2 无解
    const r = solveSystem(sys(3, [[2, 0], [4, 0]], [0, 2]));
    expect(r.verdict).toBe('none');
  });

  it('k=16 全自由 8 寄存器：2^128 精确十进制', () => {
    const A = [new Array<bigint>(8).fill(0n)];
    const r = solveSystem({ A, b: [0n], n: 8, m: 1, k: 16 });
    expect(r.count).toBe((1n << 128n).toString(10));
    expect(r.witnesses[0]).toEqual(new Array(8).fill(0n));
    expect(r.witnesses[1]).toEqual([0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n]);
  });

  it('回算显示精确点积、余数与期望值', () => {
    const s = sys(2, [[3, 1]], [2]);
    const r = solveSystem(s);
    const rc = r.rechecks[0][0];
    const w = r.witnesses[0];
    const dot = 3n * w[0] + 1n * w[1];
    expect(rc.dot).toBe(dot);
    expect(rc.remainder).toBe(2n);
    expect(rc.expected).toBe(2n);
    expect(rc.pass).toBe(true);
    // 手工构造不满足的向量，回算应报失败
    const bad = recheckRows(s.A, s.b, [0n, 1n], 2)[0];
    expect(bad.pass).toBe(false);
    expect(bad.remainder).toBe(1n);
  });
});

describe('随机系统暴力枚举交叉验证', () => {
  // 确定性伪随机
  let seed = 0x12345678;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const cases: { k: number; n: number; m: number }[] = [];
  for (let k = 1; k <= 3; k++) {
    for (let n = 2; n <= 4; n++) {
      for (let m = 1; m <= 5; m++) {
        cases.push({ k, n, m });
      }
    }
  }
  // 更大未知数数但模数小：k=1 时 M^n 至多 256，k=2 时 n=6 为 4096
  cases.push({ k: 1, n: 8, m: 4 }, { k: 1, n: 7, m: 6 }, { k: 2, n: 6, m: 3 }, { k: 2, n: 5, m: 5 });

  for (const c of cases) {
    const M = 1 << c.k;
    it(`k=${c.k} n=${c.n} m=${c.m} 多组随机`, () => {
      for (let t = 0; t < 12; t++) {
        const A: number[][] = [];
        const b: number[] = [];
        for (let i = 0; i < c.m; i++) {
          const row: number[] = [];
          // 故意制造全零行、重复行与偶数系数
          const mode = Math.floor(rand() * 4);
          for (let j = 0; j < c.n; j++) {
            let v = Math.floor(rand() * M);
            if (mode === 1) v = mod(2 * v, M); // 偶数系数偏多
            if (mode === 2 && i > 0) v = 0; // 可能形成重复/零行
            row.push(v);
          }
          A.push(row);
          if (mode === 2 && i > 0 && A.length >= 2) {
            A[i] = A[i - 1].slice(); // 显式重复行
          }
          b.push(Math.floor(rand() * M));
          if (mode === 2 && i > 0) b[i] = b[i - 1];
        }
        expectMatchesBrute(sys(c.k, A, b));
      }
    });
  }
});

describe('验收场景定向用例（暴力比对）', () => {
  it('偶数系数矩阵', () => {
    expectMatchesBrute(sys(3, [[2, 4], [6, 2], [0, 4]], [6, 2, 4]));
    expectMatchesBrute(sys(3, [[2, 4], [6, 2]], [1, 0])); // 右端奇数 → 首行约束特性
  });

  it('相互冗余', () => {
    expectMatchesBrute(sys(4, [[2, 2], [4, 4], [6, 6]], [2, 4, 6]));
    expectMatchesBrute(sys(4, [[2, 2], [4, 4]], [2, 5]));
  });

  it('矛盾', () => {
    expectMatchesBrute(sys(3, [[1, 0, 0], [0, 1, 0], [1, 1, 0]], [1, 1, 3]));
  });

  it('更大 k 但系数稀疏：计数公式与见证步进', () => {
    // 8x0 + 4x1 = 12 (mod 16)：最小赋值主元为 4（e=2），2 个自由变量
    const r = solveSystem(sys(4, [[8, 4, 0]], [12]));
    expect(r.count).toBe(BigInt(4 * 16 * 16).toString(10));
    expect(r.witnesses[0].map(Number)).toEqual([0, 3, 0]);
    // 用小规模同构验证见证顺序
    expectMatchesBrute(sys(4, [[8, 4, 0]], [12]));
  });
});

describe('输入校验定位', () => {
  it('维度不匹配定位到行', () => {
    const out = validateSystem({
      k: 2,
      n: 2,
      m: 2,
      matrix: [[1, 2]],
      vector: [0, 1],
    });
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.errors.some((e) => e.scope === 'matrix' && e.row === 1)).toBe(true);
  });

  it('行内列数不匹配定位到具体行', () => {
    const out = validateSystem({
      k: 2,
      n: 3,
      m: 1,
      matrix: [[1, 2]],
      vector: [0],
    });
    expect(out.errors[0].scope).toBe('matrix');
    expect(out.errors[0].row).toBe(0);
  });

  it('非整数定位到矩阵单元', () => {
    const out = validateSystem({
      k: 2,
      n: 2,
      m: 1,
      matrix: [['1.5', '0']],
      vector: ['0'],
    });
    expect(out.errors[0]).toMatchObject({ scope: 'matrix', row: 0, col: 0 });
  });

  it('越界定位到向量单元', () => {
    const out = validateSystem({
      k: 2,
      n: 2,
      m: 1,
      matrix: [['1', '0']],
      vector: ['9'],
    });
    expect(out.errors[0].scope).toBe('vector');
    expect(out.errors[0].row).toBe(0);
  });

  it('合法输入通过校验', () => {
    const out = validateSystem({
      k: 3,
      n: 2,
      m: 2,
      matrix: [
        ['1', '2'],
        ['3', '4'],
      ],
      vector: ['5', '6'],
    });
    expect(out.errors).toEqual([]);
    expect(out.system).not.toBeNull();
  });
});

describe('导入导出', () => {
  it('JSON 导入', () => {
    const parsed = parseImportText(
      JSON.stringify({ k: 3, A: [[1, 2], [3, 4]], b: [5, 6] }),
      { n: 2, m: 2, k: 2 },
    );
    expect(parsed.error).toBeNull();
    expect(parsed.raw?.n).toBe(2);
    expect(parsed.raw?.m).toBe(2);
    expect(parsed.raw?.k).toBe(3);
  });

  it('文本格式导入（= 分隔）', () => {
    const parsed = parseImportText('# k=3 n=2\n1, 2 = 3\n4 0 ; 5\n', { n: 2, m: 2, k: 2 });
    expect(parsed.error).toBeNull();
    expect(parsed.raw).toMatchObject({ k: 3, n: 2, m: 2 });
    expect(parsed.raw?.matrix).toEqual([
      ['1', '2'],
      ['4', '0'],
    ]);
    expect(parsed.raw?.vector).toEqual(['3', '5']);
  });

  it('导出再导入往返', () => {
    const raw = {
      k: 4,
      n: 2,
      m: 1,
      matrix: [['7', '3']],
      vector: ['2'],
    };
    const text = exportSystemJson(raw);
    const parsed = parseImportText(text, { n: 2, m: 1, k: 4 });
    expect(parsed.raw).toEqual(raw);
  });
});
