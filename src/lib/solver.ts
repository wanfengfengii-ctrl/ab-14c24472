/**
 * 模 M = 2^k 线性同余方程组求解核心。
 *
 * 方程组：对每条等式 i，Σ_j A[i][j]·x_j ≡ b[i] (mod M)。
 *
 * 思路：在主理想局部环 Z/2^k 上做 p 进（2-adic）Smith 消元。
 * 每一步在剩余子矩阵中选取 2-adic 赋值最小（即被 2 整除次数最少）
 * 的元素作枢轴，配合行交换、列交换与「模逆精确消元」，可依次得到
 * 对角因子 2^d1·u1, 2^d2·u2, …（u 为奇数，行/列变换在 Z/2^k 上
 * 均幺模可逆）。
 *
 *   - 相容性：右端经同样行变换后，必须被各枢轴的 2^d 整除，零行必须为 0。
 *   - 解数：2^(Σ d_i + k·(n-r))，不枚举任何候选向量，直接以 bigint 计数，
 *     最大可达 2^128。
 *   - 见证：列变换 V（x = V·y）给出特解；解空间陪集的生成矩阵 W，
 *     用逐坐标「前缀投影子群必为 2^s·Z」的贪心取字典序最小向量，
 *     第二份见证在最后一个可变动坐标处取次小值后再贪心。
 */

export interface Issue {
  kind: 'empty' | 'not-integer' | 'out-of-range';
  row: number;
  /** null 表示结果向量 b 的单元；否则为矩阵列号 */
  col: number | null;
  message: string;
}

export interface ParsedModel {
  valid: boolean;
  k: number;
  n: number;
  m: number;
  M: bigint;
  A: bigint[][];
  b: bigint[];
  issues: Issue[];
  structural: string[];
}

export interface RawModel {
  k: string;
  /** m 行 × (n+1) 列，最后一列为结果 b，其余为系数 A */
  cells: string[][];
}

export type Verdict = 'none' | 'unique' | 'many';

export interface RowCheck {
  row: number;
  sum: bigint;
  remainder: bigint;
  expected: bigint;
  match: boolean;
}

export interface SolveOutcome {
  verdict: Verdict;
  /** 全部不同完整参数向量的数量，十进制字符串 */
  count: string;
  exponent: number;
  witnesses: bigint[][];
  rank: number;
  pivotValuations: number[];
  checks: RowCheck[][];
}

const MIN_N = 2;
const MAX_N = 8;
const MIN_M = 1;
const MAX_M = 12;
const MIN_K = 1;
const MAX_K = 16;

export const LIMITS = { MIN_N, MAX_N, MIN_M, MAX_M, MIN_K, MAX_K };

export function mod2(a: bigint, M: bigint): bigint {
  const r = a % M;
  return r < 0n ? r + M : r;
}

/** v2：被 2 整除的次数；0 的赋值记为 k（即环中的零元）。 */
function valuation(a: bigint, k: number): number {
  if (a === 0n) return k;
  let v = 0;
  while ((a & 1n) === 0n) {
    a >>= 1n;
    v++;
  }
  return v;
}

function pow2(exp: number | bigint): bigint {
  return 1n << BigInt(exp);
}

function mask(len: number | bigint): bigint {
  return (1n << BigInt(len)) - 1n;
}

/** 奇数 u 在模 2^len 下的乘法逆元（扩展欧几里得）。 */
function invOdd(u: bigint, len: number): bigint {
  const mod = pow2(len);
  let [oldR, r] = [u % mod, mod];
  let [oldT, t] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldT, t] = [t, oldT - q * t];
  }
  return mod2(oldT, mod);
}

const INTEGER_RE = /^[+-]?\d+$/;

function parseCell(raw: string): bigint | null {
  const s = raw.trim();
  if (!INTEGER_RE.test(s)) return null;
  return BigInt(s);
}

/**
 * 解析并校验原始输入。k 非法时无法界定范围，仅报告结构与 k 问题。
 */
