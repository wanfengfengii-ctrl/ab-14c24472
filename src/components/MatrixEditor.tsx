import type { CellText } from '../solver/parse';

interface Props {
  matrix: CellText[][];
  vector: CellText[];
  n: number;
  m: number;
  k: number;
  badCells: Set<string>;
  badVectorRows: Set<number>;
  onChangeCell: (i: number, j: number, value: string) => void;
  onChangeVector: (i: number, value: string) => void;
}

export function MatrixEditor({
  matrix,
  vector,
  n,
  m,
  k,
  badCells,
  badVectorRows,
  onChangeCell,
  onChangeVector,
}: Props) {
  return (
    <div>
      <table className="sys">
        <thead>
          <tr>
            <th></th>
            {Array.from({ length: n }, (_, j) => (
              <th key={j}>x<sub>{j}</sub> · r{j}</th>
            ))}
            <th></th>
            <th>b<sub>i</sub></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: m }, (_, i) => (
            <tr key={i}>
              <td className="rowidx">eq{i + 1}</td>
              {Array.from({ length: n }, (_, j) => (
                <td key={j}>
                  <input
                    className={`cell ${badCells.has(`${i}:${j}`) ? 'bad' : ''}`}
                    value={String(matrix[i]?.[j] ?? '')}
                    onChange={(e) => onChangeCell(i, j, e.target.value)}
                    aria-label={`矩阵第 ${i + 1} 行第 ${j + 1} 列`}
                  />
                </td>
            ))}
              <td className="op">≡</td>
              <td>
                <input
                  className={`cell ${badVectorRows.has(i) ? 'bad' : ''}`}
                  value={String(vector[i] ?? '')}
                  onChange={(e) => onChangeVector(i, e.target.value)}
                  aria-label={`结果第 ${i + 1} 行`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pivot-note">
        每个参数、系数与结果必须是 0..{2 ** k - 1} 的整数；所有计算在浏览器本地完成（M = 2^{k}）。
      </div>
    </div>
  );
}
