// 模 M = 2^k 线性同余方程组求解核心（全部使用 BigInt 精确计算）
//
// 方程：A x ≡ b (mod 2^k)，A 为 m×n 矩阵。
//
// 计数：在局部环 Z/2^kZ 上做 Smith 消元（始终选 2-adic 赋值最小的主元，
// 行/列变换均可逆），得到 r 个对角主元 2^{e_1},...,2^{e_r}，则
//   解数 = 2^( e_1 + ... + e_r + k·(n-r) )。
//
// 字典序最小见证：对每个坐标使用“目标变量优先”消元原语 minCoordinate，
// 直接读出在已锁定前缀下该坐标的最小可行值与可行剩余类步长，逐坐标贪心。
// 第二份见证从最右端可提升坐标进位得到。全程不枚举 M^n 规模的候选向量。

export interface SystemInput {
  /** 系数矩阵，m 行 n 列 */
  A: bigint[][];
  /** 结果向量，长度 m */
  b: bigint[];
  /** 未知寄存器个数 n（2..8） */
  n: number;
  /** 等式条数 m（1..12） */
  m: number;
  /** 位宽 k（1..16），模数 M = 2^k */
  k: number;
}

export type Verdict = 'none' | 'unique' | 'multiple';

export interface RowRecheck {
  row: number;
  /** 点积 Σ a_ij·x_j（精确整数，不取模） */
  dot: bigint;
  /** dot 除以 M 的余数 */
  remainder: bigint;
  /** 期望结果 b_i */
  expected: bigint;
  pass: boolean;
}

export interface SolveResult {
  verdict: Verdict;
  /** 全部不同完整参数向量数量（十进制字符串） */
  count: string;
  /** 字典序最小见证（0、1 或 2 份） */
  witnesses: bigint[][];
  /** 主元 2-adic 赋值（审计用） */
  pivots: number[];
  /** 每份见证的逐行回算明细 */
  rechecks: RowRecheck[][];
}

function mod(a: bigint, M: bigint): bigint {
  const r = a % M;
  return r < 0n ? r + M : r;
}

/** v2(a)：a 中因子 2 的次数；a=0 时返回 k（模 2^k 意义下最大） */
function valuation(a: bigint, k: number): number {
  if (a === 0n) return k;
  let v = 0;
  let x = a;
  while ((x & 1n) === 0n) {
    x >>= 1n;
    v++;
    if (v >= k) return k;
  }
  return v;
}

/** 奇数 a 在模 2^t 下的乘法逆元（牛顿迭代）。mod2t = 1 时返回 0。 */
export function modInverseOdd(a: bigint, mod2t: bigint): bigint {
  if (mod2t === 1n) return 0n;
  let x = mod(a, 8n); // 奇数满足 a^2 ≡ 1 (mod 8)，故 a^{-1} ≡ a (mod 8)
  let cur = 8n;
  while (cur < mod2t) {
    const nxt = cur * cur;
    x = mod(x * (2n - mod(a * x, nxt)), nxt);
    cur = nxt;
  }
  return mod(x, mod2t);
}

function swapRows(g: bigint[][], rhs: bigint[], i: number, j: number): void {
  if (i === j) return;
  const tr = g[i];
  g[i] = g[j];
  g[j] = tr;
  const tv = rhs[i];
  rhs[i] = rhs[j];
  rhs[j] = tv;
}

function swapCols(g: bigint[][], i: number, j: number): void {
  if (i === j) return;
  for (let r = 0; r < g.length; r++) {
    const t = g[r][i];
    g[r][i] = g[r][j];
    g[r][j] = t;
  }
}

function identityMatrix(n: number, M: bigint): bigint[][] {
  const Q: bigint[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0n);
    row[i] = 1n % M;
    Q.push(row);
  }
  return Q;
}