export function parseModel(raw: RawModel): ParsedModel {
  const issues: Issue[] = [];
  const structural: string[] = [];

  const kTrim = raw.k.trim();
  let k = Number.NaN;
  if (/^\d+$/.test(kTrim)) k = Number(kTrim);
  const kValid = INTEGER_RE.test(kTrim) && k >= MIN_K && k <= MAX_K;
  if (!kValid) {
    structural.push(`位宽 k 必须是 ${MIN_K} 到 ${MAX_K} 之间的整数，当前为「${raw.k}」。`);
  }

  const m = raw.cells.length;
  const n = m > 0 ? raw.cells[0].length - 1 : 0;
  const M = kValid ? pow2(k) : 0n;

  if (n < MIN_N || n > MAX_N) {
    structural.push(`未知寄存器个数 n 必须在 ${MIN_N} 到 ${MAX_N} 之间，当前为 ${n}。`);
  }
  if (m < MIN_M || m > MAX_M) structural.push(`等式条数 m 必须在 ${MIN_M} 到 ${MAX_M} 之间，当前为 ${m}。`);

  const A: bigint[][] = [];
  const b: bigint[] = [];

  raw.cells.forEach((row, i) => {
    if (row.length !== n + 1) {
      structural.push(`第 ${i + 1} 行有 ${row.length} 个单元，应为 ${n + 1} 个（${n} 个系数 + 1 个结果）。`);
    }
    const aRow: bigint[] = [];
    for (let j = 0; j < Math.min(row.length, n + 1) - 1; j++) {
      const text = row[j] ?? '';
      const v = parseCell(text);
      if (v === null) {
        issues.push({
          kind: text.trim() === '' ? 'empty' : 'not-integer',
          row: i,
          col: j,
          message: text.trim() === '' ? '单元为空' : `「${text}」不是整数`,
        });
        aRow.push(0n);
      } else if (kValid && (v < 0n || v >= M)) {
        issues.push({
          kind: 'out-of-range',
          row: i,
          col: j,
          message: `系数 ${v} 超出范围 [0, ${M - 1n}]`,
        });
        aRow.push(mod2(v, M));
      } else {
        aRow.push(v);
      }
    }
    while (aRow.length < Math.max(n, 0)) aRow.push(0n);
    A.push(aRow);

    const bText = row[n] ?? '';
    const bv = parseCell(bText);
    if (bv === null) {
      issues.push({
        kind: bText.trim() === '' ? 'empty' : 'not-integer',
        row: i,
        col: null,
        message: bText.trim() === '' ? '单元为空' : `「${bText}」不是整数`,
      });
      b.push(0n);
    } else if (kValid && (bv < 0n || bv >= M)) {
      issues.push({
        kind: 'out-of-range',
        row: i,
        col: null,
        message: `结果 ${bv} 超出范围 [0, ${M - 1n}]`,
      });
      b.push(mod2(bv, M));
    } else {
      b.push(bv);
    }
  });

  const valid = kValid && issues.length === 0 && structural.length === 0;
  return { valid, k: kValid ? k : 0, n, m, M, A, b, issues, structural };
}

type RowOp =
  | { type: 'swap'; i: number; j: number }
  | { type: 'add'; from: number; to: number; f: bigint };

interface NormalForm {
  r: number;
  diag: number[];
  /** 各枢轴当前值（2^d · 奇数） */
  pivots: bigint[];
  /** 列变换矩阵：x = V·y (mod M) */
  V: bigint[][];
  rowOps: RowOp[];
}

function identity(size: number): bigint[][] {
  const V = Array.from({ length: size }, () => new Array<bigint>(size).fill(0n));
  for (let i = 0; i < size; i++) V[i][i] = 1n;
  return V;
}

/**
 * p 进 Smith 消元。返回对角枢轴赋值 d_i、枢轴值、列变换 V 以及
 * 施加于 A 的行操作（供右端 b 原样重放）。
 */
