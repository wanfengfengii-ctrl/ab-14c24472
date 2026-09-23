import { useState } from 'react';
import { parseImportText, type RawSystem } from '../solver/parse';

interface Props {
  fallback: { n: number; m: number; k: number };
  onApply: (raw: RawSystem) => void;
}

const PLACEHOLDER = `# 支持 JSON 或每行一条等式的文本
# 文本：# k=3 n=2 声明位宽与寄存器数
1, 2 = 3
4 0 ; 5

# JSON：
# {"k":3,"n":2,"m":2,"A":[[1,2],[4,0]],"b":[3,5]}`;

export function ImportPanel({ fallback, onApply }: Props) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  const apply = () => {
    const parsed = parseImportText(text, fallback);
    if (parsed.error || parsed.raw === null) {
      setMsg({ kind: 'err', text: parsed.error ?? '解析失败' });
      return;
    }
    onApply(parsed.raw);
    setMsg({
      kind: 'ok',
      text: `已导入：k=${parsed.raw.k ?? '?'}，n=${parsed.raw.n ?? '?'}，m=${parsed.raw.m ?? '?'}；旧裁决已撤下。`,
    });
  };

  return (
    <details className="panel import-area">
      <summary>导入 / 导出（JSON 或文本等式）</summary>
      <textarea
        value={text}
        placeholder={PLACEHOLDER}
        onChange={(e) => {
          setText(e.target.value);
          setMsg(null);
        }}
      />
      <div className="button-row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={apply}>
          导入并替换当前输入
        </button>
      </div>
      {msg && <div className={`import-msg ${msg.kind}`}>{msg.text}</div>}
    </details>
  );
}
