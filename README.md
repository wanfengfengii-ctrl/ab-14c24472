# 标定记录复核台（Calibration Review Console）

纯前端 TypeScript/React 应用，用于复核「标定记录」：寄存器加权混合后只保留低位结果时，
**一组记录可能锁定全部参数，也可能对应许多组不同参数**。本台对模
`M = 2^k` 的线性同余方程组

```
Σ_j A[i][j]·x_j ≡ b[i] (mod M)
```

给出**精确**的完整参数向量计数与字典序见证，全部计算在浏览器本地完成，不调用任何业务后端。

- 未知寄存器 n：2–8；等式条数 m：1–12；位宽 k：1–16（M = 2^k，最大 65536）
- 每个参数、系数、结果均为 `[0, M-1]` 的整数
- 解数上限 2^128（全范围未约束），以 **bigint 十进制字符串**精确显示
- 裁决：数量 `0` → 无解；`1` → 唯一；`>1` → 多解
- 多解时给出按寄存器输入顺序（x₁ 为最高优先级）比较的**字典序最小两份完整见证**
- **不枚举 M^n 规模向量**：基于 Z/2^k 上的 2-adic Smith 消元
- 重复等式、全零等式合法且不重复计数
- 输入维度不匹配 / 非整数 / 越界精确定位到矩阵或向量单元
- 任一编辑或导入立即以当前输入重新裁决，旧裁决不同屏残留

## 算法

在局部主理想环 Z/2^k 上反复选取 2-adic 赋值（被 2 整除次数）最小的元素作枢轴，
经行/列交换与模逆精确消元得到对角因子 `2^d1, 2^d2, …, 2^dr`（行、列变换均幺模可逆）：

- 相容性：右端经同样行变换后必须被各枢轴因子整除，零行余数必须为 0；
- 解数：`2^(Σ d_i + k·(n-r))`，直接由指数精确计数，不产生候选枚举；
- 见证：列变换给出特解；解陪集的生成矩阵上，逐坐标利用「子群在某坐标的投影必为
  2^s·Z/2^k」贪心取最小余数，第二份见证在最靠后的可变动坐标取次小值后再贪心。

## 本地开发

```bash
npm ci
npm run dev        # 开发服务器
npm run test:run   # Vitest（含上千组小规模随机模型的暴力对拍）
npm run build      # tsc 类型检查 + Vite 构建到 dist/
npm run verify     # 一次性：测试 → 构建 → 临时托管 dist → HTTP 冒烟，退出码报告成败
```

## 导入 / 导出

JSON 两种形态（值可用数字或十进制字符串）：

```json
{ "k": 4, "A": [[2, 6], [12, 4]], "b": [4, 8] }
```

```json
{ "k": 4, "rows": [[2, 6, 4], [12, 4, 8]] }
```

## Docker

多阶段 Dockerfile：`deps` → `build` → `app`（nginx 纯静态，含 `/healthz` 健康检查）
与 `verify`（node 一次性服务）。

```bash
# 运行静态站点，宿主机端口可配置（默认 8080）
HOST_PORT=9090 docker compose up -d --build app
curl http://127.0.0.1:9090/healthz

# 一次性 verify：容器内跑 测试→构建→HTTP 冒烟，自行退出
docker compose build verify
docker compose run --rm verify; echo "exit=$?"   # 0 成功，非 0 失败
```

## 目录

```
src/lib/solver.ts      求解核心（解析、2-adic Smith、计数、见证、逐行回算）
src/lib/solver.test.ts 单元测试与暴力对拍
src/lib/portable.ts    导入/导出格式
src/App.tsx            复核台界面（编辑、导入、裁决、见证切换与回算）
scripts/verify.mjs     一次性 verify 编排
scripts/smoke.mjs      HTTP 冒烟
nginx.conf             静态站点与 /healthz
```
