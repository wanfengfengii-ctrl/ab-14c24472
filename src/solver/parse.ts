// 输入校验与导入解析：所有错误定位到参数或具体的矩阵/向量单元。

export type ErrorScope = 'param' | 'matrix' | 'vector';

export interface CellError {
  scope: ErrorScope;
  /** 行号（0 基）；参数级错误为 -1 */
  row: number;
  /** 列号（0 基，矩阵）；向量或行级错误为 -1 */
  col: number;
  message: string;
}

export interface RawSystem {
  k: number | null;
  n: number | null;
  m: number | null;
  /** m 行 × n 列的原始文本（导入时行列数可能暂时不匹配） */
  matrix: CellText[][];
  /** 结果向量原始文本 */
  vector: CellText[];
}

/** 单元允许是字符串（表格）或 number/bigint（编程式构造/导入） */
export type CellText = string | number | bigint;

function cellText(v: CellText): string {
  if (typeof v === 'string') return v.trim();
  return v.toString(10);
}

import type { SystemInput } from './solve';

const N_MIN = 2;
const N_MAX = 8;
const M_MIN = 1;
const M_MAX = 12;
const K_MIN = 1;
const K_MAX = 16;

export const LIMITS = { N_MIN, N_MAX, M_MIN, M_MAX, K_MIN, K_MAX };

function isIntLiteral(s: string): boolean {
  return /^[+-]?\d+$/.test(s);
}

export interface ValidationOutcome {
  errors: CellError[];
  system: SystemInput | null;
}

export function validateSystem(raw: RawSystem): ValidationOutcome {
  const errors: CellError[] = [];

  const k = raw.k;
  const n = raw.n;
  const m = raw.m;

  if (k === null || !Number.isInteger(k) || k < K_MIN || k > K_MAX) {
    errors.push({ scope: 'param', row: -1, col: -1, message: `位宽 k 必须是 ${K_MIN}..${K_MAX} 的整数` });
  }
  if (n === null || !Number.isInteger(n) || n < N_MIN || n > N_MAX) {
    errors.push({ scope: 'param', row: -1, col: -1, message: `寄存器个数 n 必须是 ${N_MIN}..${N_MAX} 的整数` });
  }
  if (m === null || !Number.isInteger(m) || m < M_MIN || m > M_MAX) {
    errors.push({ scope: 'param', row: -1, col: -1, message: `等式条数 m 必须是 ${M_MIN}..${M_MAX} 的整数` });
  }

  // 参数非法时无法确定模数与维度，只报参数错误
  if (errors.length > 0) return { errors, system: null };

  const K = k as number;
  const N = n as number;
  const Mrows = m as number;
  const mod = 1n << BigInt(K);
  const maxVal = mod - 1n;

  const A: bigint[][] = [];
  const b: bigint[] = [];

  // ---- 矩阵维度 ----
  if (raw.matrix.length !== Mrows) {
    errors.push({
      scope: 'matrix',
      row: Math.min(raw.matrix.length, Mrows),
      col: -1,
      message: `矩阵行数 ${raw.matrix.length} 与等式条数 m=${Mrows} 不匹配`,
    });
  }

  for (let i = 0; i < Math.min(raw.matrix.length, Mrows); i++) {
    const rowCells = raw.matrix[i] ?? [];
    const rowVals: bigint[] = [];
    if (rowCells.length !== N) {
      errors.push({
        scope: 'matrix',
        row: i,
        col: -1,
        message: `第 ${i + 1} 行有 ${rowCells.length} 个系数，应为 n=${N} 个（维度不匹配）`,
      });
    }
    for (let j = 0; j < Math.min(rowCells.length, N); j++) {
      const text = cellText(rowCells[j]);
      if (text === '') {
        errors.push({ scope: 'matrix', row: i, col: j, message: '单元格为空' });
        continue;
      }
      if (!isIntLiteral(text)) {
        errors.push({ scope: 'matrix', row: i, col: j, message: `“${text}” 不是十进制整数` });
        continue;
      }
      let v: bigint;
      try {
        v = BigInt(text);
      } catch {
        errors.push({ scope: 'matrix', row: i, col: j, message: `“${text}” 不是合法整数` });
        continue;
      }
      if (v < 0n || v > maxVal) {
        errors.push({ scope: 'matrix', row: i, col: j, message: `数值 ${v} 越界，允许范围 0..${maxVal}（M=2^${K}）` });
        continue;
      }
      rowVals[j] = v;
    }
    A[i] = rowVals;
  }

  // ---- 结果向量 ----
  if (raw.vector.length !== Mrows) {
    errors.push({
      scope: 'vector',
      row: Math.min(raw.vector.length, Mrows),
      col: -1,
      message: `结果向量长度 ${raw.vector.length} 与等式条数 m=${Mrows} 不匹配`,
    });
  }
  for (let i = 0; i < Math.min(raw.vector.length, Mrows); i++) {
    const text = cellText(raw.vector[i] ?? '');
    if (text === '') {
      errors.push({ scope: 'vector', row: i, col: -1, message: '结果单元为空' });
      continue;
    }
    if (!isIntLiteral(text)) {
      errors.push({ scope: 'vector', row: i, col: -1, message: `“${text}” 不是十进制整数` });
      continue;
    }
    let v: bigint;
    try {
      v = BigInt(text);
    } catch {
      errors.push({ scope: 'vector', row: i, col: -1, message: `“${text}” 不是合法整数` });
      continue;
    }
    if (v < 0n || v > maxVal) {
      errors.push({ scope: 'vector', row: i, col: -1, message: `数值 ${v} 越界，允许范围 0..${maxVal}（M=2^${K}）` });
      continue;
    }
    b[i] = v;
  }

  if (errors.length > 0) return { errors, system: null };

  return {
    errors: [],
    system: { A, b, n: N, m: Mrows, k: K },
  };
}

