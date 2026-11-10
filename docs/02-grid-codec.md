# 网格码（codec 模块契约）

## 1. 版面

整图 = 白色留白（quiet zone）包围的 N×N 网格。发送端渲染时网格固定占图像边长的 82%（`CODE_FRACTION`），无论密度如何，二维码的物理大小和留白都不变（留白约 9% 边长，至少约 3 格）。坐标 (r, c) 以网格左上角为原点。

```
r=0..7  c=0..7        TL 定位区      （7×7 定位标记 + 1 格白色隔离）
r=0..7  c=N-8..N-1    TR 定位区
r=N-8.. c=0..7        BL 定位区
r=N-8.. c=N-8..N-1    BR 定位区
r=0 / r=N-1,  c=8..N-9   上/下校准带
c=0 / c=N-1,  r=8..N-9   左/右校准带
r=1..6, c=8..23          帧头区（96 格，2 色）
其余                      payload 区（行优先）
```

- 定位标记与 QR 的 7×7 标记相同：外环黑 7×7、内环白 5×5、中心黑 3×3，行/列扫描比例 1:1:3:1:1。
  四个角使用同一种标记；朝向由接收端对 4 种旋转依次尝试、以帧头 CRC16 判定。
- 校准带：沿带方向第 k 格取调色板第 `k mod colors` 色，四条带共 `4(N-16)` 格，覆盖全部调色板颜色多次。
  接收端对每种颜色求平均观测 RGB，作为分类参考色（颜色归一化）。
- 帧头区：2 色，bit=1 为黑；与固定伪随机掩码异或后写入。
- payload：字节流异或固定伪随机掩码（白化），按 MSB 在前切成 `log2(colors)` bit 一组，依次填入 payload 格；尾部不足的格填 0。

## 2. 调色板

- 2 色：黑、白
- 4 色：白、红、绿、蓝
- 8 色：RGB 立方体 8 个顶点
- 16 色：8 个顶点 + 在 {0,85,170,255}³ 中按最远点贪心再选 8 个

## 3. 检测与解码流程

1. RGBA → 灰度 → 积分图自适应二值化（窗口≈宽/8，阈值 = 局部均值×0.85）。
2. 逐行游程扫描，匹配 `暗亮暗亮暗` ≈ 1:1:3:1:1，纵向与复核行复检，聚类得到定位标记候选。
3. 在候选中枚举 4 个一组，按“近似正方形、模块尺寸一致、边长对应某个 N-7”打分，依次尝试。
4. 对每组：4 个旋转 × 5 个 N 假设，建立单应矩阵（定位标记中心 (3.5, 3.5) 等 ↔ 图像坐标），采样帧头区，`decodeHeader` 有效且头内 `nIdx` 与假设一致即确认。
5. 读取头内 `cIdx`，用校准带求各色参考 RGB，对 payload 每格采样（5 点平均）后取最近参考色，还原 `region`。
6. 返回 `{ header, region }`；整帧 CRC32 由 frame 模块校验，失败即丢弃。

## 4. 接口

```ts
type RGBAImage = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

getLayout(nIdx, cIdx): Layout                       // 版面与容量（缓存）
encodeGrid(nIdx, cIdx, header: Uint8Array, region: Uint8Array): Uint8Array   // n*n 的格子码
renderRGBA(cells, nIdx, cIdx, cellPx, quiet?): RGBAImage
detectAndSample(img: RGBAImage): { header: Uint8Array; region: Uint8Array; nIdx: number; cIdx: number } | null
```