function analyze(A: bigint[][], k: number, n: number): NormalForm {
  const m = A.length;
  const M = pow2(k);
  const B = A.map((row) => row.slice());
  const V = identity(n);
  const rowOps: RowOp[] = [];
  const diag: number[] = [];
  const pivots: bigint[] = [];

  const swapRows = (i: number, p: number) => {
    if (i === p) return;
    const tmp = B[i];
    B[i] = B[p];
    B[p] = tmp;
    rowOps.push({ type: 'swap', i, j: p });
  };
  const swapCols = (j: number, q: number) => {
    if (j === q) return;
    for (let r = 0; r < m; r++) {
      const tmp = B[r][j];
      B[r][j] = B[r][q];
      B[r][q] = tmp;
    }
    for (let r = 0; r < n; r++) {
      const tmp = V[r][j];
      V[r][j] = V[r][q];
      V[r][q] = tmp;
    }
  };
  // 消元商 f：使 f·pivot ≡ target (mod M)，其中二者均被 2^d 整除
  const elimFactor = (target: bigint, pivot: bigint, d: number): bigint => {
    const len = k - d;
    const u = pivot >> BigInt(d);
    return (((target >> BigInt(d)) & mask(len)) * invOdd(u, len)) & mask(len);
  };
  const colAdd = (from: number, to: number, f: bigint) => {
    // B[:,to] -= f·B[:,from]；V 同步（x = V·y 的正向累积）
    for (let r = 0; r < m; r++) B[r][to] = mod2(B[r][to] - f * B[r][from], M);
    for (let r = 0; r < n; r++) V[r][to] = mod2(V[r][to] - f * V[r][from], M);
  };
  const rowAdd = (from: number, to: number, f: bigint) => {
    for (let c = 0; c < n; c++) B[to][c] = mod2(B[to][c] - f * B[from][c], M);
    rowOps.push({ type: 'add', from, to, f });
  };

  let i = 0;
  while (i < m && i < n) {
    let best = k + 1;
    let pr = -1;
    let pc = -1;
    for (let r = i; r < m; r++) {
      for (let c = i; c < n; c++) {
        const v = valuation(B[r][c], k);
        if (v < best) {
          best = v;
          pr = r;
          pc = c;
        }
      }
    }
    if (best >= k) break; // 剩余子矩阵全零

    swapRows(i, pr);
    swapCols(i, pc);
    const d = best;
    const pivot = B[i][i];
    pivots.push(pivot);

    // 列消元：pivot = 2^d·u（u 奇），目标均被 2^d 整除，用模逆求商
    for (let j = i + 1; j < n; j++) {
      if (B[i][j] === 0n) continue;
      colAdd(i, j, elimFactor(B[i][j], pivot, d));
    }
    // 行消元
    for (let r = i + 1; r < m; r++) {
      if (B[r][i] === 0n) continue;
      rowAdd(i, r, elimFactor(B[r][i], pivot, d));
    }

    diag.push(d);
    i++;
  }

  return { r: i, diag, pivots, V, rowOps };
}

function applyRowOps(b: bigint[], ops: RowOp[], M: bigint): bigint[] {
  const c = b.slice();
  for (const op of ops) {
    if (op.type === 'swap') {
      const t = c[op.i];
      c[op.i] = c[op.j];
      c[op.j] = t;
    } else {
      c[op.to] = mod2(c[op.to] - op.f * c[op.from], M);
    }
  }
  return c.map((v) => mod2(v, M));
}

function matVec(V: bigint[][], y: bigint[], M: bigint): bigint[] {
  return V.map((row) => mod2(row.reduce((acc, v, j) => acc + v * y[j], 0n), M));
}

/**
 * 在陪集 x0 + ⟨W 列⟩ 中按寄存器顺序贪心求字典序最小向量；
 * 当 forcedPos >= 0 时，在该坐标不取最小而取次小可取值
 * （其余坐标仍取最小），用于得到第二份见证。
 *
 * 关键事实：前缀已锁定坐标后，当前坐标上可叠加的取值是 Z/2^k
 * 的子群，必为 2^s·Z；余数最小者即该坐标最小选择。锁定坐标后，
 * 把生成矩阵收缩为该行泛函的完整核（补偿列 + 周期列）。
 */
