import { useMemo, useState } from 'react';
import { ParamBar } from './components/ParamBar';
import { MatrixEditor } from './components/MatrixEditor';
import { ErrorPanel } from './components/ErrorPanel';
import { VerdictPanel, WitnessPanel } from './components/VerdictPanel';
import { ImportPanel } from './components/ImportPanel';
import { errorCellSet, vectorErrorRows } from './components/errorCells';
import { validateSystem, exportSystemJson, LIMITS, type RawSystem } from './solver/parse';
import { solveSystem } from './solver/solve';

function makeMatrix(m: number, n: number): string[][] {
  return Array.from({ length: m }, () => new Array<string>(n).fill('0'));
}

const PRESETS: { name: string; raw: RawSystem }[] = [
  {
    name: '唯一解（可逆）',
    raw: { k: 3, n: 2, m: 2, matrix: [['1', '2'], ['3', '1']], vector: ['5', '6'] },
  },
  {
    name: '偶数系数多解',
    raw: { k: 3, n: 2, m: 2, matrix: [['4', '2'], ['6', '2']], vector: ['2', '6'] },
  },
  {
    name: '矛盾（无解）',
    raw: { k: 3, n: 2, m: 3, matrix: [['1', '0'], ['0', '1'], ['1', '1']], vector: ['1', '1', '3'] },
  },
  {
    name: '重复与全零等式（全范围未约束）',
    raw: { k: 2, n: 2, m: 3, matrix: [['0', '0'], ['0', '0'], ['1', '1']], vector: ['0', '0', '0'] },
  },
];

export function App() {
  const [k, setK] = useState(3);
  const [n, setN] = useState(2);
  const [m, setM] = useState(2);
  const [matrix, setMatrix] = useState<string[][]>(() => makeMatrix(2, 2));
  const [vector, setVector] = useState<string[]>(() => ['0', '0']);

  const resize = (nextN: number, nextM: number): void => {
    setMatrix((prev) => {
      const rows = Array.from({ length: nextM }, (_, i) => {
            const old = prev[i] ?? [];
            return Array.from({ length: nextN }, (_, j) => old[j] ?? '0');
          });
      return rows;
    });
    setVector((prev) => Array.from({ length: nextM }, (_, i) => prev[i] ?? '0'));
  };

  const changeK = (v: number): void => {
    if (!Number.isFinite(v)) return;
    setK(Math.min(LIMITS.K_MAX, Math.max(LIMITS.K_MIN, Math.round(v))));
  };
  const changeN = (v: number): void => {
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(LIMITS.N_MAX, Math.max(LIMITS.N_MIN, Math.round(v)));
    setN(clamped);
    resize(clamped, m);
  };
  const changeM = (v: number): void => {
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(LIMITS.M_MAX, Math.max(LIMITS.M_MIN, Math.round(v)));
    setM(clamped);
    resize(n, clamped);
  };

  const changeCell = (i: number, j: number, value: string): void => {
    setMatrix((prev) => {
      const next = prev.map((row) => row.slice());
      if (!next[i]) next[i] = new Array<string>(n).fill('0');
      next[i][j] = value;
      return next;
    });
  };

  const changeVectorCell = (i: number, value: string): void => {
    setVector((prev) => {
      const next = prev.slice();
      next[i] = value;
      return next;
    });
  };

  const applyRaw = (raw: RawSystem): void => {
    const nextK = raw.k ?? k;
    const nextN = raw.n ?? n;
    const nextM = raw.m ?? m;
    setK(nextK);
    setN(nextN);
    setM(nextM);
    setMatrix(
      Array.from({ length: nextM }, (_, i) =>
        Array.from({ length: nextN }, (_, j) => String(raw.matrix[i]?.[j] ?? '0')),
      ),
    );
    setVector(Array.from({ length: nextM }, (_, i) => String(raw.vector[i] ?? '0')));
  };

  // 输入变化立即重新校验/计算；校验失败时不渲染任何旧裁决
  const validation = useMemo(
    () => validateSystem({ k, n, m, matrix, vector }),
    [k, n, m, matrix, vector],
  );

  const result = useMemo(
    () => (validation.system ? solveSystem(validation.system) : null),
    [validation],
  );

  const badCells = useMemo(() => errorCellSet(validation.errors), [validation.errors]);
  const badRows = useMemo(() => vectorErrorRows(validation.errors), [validation.errors]);

  const exportJson = (): void => {
    const text = exportSystemJson({ k, n, m, matrix, vector });
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    window.prompt('当前系统 JSON（已尝试复制到剪贴板）', text);
  };

  return (
    <div>
      <h1>寄存器加权混合复核台</h1>
      <p className="subtitle">
        模 M = 2^k 线性同余方程组审计：精确计数、无解/唯一/多解裁决、字典序最小见证与逐行回算。
        全部计算在浏览器本地完成，不调用任何业务后端。
      </p>

      <div className="panel">
        <h2>参数</h2>
        <ParamBar k={k} n={n} m={m} onK={changeK} onN={changeN} onM={changeM} />
        <div className="button-row" style={{ marginTop: 12 }}>
          {PRESETS.map((p) => (
            <button key={p.name} onClick={() => applyRaw(p.raw)}>
              {p.name}
            </button>
          ))}
          <button onClick={exportJson}>导出 JSON</button>
        </div>
      </div>

      <ImportPanel fallback={{ n, m, k }} onApply={applyRaw} />

      <div className="panel">
        <h2>系数矩阵 A 与结果向量 b</h2>
        <MatrixEditor
          matrix={matrix}
          vector={vector}
          n={n}
          m={m}
          k={k}
          badCells={badCells}
          badVectorRows={badRows}
          onChangeCell={changeCell}
          onChangeVector={changeVectorCell}
        />
      </div>

      <ErrorPanel errors={validation.errors} />

      {result && (
        <>
          <VerdictPanel result={result} />
          {validation.system && (
            <WitnessPanel result={result} A={validation.system.A} k={k} />
          )}
        </>
      )}
    </div>
  );
}
