import { LIMITS } from '../solver/parse';

interface Props {
  k: number;
  n: number;
  m: number;
  onK: (v: number) => void;
  onN: (v: number) => void;
  onM: (v: number) => void;
}

export function ParamBar({ k, n, m, onK, onN, onM }: Props) {
  return (
    <div className="param-row">
      <label>
        位宽 k
        <input
          type="number"
          min={LIMITS.K_MIN}
          max={LIMITS.K_MAX}
          value={k}
          onChange={(e) => onK(Number(e.target.value))}
        />
      </label>
      <label>
        模数 M
        <input type="text" value={`2^${k} = ${2 ** k}`} disabled />
      </label>
      <label>
        寄存器数 n
        <input
          type="number"
          min={LIMITS.N_MIN}
          max={LIMITS.N_MAX}
          value={n}
          onChange={(e) => onN(Number(e.target.value))}
        />
      </label>
      <label>
        等式条数 m
        <input
          type="number"
          min={LIMITS.M_MIN}
          max={LIMITS.M_MAX}
          value={m}
          onChange={(e) => onM(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
