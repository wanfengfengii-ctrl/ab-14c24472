import { useState } from 'react';
import type { SolveResult } from '../solver/solve';

const VERDICT_TEXT: Record<SolveResult['verdict'], string> = {
  none: '无解',
  unique: '唯一解',
  multiple: '多解',
};

export function VerdictPanel({ result }: { result: SolveResult }) {
  return (
    <div className="panel">
      <h2>裁决</h2>
      <div className="verdict">
        <span className={`badge ${result.verdict}`}>{VERDICT_TEXT[result.verdict]}</span>
        <span className="count-line">
          全部不同完整参数向量数量 = <strong>{result.count}</strong>
        </span>
        {result.pivots.length > 0 && (
          <span className="count-line">
            主元 2-adic 赋值 e = [{result.pivots.join(', ')}]
          </span>
        )}
      </div>
      {result.verdict === 'multiple' && (
        <div className="pivot-note">
          计数公式 2^(Σeᵢ + k·自由变量数)；以下仅展示按寄存器输入顺序（x₀, x₁, …）字典序最小的两份见证，
          未枚举全部向量。
        </div>
      )}
    </div>
  );
}

function WitnessVector({ x }: { x: bigint[] }) {
  return (
    <div className="vector-box">
      (
      {x.map((v, j) => (
        <span key={j}>
          <span className="reg">x{j}=</span>
          <span className="val">{v.toString(10)}</span>
          {j < x.length - 1 ? ', ' : ''}
        </span>
      ))}
      )
    </div>
  );
}

function RecheckTable({
  result,
  witnessIndex,
  A,
  k,
}: {
  result: SolveResult;
  witnessIndex: number;
  A: bigint[][];
  k: number;
}) {
  const w = result.witnesses[witnessIndex];
  const rechecks = result.rechecks[witnessIndex];
  const M = 1n << BigInt(k);
  return (
    <div>
      <WitnessVector x={w} />
      <table className="recheck">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>等式</th>
            <th>点积（精确整数）</th>
            <th>点积 mod M</th>
            <th>期望值 b</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {rechecks.map((rc, i) => (
            <tr key={i}>
              <td className="expr">
                eq{i + 1}: {A[i].map((a, j) => `${a}·x${j}`).join(' + ')}
              </td>
              <td>{rc.dot.toString(10)}</td>
              <td>{rc.remainder.toString(10)}</td>
              <td>{rc.expected.toString(10)}</td>
              <td className={rc.pass ? 'pass-yes' : 'pass-no'}>
                {rc.pass ? '✓ 吻合' : '✗ 不符'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pivot-note">M = 2^{k} = {M.toString(10)}；余数 = 点积除以 M 所得余数。</div>
    </div>
  );
}

export function WitnessPanel({ result, A, k }: { result: SolveResult; A: bigint[][]; k: number }) {
  const [tab, setTab] = useState(0);
  if (result.witnesses.length === 0) {
    return (
      <div className="panel">
        <h2>见证与逐行回算</h2>
        <div className="pivot-note">系统无解，不存在可回算的完整参数向量。</div>
      </div>
    );
  }
  // 输入变化导致见证数量减少时，旧页签立即失效（不展示陈旧见证）
  const safeTab = Math.min(tab, result.witnesses.length - 1);
  return (
    <div className="panel">
      <h2>完整参数见证与逐行回算</h2>
      <div className="tabs">
        {result.witnesses.map((_, idx) => (
          <button
            key={idx}
            className={safeTab === idx ? 'active' : ''}
            onClick={() => setTab(idx)}
          >
            见证 {idx + 1}（字典序第 {idx + 1} 小）
          </button>
        ))}
      </div>
      <RecheckTable result={result} witnessIndex={safeTab} A={A} k={k} />
    </div>
  );
}
