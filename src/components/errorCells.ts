import type { CellError } from '../solver/parse';

/** 计算需要高亮的错误单元集合，键形如 `${scope}:${row}:${col}` */
export function errorCellSet(errors: CellError[]): Set<string> {
  const set = new Set<string>();
  for (const e of errors) {
    if (e.scope === 'matrix' && e.row >= 0 && e.col >= 0) {
      set.add(`${e.row}:${e.col}`);
    }
  }
  return set;
}

export function vectorErrorRows(errors: CellError[]): Set<number> {
  const set = new Set<number>();
  for (const e of errors) {
    if (e.scope === 'vector' && e.row >= 0) set.add(e.row);
  }
  return set;
}