function greedyWitness(
  x0: bigint[],
  W0: bigint[][],
  k: number,
  forcedPos: number,
): { x: bigint[]; lastFree: number } {
  const n = x0.length;
  const M = pow2(k);
  let G = W0.map((row) => row.slice());
  const g = new Array<bigint>(n).fill(0n);
  let lastFree = -1;

  for (let p = 0; p < n; p++) {
    // s = 当前坐标投影子群的赋值 = 该行元素的最小 v2
    let s = k;
    let jstar = -1;
    for (let j = 0; j < G[0].length; j++) {
      const v = valuation(G[p][j], k);
      if (v < s) {
        s = v;
        jstar = j;
      }
    }

    const cur = mod2(x0[p] + g[p], M);

    if (s < k) {
      lastFree = p;
      const len = k - s;
      const pivotG = G[p][jstar]; // 2^s · 奇数
      const u = pivotG >> BigInt(s);
      const uInv = invOdd(u, len);
      const residue = cur & mask(s);
      const wanted = forcedPos === p ? residue + pow2(s) : residue;
      const a = mod2(wanted - cur, M); // 必被 2^s 整除
      const z = (((a >> BigInt(s)) & mask(len)) * uInv) & mask(len);
      for (let row = 0; row < n; row++) {
        g[row] = mod2(g[row] + G[row][jstar] * z, M);
      }

      // 收缩到 {z' : G[p]·z' = 0 (mod M)} 的完整生成元：
      //  对 l ≠ j*：补偿列 col_l - u_l·u^-1·col_*（低段自由方向）；
      //  对所有 l：周期列 2^(k-s)·col_l（高段方向）。
      const q = G[0].length;
      const newG: bigint[][] = Array.from({ length: n }, () => [] as bigint[]);
      for (let l = 0; l < q; l++) {
        if (l !== jstar) {
          const ul = G[p][l] >> BigInt(s);
          const c = (-ul * uInv) & mask(len);
          for (let row = 0; row < n; row++) {
            newG[row].push(mod2(G[row][l] + c * G[row][jstar], M));
          }
        }
      }
      const period = pow2(len);
      for (let l = 0; l < q; l++) {
        for (let row = 0; row < n; row++) {
          newG[row].push(mod2(G[row][l] * period, M));
        }
      }
      // 剔除全零列（如 period 恰为 M 时的周期列），避免列数虚增。
      G = newG.map((row) => row.slice());
      const cols = G[0].length;
      const kept: number[] = [];
      for (let l = 0; l < cols; l++) {
        for (let row = 0; row < n; row++) {
          if (G[row][l] !== 0n) {
            kept.push(l);
            break;
          }
        }
      }
      G = G.map((row) => kept.map((l) => row[l]));
    }
    // s === k：该行全为 0，坐标已被前缀唯一确定，无需收缩。
  }

  return { x: x0.map((v, i) => mod2(v + g[i], M)), lastFree };
}

function checkRows(A: bigint[][], b: bigint[], x: bigint[], M: bigint): RowCheck[] {
  return A.map((row, i) => {
    const sum = row.reduce((acc, a, j) => acc + a * x[j], 0n);
    const remainder = mod2(sum, M);
    return { row: i, sum, remainder, expected: b[i], match: remainder === b[i] };
  });
}

/** 求解；调用方应先确认 parseModel 的 valid 为真。 */
export function solve(model: ParsedModel): SolveOutcome {
  const { A, b, k, n, m, M } = model;
  const nf = analyze(A, k, n);
  const { r, diag, pivots, V, rowOps } = nf;

  const c = applyRowOps(b, rowOps, M);

  let consistent = true;
  for (let i = 0; i < r; i++) {
    if ((c[i] & mask(diag[i])) !== 0n) {
      consistent = false;
      break;
    }
  }
  if (consistent) {
    for (let i = r; i < m; i++) {
      if (c[i] !== 0n) {
        consistent = false;
        break;
      }
    }
  }

  if (!consistent) {
    return {
      verdict: 'none',
      count: '0',
      exponent: 0,
      witnesses: [],
      rank: r,
      pivotValuations: diag,
      checks: [],
    };
  }

  // 对角坐标 y 下的特解 t 与解陪集生成矩阵 W。
  const t = new Array<bigint>(n).fill(0n);
  const W = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));
  for (let j = 0; j < n; j++) {
    if (j < r) {
      const d = diag[j];
      const len = k - d;
      const u = pivots[j] >> BigInt(d);
      t[j] = ((c[j] >> BigInt(d)) * invOdd(u, len)) & mask(len);
      const q = pow2(k - d);
      for (let i = 0; i < n; i++) W[i][j] = mod2(V[i][j] * q, M);
    } else {
      for (let i = 0; i < n; i++) W[i][j] = V[i][j];
    }
  }
  const x0 = matVec(V, t, M);

  const exponent = diag.reduce((acc, d) => acc + d, 0) + k * (n - r);
  const count = exponent === 0 ? '1' : pow2(exponent).toString();

  const first = greedyWitness(x0, W, k, -1);
  const witnesses = [first.x];
  if (exponent > 0) {
    const second = greedyWitness(x0, W, k, first.lastFree);
    witnesses.push(second.x);
  }

  return {
    verdict: exponent === 0 ? 'unique' : 'many',
    count,
    exponent,
    witnesses,
    rank: r,
    pivotValuations: diag,
    checks: witnesses.map((x) => checkRows(A, b, x, M)),
  };
}
