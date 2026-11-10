# 喷泉码（fountain 模块契约）

LT 码，鲁棒孤子分布，peeling 解码。

## 编码

- 文件按 `blockSize` 切成 K 块，末块补 0。
- 种子 `seed`(u32) 经 splitmix32 初始化 mulberry32 PRNG：先抽度数 d（对鲁棒孤子 CDF 做二分），再抽 d 个互不相同的块序号。
  同一 (K, seed) 在发送端与接收端必然得到相同的块集合。
- 编码块 = 所选源块的逐字节异或。
- 鲁棒孤子参数：`c = 0.1`，`δ = 0.5`。

## 解码

增量 peeling：新编码块先用已解出的源块约去，剩 1 个未知则解出并传播；
重复种子直接忽略；顺序无关；丢失不影响正确性（只影响所需帧数）。

## 开销说明

纯 LT 码需要略多于 K 个编码块才能解出，K 越小相对开销越大（实测均值：K=50 约 +38%，K=200 约 +30%，K=1000 约 +19%）。
发送端永远持续产生新符号，所以不会出现“冗余不够、必须重发”；接收端用 `expectedSymbols(K)`（均值加约 5% 余量）估算进度和剩余时间。
解码进度以“已收到的不同帧数”衡量（同一帧被相机重复拍到不计），`add()` 返回该符号是否为新符号。

## 接口

```ts
splitIntoBlocks(data: Uint8Array, blockSize: number): Uint8Array[]
symbolIndices(k: number, seed: number): number[]
createLtEncoder(blocks: Uint8Array[]): { encode(seed: number): Uint8Array }
createLtDecoder(k: number, blockSize: number): {
  add(seed: number, data: Uint8Array): boolean;   // 是否为新符号
  receivedCount(): number;                         // 不同符号数
  isComplete(): boolean;
  solvedCount(): number;
  assemble(fileSize: number): Uint8Array | null;   // 未完成返回 null
}
```
