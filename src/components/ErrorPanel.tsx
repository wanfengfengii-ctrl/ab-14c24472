import type { CellError } from '../solver/parse';

const SCOPE_LABEL: Record<CellError['scope'], string> = {
  param: '参数',
  matrix: '矩阵',
  vector: '向量',
};

export function ErrorPanel({ errors }: { errors: CellError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="panel errors">
      <h2>输入错误（{errors.length}）——旧裁决已撤下，修复前不出具结论</h2>
      <ul>
        {errors.map((e, idx) => (
          <li key={idx}>
            <span className="err-tag">{SCOPE_LABEL[e.scope]}</span>
            {e.row >= 0 && e.scope === 'matrix' && e.col >= 0 && (
              <span>单元 (第 {e.row + 1} 行, 第 {e.col + 1} 列)：</span>
            )}
            {e.row >= 0 && e.scope === 'matrix' && e.col === -1 && (
              <span>第 {e.row + 1} 行：</span>
            )}
            {e.row >= 0 && e.scope === 'vector' && <span>第 {e.row + 1} 行：</span>}
            {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
