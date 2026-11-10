# 速率检测（probe 模块契约）

## 1. 原则

发送端不知道接收端结果，只能由低到高逐级加压；接收端按档统计。
检测帧不用喷泉码：每帧独立、自带 CRC32，body 为由 (stepId, idx) 决定的伪随机字节，铺满该档规格的单帧净载荷。

## 2. 档位表（`src/probe/steps.ts`）

每档时长约 0.8 秒、至少 8 帧：`frames = max(8, ceil(fps × 0.8))`。8 帧时 7/8 = 87.5% 通过、6/8 = 75% 不通过，因此可明确区分 85% 阈值。
保守基准（各段共同起点）：6 fps(idx2)、N=48(idx1)、2 色(idx0)。各段的起点档是同一档，只发送一次，由各段共享。

| 段 | 变化维度 | 档（fpsIdx, nIdx, cIdx） |
| --- | --- | --- |
| A 帧率 | fps 从基准升到最高 | (2..8, 1, 0) |
| B 密度 | N 从基准升到最高 | (2, 1..4, 0) |
| C 颜色 | 颜色全部 4 档 | (2, 1, 0..3) |
| D 组合 | 三维同时爬升 | (2,1,0) (3,1,1) (4,2,1) (5,2,2) (6,3,2) (7,3,3) (8,4,3) |

共享的起点档只发一次，所以总共 19 个不同的档；每段按档位顺序（level）排列成一条“扫描序列”。

发送序列：`起始间隔帧(8) → A → 间隔(4) → B(去掉起点) → 间隔(4) → C(去掉起点) → 间隔(4) → D(去掉起点) → 结束帧(8)`。
间隔帧与结束帧为保守编码，以 4 fps 发送；检测帧按本档的 fps 发送。整个检测约 26 秒（`probeDurationSeconds()` 给出精确值，测试要求不超过 30 秒）。

## 3. 接收端统计

`createProbeTally()`：按 `(transferId, stepId)` 统计不同的 `idx` 数（重复帧不重复计数）。
本档成功率 = `passed / total`，`total` 取帧头里的本档总帧数；从未见过的档位按 `total = 本档帧数`、`passed = 0` 计。

```ts
type StepResult = { stepId; seg: 0|1|2|3; fpsIdx; nIdx; cIdx; total: number; passed: number };
```

## 4. 推荐算法（`recommend(results)`）

常量：`PASS_RATE = 0.85`，`RELIABLE_RATE = 0.95`，`LT_OVERHEAD = 0.25`。

吞吐：`throughput(f,n,c,rate) = (capacityBytes(n,c) - 4) * FPS_LEVELS[f] * rate`（字节/秒）。

1. 对 A/B/C/D 各段，阈值档 = 沿该段扫描序列、从第 0 档（起点）起，连续满足 `rate ≥ PASS_RATE` 的最高档（第 0 档不通过则阈值档取 0 并标记 `poor`）。
   取“连续前缀”而非“任意最高通过档”，以免个别偶然通过的高档误导。
2. 每一档本身就是一个完整的、被实测过的配置（帧率、密度、颜色）。候选 = 各段扫描序列中，从起点档起连续满足 `rate ≥ PASS_RATE` 的那些档（孤立的偶然通过不计）。
3. 每档带宽 `bandwidth = (capacityBytes(n,c) - 4) * FPS_LEVELS[f] * rate`（字节/秒），接收端对每一档都显示。
4. 成功率优先（重发代价高）：候选中成功率 ≥ `RELIABLE_RATE = 0.95` 的档先选出，其中带宽最高者胜出（并列取更保守者）。若没有任何一档达到 95%，则在候选中先比成功率，再比带宽。不再外推未测过的组合，也不再额外降档。
5. 纠错比例：推荐档的丢帧率 `p = 1 - 该档成功率`，
   `r = (LT_OVERHEAD + p) / (1 - p)`，取 `REDUNDANCY_LEVELS` 中不小于 `r` 的最小档，超过 100% 取 100%。
6. 若起点档也未通过，返回保守默认 (fps4, N48, 2 色) 并 `poor = true`。

输出：

```ts
type Recommendation = {
  fpsIdx; nIdx; cIdx; redundancyIdx;
  fps; gridSize; colors; redundancy;      // 数值形式
  expectedBytesPerSec: number;
  lossRate: number;
  poor: boolean;
  thresholds: { A: number; B: number; C: number; D: number };  // A/B/C 为通过的最高 fpsIdx/nIdx/cIdx，D 为组合序列中的档位序号
};
```