/** 主元 2^e 所在行标准化后，右端必须被 2^e 整除才有解 */
function divisibleBy2e(rhs: bigint, e: number): boolean {
  if (e === 0) return true;
  return (rhs & ((1n << BigInt(e)) - 1n)) === 0n;
}

// ---------------------------------------------------------------------------
// 计数用 Smith 对角化
// ---------------------------------------------------------------------------

interface CountDiag {
  rank: number;
  pivots: number[];
  consistent: boolean;
}

function diagonalizeForCount(A: bigint[][], b: bigint[], n: number, m: number, k: number): CountDiag {
  const M = 1n << BigInt(k);
  const g = A.map((row) => row.map((v) => mod(v, M)));
  const rhs = b.map((v) => mod(v, M));

  const pivots: number[] = [];
  let r = 0;
  let consistent = true;

  outer: for (let step = 0; step < Math.min(m, n); step++) {
    // 子矩阵 g[step..m-1][step..n-1] 中选赋值最小的元素
    let bestV = k;
    let bi = -1;
    let bj = -1;
    for (let i = step; i < m; i++) {
      for (let j = step; j < n; j++) {
        const v = valuation(g[i][j], k);
        if (v < bestV) {
          bestV = v;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi === -1) {
      r = step;
      break;
    }
    swapRows(g, rhs, step, bi);
    if (bj !== step) swapCols(g, step, bj);

    const e = bestV;
    const pivot = g[step][step]; // 2^e · u，u 奇
    const modLow = 1n << BigInt(k - e);
    const uInv = modInverseOdd(pivot >> BigInt(e), modLow);

    // 整行乘 uInv，主元标准化为 2^e
    for (let j = step; j < n; j++) g[step][j] = mod(g[step][j] * uInv, M);
    rhs[step] = mod(rhs[step] * uInv, M);
    if (!divisibleBy2e(rhs[step], e)) {
      consistent = false;
      break;
    }

    // 消去同列下方元素
    for (let i = step + 1; i < m; i++) {
      const a = g[i][step];
      if (a === 0n) continue;
      const t = a >> BigInt(e);
      for (let j = step; j < n; j++) g[i][j] = mod(g[i][j] - t * g[step][j], M);
      rhs[i] = mod(rhs[i] - t * rhs[step], M);
    }
    // 列加法清零同行右侧元素
    for (let j = step + 1; j < n; j++) {
      const q = g[step][j];
      if (q === 0n) continue;
      const t = q >> BigInt(e);
      for (let i = step; i < m; i++) g[i][j] = mod(g[i][j] - t * g[i][step], M);
    }

    pivots.push(e);
    r = step + 1;
  }

  if (consistent) {
    for (let i = r; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (g[i][j] !== 0n) {
          consistent = false;
          break;
        }
      }
      if (!consistent) break;
      if (rhs[i] !== 0n) {
        consistent = false;
        break;
      }
    }
  }

  return { rank: r, pivots, consistent };
}

// ---------------------------------------------------------------------------
// 带列变换跟踪的 Smith 对角化：x = Q z
//
// 对角后 z_i（主元）满足 2^{e_i} z_i = c_i，其余 z_j 自由。
// 列交换 / 列加法只作用于变量代换，右端项不变，故同步维护 Q：
//   - 列交换：交换 Q 的两列；
//   - 第 j 列减去 t 倍第 i 列：Q[:,j] -= t·Q[:,i]。
// ---------------------------------------------------------------------------

interface TrackedDiag {
  consistent: boolean;
  pivots: { e: number; c: bigint }[];
  Q: bigint[][];
}

function diagonalizeTracked(
  A: bigint[][],
  b: bigint[],
  n: number,
  m: number,
  k: number,
): TrackedDiag {
  const M = 1n << BigInt(k);
  const g = A.map((row) => row.map((v) => mod(v, M)));
  const rhs = b.map((v) => mod(v, M));
  const Q = identityMatrix(n, M);
  const pivots: { e: number; c: bigint }[] = [];
  let r = 0;
  let consistent = true;

  outer: for (let step = 0; step < Math.min(m, n); step++) {
    let bestV = k;
    let bi = -1;
    let bj = -1;
    for (let i = step; i < m; i++) {
      for (let j = step; j < n; j++) {
        const v = valuation(g[i][j], k);
        if (v < bestV) {
          bestV = v;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi === -1) {
      r = step;
      break;
    }
    swapRows(g, rhs, step, bi);
    if (bj !== step) {
      swapCols(g, step, bj);
      swapCols(Q, step, bj);
    }

    const e = bestV;
    const modLow = 1n << BigInt(k - e);
    const uInv = modInverseOdd(g[step][step] >> BigInt(e), modLow);
    for (let j = step; j < n; j++) g[step][j] = mod(g[step][j] * uInv, M);
    rhs[step] = mod(rhs[step] * uInv, M);
    if (!divisibleBy2e(rhs[step], e)) {
      consistent = false;
      break;
    }

    for (let i = step + 1; i < m; i++) {
      const a = g[i][step];
      if (a === 0n) continue;
      const t = a >> BigInt(e);
      for (let j = step; j < n; j++) g[i][j] = mod(g[i][j] - t * g[step][j], M);
      rhs[i] = mod(rhs[i] - t * rhs[step], M);
    }
    for (let j = step + 1; j < n; j++) {
      const q = g[step][j];
      if (q === 0n) continue;
      const t = q >> BigInt(e);
      for (let i = 0; i < m; i++) g[i][j] = mod(g[i][j] - t * g[i][step], M);
      for (let i = 0; i < n; i++) Q[i][j] = mod(Q[i][j] - t * Q[i][step], M);
    }

    pivots.push({ e, c: rhs[step] });
    r = step + 1;
  }

  if (consistent) {
    for (let i = r; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (g[i][j] !== 0n) {
          consistent = false;
          break;
        }
      }
      if (!consistent) break;
      if (rhs[i] !== 0n) {
        consistent = false;
        break;
      }
    }
  }

  return { consistent, pivots, Q };
}

// ---------------------------------------------------------------------------
// 见证构造
// ---------------------------------------------------------------------------

export interface CoordinateProjection {
  /** 该坐标可行陪集中的最小非负值 */
  min: bigint;
  /** 可行值步长为 2^stepExp */
  stepExp: number;
}

/**
 * 锁定 x_j = fixed[j]（j < fixedCount）后，求坐标 interest 的可行取值陪集。
 *
 * 对角化后 z 参数空间中解是独立剩余类的直积（主元 z_i ≡ c_i mod 2^{k-e_i}，
 * 自由 z_j 遍历 Z/M），而 x = Q z。于是
 *   x_p = Σ_i Q[p][i] z_i
 * 的取值集合是 α 与一个 2 进子群的陪集，子群指数 h 为各项赋值的最小值，
 * 最小非负代表即 α mod 2^h。
 */
function projectCoordinate(
  A: bigint[][],
  b: bigint[],
  n: number,
  m: number,
  k: number,
  fixedCount: number,
  fixed: bigint[],
  interest: number,
): CoordinateProjection | null {
  void m;
  const M = 1n << BigInt(k);

  const g = A.map((row) => row.slice());
  const rhs = b.slice();
  for (let j = 0; j < fixedCount; j++) {
    const row = new Array(n).fill(0n);
    row[j] = 1n;
    g.push(row);
    rhs.push(mod(fixed[j], M));
  }

  const diag = diagonalizeTracked(g, rhs, n, g.length, k);
  if (!diag.consistent) return null;

  const v = diag.Q[interest];
  let alpha = 0n;
  for (let i = 0; i < diag.pivots.length; i++) {
    const { e, c } = diag.pivots[i];
    // 主元方程 2^e z_i = c 的最小非负代表为 c >> e
    alpha = mod(alpha + v[i] * (c >> BigInt(e)), M);
  }

  let h = k;
  for (let i = 0; i < diag.pivots.length; i++) {
    const e = diag.pivots[i].e;
    // z_i 的陪集步长为 2^{k-e}
    h = Math.min(h, valuation(v[i], k) + (k - e));
  }
  for (let j = diag.pivots.length; j < n; j++) {
    h = Math.min(h, valuation(v[j], k));
  }
  h = Math.min(h, k);

  return { min: alpha & ((1n << BigInt(h)) - 1n), stepExp: h };
}

/** 逐坐标贪心求字典序最小完整解；整体无解时返回 null */
function lexicographicallyMinimal(
  A: bigint[][],
  b: bigint[],
  n: number,
  m: number,
  k: number,
): bigint[] | null {
  const x = new Array<bigint>(n).fill(0n);
  for (let p = 0; p < n; p++) {
    const proj = projectCoordinate(A, b, n, m, k, p, x, p);
    if (proj === null) return null;
    x[p] = proj.min;
  }
  return x;
}

/** 锁定前缀、给定 x_p 后贪心补全后缀 */
function completeSuffix(
  A: bigint[][],
  b: bigint[],
  n: number,
  m: number,
  k: number,
  x: bigint[],
  from: number,
): bigint[] | null {
  for (let q = from; q < n; q++) {
    const proj = projectCoordinate(A, b, n, m, k, q, x, q);
    if (proj === null) return null;
    x[q] = proj.min;
  }
  return x;
}

/** 字典序下一份解：从最右端坐标尝试进位 */
function nextLexicographic(
  A: bigint[][],
  b: bigint[],
  n: number,
  m: number,
  k: number,
  w: bigint[],
): bigint[] | null {
  const M = 1n << BigInt(k);
  for (let p = n - 1; p >= 0; p--) {
    const x = new Array<bigint>(n).fill(0n);
    for (let j = 0; j < p; j++) x[j] = w[j];
    const proj = projectCoordinate(A, b, n, m, k, p, x, p);
    if (proj === null) return null;
    const step = 1n << BigInt(proj.stepExp);
    const candidate = w[p] + step; // w[p] 必在该陪集内
    if (candidate >= M) continue;
    x[p] = candidate;
    const done = completeSuffix(A, b, n, m, k, x, p + 1);
    if (done) return done;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 回算与求解入口
// ---------------------------------------------------------------------------

export function recheckRows(A: bigint[][], b: bigint[], x: bigint[], k: number): RowRecheck[] {
  const M = 1n << BigInt(k);
  return A.map((row, i) => {
    let dot = 0n;
    for (let j = 0; j < x.length; j++) dot += row[j] * x[j];
    const remainder = mod(dot, M);
    const expected = mod(b[i], M);
    return { row: i, dot, remainder, expected, pass: remainder === expected };
  });
}

export function solveSystem(sys: SystemInput): SolveResult {
  const { A, b, n, m, k } = sys;

  const diag = diagonalizeForCount(A, b, n, m, k);
  if (!diag.consistent) {
    return { verdict: 'none', count: '0', witnesses: [], pivots: diag.pivots, rechecks: [] };
  }

  let exponent = 0;
  for (const e of diag.pivots) exponent += e;
  exponent += k * (n - diag.rank);
  const count = 1n << BigInt(exponent);

  const w0 = lexicographicallyMinimal(A, b, n, m, k);
  if (w0 === null) {
    return { verdict: 'none', count: '0', witnesses: [], pivots: diag.pivots, rechecks: [] };
  }
  const witnesses: bigint[][] = [w0];
  if (count > 1n) {
    const w1 = nextLexicographic(A, b, n, m, k, w0);
    if (w1) witnesses.push(w1);
  }

  return {
    verdict: count === 1n ? 'unique' : 'multiple',
    count: count.toString(10),
    witnesses,
    pivots: diag.pivots,
    rechecks: witnesses.map((w) => recheckRows(A, b, w, k)),
  };
}
