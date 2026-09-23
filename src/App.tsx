import { useMemo, useRef, useState } from 'react';
import { LIMITS, parseModel, solve, type Issue } from './lib/solver';
import { parseImport, serializeModel } from './lib/portable';

const PRESETS: Record<string, { k: string; cells: string[][] }> = {
  '偶数系数·倍数解': {
    k: '4',
    cells: [
      ['2', '6', '4'],
      ['12', '4', '8'],
    ],
  },
  '相互冗余': {
    k: '4',
    cells: [
      ['2', '4', '6'],
      ['6', '12', '2'],
      ['8', '0', '8'],
    ],
  },
  '矛盾记录': {
    k: '3',
    cells: [
      ['2', '0', '1'],
      ['0', '4', '0'],
    ],
  },
  '全范围未约束': {
    k: '16',
    cells: [
      ['0', '0', '0', '0', '0', '0', '0', '0', '0'],
      ['0', '0', '0', '0', '0', '0', '0', '0', '0'],
    ],
  },
};

type Cells = string[][];

function resizeCells(cells: Cells, m: number, n: number): Cells {
  const next = Array.from({ length: m }, (_, i) => {
    const old = cells[Math.min(i, cells.length - 1)] ?? [];
    const row: string[] = [];
    for (let j = 0; j < n + 1; j++) row.push(old[j] ?? '0');
    return row;
  });
  return next;
}

const issueLabel: Record<Issue['kind'], string> = {
  empty: '空',
  'not-integer': '非整数',
  'out-of-range': '越界',
};

