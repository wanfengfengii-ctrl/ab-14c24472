/**
 * 导入/导出格式。
 * 支持两种 JSON 形态：
 *   { "k": 4, "A": [[..系数..]], "b": [..结果..] }
 *   { "k": 4, "rows": [[..系数.., 结果], ...] }
 * 数值允许是数字或十进制字符串（位宽最大 16，普通数字精度足够，
 * 但字符串可避免任何精度疑虑）。
 */

export interface PortableModel {
  k: string;
  cells: string[][];
}

export function serializeModel(k: string, cells: string[][]): string {
  const n = cells[0]?.length ? cells[0].length - 1 : 0;
  const A = cells.map((row) => row.slice(0, n).map((v) => v.trim()));
  const b = cells.map((row) => (row[n] ?? '').trim());
  return JSON.stringify({ k: Number(k), A, b }, null, 2);
}

function asText(v: unknown, where: string): string {
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'string' && /^[+-]?\d+$/.test(v.trim())) return v.trim();
  throw new Error(`${where} 的值 ${JSON.stringify(v)} 不是整数`);
}

export function parseImport(text: string): PortableModel {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('不是合法 JSON：' + (e as Error).message);
  }
  if (typeof data !== 'object' || data === null) throw new Error('顶层必须是对象。');
  const obj = data as Record<string, unknown>;

  if (!('k' in obj)) throw new Error('缺少位宽字段 "k"。');
  const k = asText(obj.k, '位宽 k');

  let cells: string[][];
  if (Array.isArray(obj.A) && Array.isArray(obj.b)) {
    const A = obj.A as unknown[];
    const b = obj.b as unknown[];
    if (A.length !== b.length) {
      throw new Error(`矩阵 A 有 ${A.length} 行而结果 b 有 ${b.length} 行，维度不匹配。`);
    }
    cells = A.map((rawRow, i) => {
      if (!Array.isArray(rawRow)) throw new Error(`A 的第 ${i + 1} 行不是数组。`);
      return [...rawRow.map((v, j) => asText(v, `A 第 ${i + 1} 行第 ${j + 1} 列`)), asText(b[i], `b 第 ${i + 1} 项`)];
    });
  } else if (Array.isArray(obj.rows)) {
    cells = (obj.rows as unknown[]).map((rawRow, i) => {
      if (!Array.isArray(rawRow)) throw new Error(`rows 的第 ${i + 1} 行不是数组。`);
      return (rawRow as unknown[]).map((v, j) => asText(v, `rows 第 ${i + 1} 行第 ${j + 1} 列`));
    });
  } else {
    throw new Error('需要提供 "A" 与 "b"，或提供每行 [系数…, 结果] 的 "rows"。');
  }

  if (cells.length === 0) throw new Error('至少需要一条等式。');
  const width = cells[0].length;
  cells.forEach((row, i) => {
    if (row.length !== width) {
      throw new Error(`第 ${i + 1} 行有 ${row.length} 个单元，与首行 ${width} 个不一致。`);
    }
  });
  if (width < 3) throw new Error('每行至少包含 2 个系数与 1 个结果（共 3 个单元）。');

  return { k, cells };
}
