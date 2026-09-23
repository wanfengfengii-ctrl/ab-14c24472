import { describe, it, expect } from 'vitest';
import { parseImport, serializeModel } from './portable';

describe('导入格式', () => {
  it('支持 {k, A, b} 形态，数字与字符串值均可', () => {
    const m = parseImport(JSON.stringify({ k: 4, A: [[1, 2], ['3', 0]], b: [5, '7'] }));
    expect(m.k).toBe('4');
    expect(m.cells).toEqual([
      ['1', '2', '5'],
      ['3', '0', '7'],
    ]);
  });

  it('支持 {k, rows} 形态', () => {
    const m = parseImport(JSON.stringify({ k: 3, rows: [[1, 2, 3], [0, 0, 0]] }));
    expect(m.cells).toEqual([
      ['1', '2', '3'],
      ['0', '0', '0'],
    ]);
  });

  it('A/b 行数不一致报错', () => {
    expect(() => parseImport(JSON.stringify({ k: 4, A: [[1, 2]], b: [1, 2] }))).toThrow(/维度不匹配/);
  });

  it('行宽不一致报错', () => {
    expect(() => parseImport(JSON.stringify({ k: 4, rows: [[1, 2, 3], [1, 2]] }))).toThrow(/第 2 行/);
  });

  it('非整数、非 JSON、缺字段均报错', () => {
    expect(() => parseImport('{bad')).toThrow(/JSON/);
    expect(() => parseImport(JSON.stringify({ A: [[1, 2]], b: [1] }))).toThrow(/k/);
    expect(() => parseImport(JSON.stringify({ k: 4, A: [['x', 2]], b: [1] }))).toThrow(/整数/);
    expect(() => parseImport(JSON.stringify({ k: 4, nope: 1 }))).toThrow(/A/);
  });

  it('至少两个寄存器（每行 ≥3 单元）', () => {
    expect(() => parseImport(JSON.stringify({ k: 4, rows: [[1, 2]] }))).toThrow(/2 个系数/);
  });

  it('导出可往返导入', () => {
    const cells = [
      ['2', '6', '4'],
      ['12', '4', '8'],
    ];
    const text = serializeModel('4', cells);
    const m = parseImport(text);
    expect(m.cells).toEqual(cells);
    expect(m.k).toBe('4');
  });
});