export default function App() {
  const [k, setK] = useState('4');
  const [cells, setCells] = useState<Cells>(PRESETS['偶数系数·倍数解'].cells);
  const [witnessIdx, setWitnessIdx] = useState(0);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const n = cells[0].length - 1;
  const m = cells.length;

  // 裁决完全由当前输入同步派生：编辑任一处都会在同一次渲染中
  // 替换整个裁决结果，旧裁决不可能残留在界面上。
  const parsed = useMemo(() => parseModel({ k, cells }), [k, cells]);
  const outcome = useMemo(() => (parsed.valid ? solve(parsed) : null), [parsed]);

  const issueMap = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const is of parsed.issues) map.set(`${is.row}:${is.col ?? 'b'}`, is);
    return map;
  }, [parsed]);

  const updateCell = (i: number, j: number, value: string) => {
    setCells((prev) => prev.map((row, ri) => (ri === i ? row.map((c, cj) => (cj === j ? value : c)) : row)));
  };

  const changeN = (raw: number) => {
    const newN = Math.min(LIMITS.MAX_N, Math.max(LIMITS.MIN_N, Math.trunc(raw) || LIMITS.MIN_N));
    setCells((prev) => resizeCells(prev, prev.length, newN));
  };
  const changeM = (raw: number) => {
    const newM = Math.min(LIMITS.MAX_M, Math.max(LIMITS.MIN_M, Math.trunc(raw) || LIMITS.MIN_M));
    setCells((prev) => resizeCells(prev, newM, prev[0].length - 1));
  };

  const loadPreset = (key: string) => {
    const p = PRESETS[key];
    setK(p.k);
    setCells(p.cells.map((r) => r.slice()));
    setWitnessIdx(0);
  };

  const doImport = (text: string) => {
    try {
      const port = parseImport(text);
      setK(port.k);
      setCells(port.cells);
      setWitnessIdx(0);
      setImportError(null);
      setShowImport(false);
      setImportText('');
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => doImport(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const exportFile = () => {
    const blob = new Blob([serializeModel(k, cells)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calibration-model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const witness = outcome && witnessIdx < outcome.witnesses.length ? outcome.witnesses[witnessIdx] : null;
  const checks = outcome && witnessIdx < outcome.checks.length ? outcome.checks[witnessIdx] : null;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>标定记录复核台</h1>
          <p className="subtitle">
            模 2^k 线性同余方程组 · 完整参数向量精确计数与字典序见证 · 全部计算在浏览器本地完成，不调用业务后端
          </p>
        </div>
        <div className="topbar-actions">
          <select onChange={(e) => e.target.value && loadPreset(e.target.value)} defaultValue="" title="载入示例记录">
            <option value="" disabled>
              载入示例…
            </option>
            {Object.keys(PRESETS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <button onClick={() => setShowImport(true)}>导入 JSON</button>
          <button onClick={exportFile} disabled={!parsed.valid}>
            导出 JSON
          </button>
        </div>
      </header>

      <section className="panel controls">
        <label className="control">
          位宽 k
          <input
            className={parsed.k ? '' : 'bad'}
            value={k}
            inputMode="numeric"
            onChange={(e) => setK(e.target.value)}
          />
          <span className="hint">
            {LIMITS.MIN_K}–{LIMITS.MAX_K}，M = 2^{k || 'k'}
            {parsed.valid ? ` = ${parsed.M.toString()}` : ''}
          </span>
        </label>
        <label className="control">
          未知寄存器 n
          <input
            type="number"
            min={LIMITS.MIN_N}
            max={LIMITS.MAX_N}
            value={n}
            onChange={(e) => changeN(Number(e.target.value))}
          />
          <span className="hint">
            {LIMITS.MIN_N}–{LIMITS.MAX_N}
          </span>
        </label>
        <label className="control">
          等式条数 m
          <input
            type="number"
            min={LIMITS.MIN_M}
            max={LIMITS.MAX_M}
            value={m}
            onChange={(e) => changeM(Number(e.target.value))}
          />
          <span className="hint">
            {LIMITS.MIN_M}–{LIMITS.MAX_M}
          </span>
        </label>
        <div className="control grow-note">
          任一单元被编辑，旧裁决立即随该次输入变更撤下，并由当前输入重新裁决（无网络请求）。
        </div>
      </section>

      {parsed.structural.length > 0 && (
        <section className="panel errors">
          <h2>结构性问题</h2>
          <ul>
            {parsed.structural.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>系数矩阵 A 与结果向量 b（每行末列为该等式余数要求）</h2>
        <div className="grid-wrap">
          <table className="editor">
            <thead>
              <tr>
                <th className="rowhead">#</th>
                {Array.from({ length: n }, (_, j) => (
                  <th key={j}>
                    x<sub>{j + 1}</sub> 系数
                  </th>
                ))}
                <th className="bcol">结果 b</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((row, i) => (
                <tr key={i}>
                  <td className="rowhead">{i + 1}</td>
                  {row.slice(0, n).map((v, j) => {
                    const is = issueMap.get(`${i}:${j}`);
                    return (
                      <td key={j}>
                        <input
                          className={is ? `cell bad-${is.kind}` : 'cell'}
                          value={v}
                          inputMode="numeric"
                          title={is?.message}
                          onChange={(e) => updateCell(i, j, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="bcol">
                    {(() => {
                      const is = issueMap.get(`${i}:b`);
                      return (
                        <input
                          className={is ? `cell bad-${is.kind}` : 'cell cell-b'}
                          value={row[n] ?? ''}
                          inputMode="numeric"
                          title={is?.message}
                          onChange={(e) => updateCell(i, n, e.target.value)}
                        />
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {parsed.issues.length > 0 && (
          <div className="cell-errors">
            <h3>单元问题（已定位到矩阵 / 向量单元）</h3>
            <ul>
              {parsed.issues.map((is, idx) => (
                <li key={idx}>
                  <span className={`tag tag-${is.kind}`}>{issueLabel[is.kind]}</span>
                  第 {is.row + 1} 行 · {is.col === null ? '结果向量 b' : `系数列 x${is.col + 1}`}：{is.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="panel verdict-panel">
        <h2>裁决</h2>
        {!parsed.valid ? (
          <div className="verdict v-blocked">
            <strong>输入存在问题，无法作出裁决。</strong>
            <span>修正上述结构或单元问题后自动复核；当前不保留任何旧裁决。</span>
          </div>
        ) : outcome && outcome.verdict === 'none' ? (
          <div className="verdict v-none">
            <span className="badge">无解</span>
            <div>
              <div className="count-line">
                不同完整参数向量数量 = <code>0</code>
              </div>
              <div className="explain">
                模 {parsed.M.toString()} 下方程组矛盾（消元后出现 0·x ≡ 非零余数，或右端不被枢轴因子整除），
                无任何参数组合可满足全部 {m} 条等式。
              </div>
            </div>
          </div>
        ) : outcome && outcome.verdict === 'unique' ? (
          <div className="verdict v-unique">
            <span className="badge">唯一</span>
            <div>
              <div className="count-line">
                不同完整参数向量数量 = <code>1</code>
              </div>
              <div className="explain">
                该组记录锁定全部 {n} 个寄存器，秩 {outcome.rank}，枢轴赋值
                [{outcome.pivotValuations.join(', ')}] 全为 0（奇单位），解空间只有一个点。
              </div>
            </div>
          </div>
        ) : outcome ? (
          <div className="verdict v-many">
            <span className="badge">多解</span>
            <div>
              <div className="count-line">
                不同完整参数向量数量 = <code className="bigcount">{outcome.count}</code>
                <span className="count-exp">
                  {' '}
                  = 2^
                  {outcome.exponent}
                  {outcome.exponent > 0 && (
                    <span className="explain-inline">
                      {' '}
                      （= 2^(枢轴赋值和 {outcome.pivotValuations.reduce((a, b2) => a + b2, 0)} + k·自由变量{' '}
                      {n - outcome.rank})）
                    </span>
                  )}
                </span>
              </div>
              <div className="explain">
                计数未枚举任何候选向量；该组记录对应 {outcome.count} 组不同参数，一次试算成功不能当作唯一校准。
              </div>
            </div>
          </div>
        ) : null}

        {parsed.valid && (
          <div className="meta-line">
            秩 {outcome?.rank ?? '—'} · 枢轴赋值 [{outcome?.pivotValuations.join(', ') ?? '—'}] · 模数 M ={' '}
            {parsed.M.toString()}
          </div>
        )}
      </section>

      {outcome && outcome.witnesses.length > 0 && (
        <section className="panel">
          <h2>完整参数见证与逐行回算</h2>
          <div className="witness-switch">
            <button
              className={witnessIdx === 0 ? 'active' : ''}
              onClick={() => setWitnessIdx(0)}
            >
              见证 A · 字典序最小
            </button>
            {outcome.witnesses.length > 1 && (
              <button
                className={witnessIdx === 1 ? 'active' : ''}
                onClick={() => setWitnessIdx(1)}
              >
                见证 B · 次小完整向量
              </button>
            )}
          </div>

          {witness && (
            <div className="witness-vector">
              <span className="wv-label">
                {witnessIdx === 0 ? '最小见证' : '次小见证'} (x₁…x<sub>{n}</sub>) =
              </span>
              <ol className="vector">
                {witness.map((v, j) => (
                  <li key={j}>
                    <span className="reg">x{j + 1}</span>
                    <code>{v.toString()}</code>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {checks && witness && (
            <table className="recompute">
              <thead>
                <tr>
                  <th>行</th>
                  <th>回算（代入当前见证）</th>
                  <th>余数</th>
                  <th>期望</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => (
                  <tr key={i} className={c.match ? 'ok' : 'fail'}>
                    <td className="rowhead">{c.row + 1}</td>
                    <td className="formula">
                      {parsed.A[c.row].map((a, j) => (
                        <span key={j}>
                          {j > 0 && ' + '}
                          {a.toString()}×{witness[j].toString()}
                        </span>
                      ))}
                      {' = '}
                      <span className="sum">{c.sum.toString()}</span>
                    </td>
                    <td>
                      <code>{c.remainder.toString()}</code>
                    </td>
                    <td>
                      <code>{c.expected.toString()}</code>
                    </td>
                    <td>{c.match ? '✓ 一致' : '✗ 不符'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note">
            回算直接以 bigint 求乘积和再取模 {parsed.valid ? parsed.M.toString() : ''}：
            「和」展示未取模的真实乘积和，余数与期望值逐行比对。重复等式与全零等式照常逐行回算，计数时只按解空间计一次。
          </p>
        </section>
      )}

      {showImport && (
        <div className="modal-mask" onClick={() => setShowImport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>导入模型 JSON</h2>
            <p className="hint">
              形态一：{'{ "k": 4, "A": [[..系数..]], "b": [..结果..] }'}；形态二：{'{ "k": 4, "rows": [[..系数.., 结果]] }'}。
            </p>
            <textarea
              rows={10}
              value={importText}
              placeholder='{"k":4,"A":[[2,6]],"b":[4]}'
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(null);
              }}
            />
            {importError && <div className="import-error">{importError}</div>}
            <div className="modal-actions">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = '';
                }}
              />
              <button onClick={() => fileRef.current?.click()}>选择文件…</button>
              <button className="primary" disabled={!importText.trim()} onClick={() => doImport(importText)}>
                导入并复核
              </button>
              <button onClick={() => setShowImport(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        纯前端静态应用 · 计算基于 Z/2^k 上的 2-adic Smith 消元，解数 = 2^(枢轴赋值和 + k·自由变量数)，
        不枚举 M^n 规模向量。
      </footer>
    </div>
  );
}