// ---------------------------------------------------------------------------
// 导入 / 导出
// ---------------------------------------------------------------------------

export interface ParsedImport {
  raw: RawSystem | null;
  error: string | null;
}

/** JSON：{"k":3,"n":2,"m":2,"A":[[1,2],[3,4]],"b":[5,6]}；也接受 k,n,m 缺省 */
export function parseImportText(text: string, fallback: { n: number; m: number; k: number }): ParsedImport {
  const trimmed = text.trim();
  if (trimmed === '') return { raw: null, error: '导入内容为空' };

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (typeof obj !== 'object' || obj === null) return { raw: null, error: 'JSON 顶层必须是对象' };
      const o = obj as Record<string, unknown>;
      const k = o.k ?? fallback.k;
      const A = o.A;
      const b = o.b;
      if (!Array.isArray(A) || !Array.isArray(b)) {
        return { raw: null, error: 'JSON 必须包含数组字段 A 与 b' };
      }
      const m = (o.m as number | undefined) ?? A.length;
      const n = (o.n as number | undefined) ?? (A.length > 0 && Array.isArray(A[0]) ? (A[0] as unknown[]).length : fallback.n);

      const matrix = (A as unknown[]).map((row) => {
        if (!Array.isArray(row)) return [];
        return (row as unknown[]).map((v) => atomicToText(v));
      });
      const vector = (b as unknown[]).map((v) => atomicToText(v));
      return {
        raw: {
          k: toIntOrNull(k),
          n: toIntOrNull(n),
          m: toIntOrNull(m),
          matrix,
          vector,
        },
        error: null,
      };
    } catch (e) {
      return { raw: null, error: `JSON 解析失败：${(e as Error).message}` };
    }
  }

  // 文本格式：
  //   # k=3 n=2        （可选，# 开头为注释）
  //   1, 2 = 3         每行一条等式：系数（逗号或空白分隔），末列为结果
  //   4 0 ; 5          支持 =、; 作为结果分隔符，缺省时最后一个数字即结果
  const lines = trimmed.split(/\r?\n/);
  let k = fallback.k;
  let n: number | null = null;
  const matrix: string[][] = [];
  const vector: string[] = [];

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (line === '') continue;
    if (line.startsWith('#')) {
      const hk = /\bk\s*=\s*(\d+)/.exec(line);
      const hn = /\bn\s*=\s*(\d+)/.exec(line);
      if (hk) k = Number(hk[1]);
      if (hn) n = Number(hn[1]);
      continue;
    }
    // 结果分隔符支持 "=" 或 ";"；缺省时末个数字即结果
    let coeffTokens: string[];
    let resultToken: string;
    const sepIdx = line.search(/[=;]/);
    if (sepIdx >= 0) {
      coeffTokens = line
        .slice(0, sepIdx)
        .split(/[\s,]+/)
        .filter((t) => t !== '');
      const tail = line
        .slice(sepIdx + 1)
        .split(/[\s,]+/)
        .filter((t) => t !== '');
      if (tail.length !== 1) {
        return { raw: null, error: `行“${line}”分隔符后必须恰好有 1 个结果值` };
      }
      resultToken = tail[0];
    } else {
      const tokens = line.split(/[\s,]+/).filter((t) => t !== '');
      if (tokens.length < 2) {
        return { raw: null, error: `行“${line}”至少需要 1 个系数与 1 个结果` };
      }
      resultToken = tokens[tokens.length - 1];
      coeffTokens = tokens.slice(0, -1);
    }
    if (n === null) n = coeffTokens.length;
    matrix.push(coeffTokens);
    vector.push(resultToken);
  }

  if (matrix.length === 0) return { raw: null, error: '未解析到任何等式行' };
  if (n !== null && matrix.some((row) => row.length !== n)) {
    return { raw: null, error: `各行系数个数不一致（首个非注释行声明 n=${n}）` };
  }

  return {
    raw: {
      k,
      n,
      m: matrix.length,
      matrix,
      vector,
    },
    error: null,
  };
}

function atomicToText(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'bigint') return v.toString(10);
  if (typeof v === 'string') return v.trim();
  return '';
}

function toIntOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && /^[+-]?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export function exportSystemJson(raw: RawSystem): string {
  const norm = (cell: CellText): string => {
    const t = cellText(cell);
    return /^[+-]?\d+$/.test(t) ? BigInt(t).toString(10) : t;
  };
  const matrix = raw.matrix.map((row) => row.map(norm));
  const vector = raw.vector.map(norm);
  return JSON.stringify({ k: raw.k, n: raw.n, m: raw.m, A: matrix, b: vector }, null, 2);
}
