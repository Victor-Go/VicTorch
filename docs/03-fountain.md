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

纯 LT 码需要略多于 K 个编码块才能解出，K 越小相对开销越大。有限模式选 10% 纠错比例时失败概率不可忽略，
界面与推荐算法给出的纠错比例已包含该开销；要保证成功请用“一直发送”。

## 接口

```ts
splitIntoBlocks(data: Uint8Array, blockSize: number): Uint8Array[]
symbolIndices(k: number, seed: number): number[]
createLtEncoder(blocks: Uint8Array[]): { encode(seed: number): Uint8Array }
createLtDecoder(k: number, blockSize: number): {
  add(seed: number, data: Uint8Array): void;
  isComplete(): boolean;
  solvedCount(): number;
  assemble(fileSize: number): Uint8Array | null;   // 未完成返回 null
}
```
