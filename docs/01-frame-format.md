# 帧格式与元数据（frame 模块契约）

所有多字节整数均为大端。

## 1. 参数表（`src/frame/params.ts`）

| 名称 | 档位（下标即 idx） |
| --- | --- |
| `GRID_SIZES`（网格边长 N） | 32, 48, 64, 96, 128 |
| `COLOR_COUNTS`（每格颜色数） | 2, 4, 8, 16 |
| `FPS_LEVELS` | 2, 4, 6, 8, 10, 12, 15, 20, 30 |
| `REDUNDANCY_LEVELS`（纠错比例） | 0.1, 0.2, 0.3, 0.5, 1.0 |

帧内只保存下标：`nIdx`、`cIdx`。`fpsIdx` 只出现在检测帧的 `arg` 中。

保守规格 `CONSERVATIVE_SPEC`：`nIdx = 1`（48）、`cIdx = 0`（2 色）。
对配置 `spec`，元数据帧/检测间隔帧/检测结束帧使用 `conservativeFor(spec)`：
`nIdx = min(spec.nIdx, 1)`、`cIdx = 0`。

## 2. 容量

网格内保留区域（见 02-grid-codec.md）：4 个 8×8 定位区、4 条校准带（每条 N-16 格）、96 格帧头。

```
payloadCells(N) = N*N - 4*64 - 4*(N-16) - 96
capacityBytes(nIdx, cIdx) = floor(payloadCells(N) * log2(colors) / 8)
```

净载荷（单帧可放的 body 字节数）= `capacityBytes - 4`（末尾 4 字节为帧 CRC32）。

## 3. 帧头（12 字节，固定以 2 色、1 bit/格编码在固定位置）

| 偏移 | 长度 | 字段 |
| --- | --- | --- |
| 0 | 1 | `type`(高3位) \| `nIdx`(中3位) \| `cIdx`(低2位) |
| 1 | 2 | `transferId`（u16，每次发送随机） |
| 3 | 4 | `arg`（u32，随类型而定，见下） |
| 7 | 2 | `length`（u16，body 字节数） |
| 9 | 2 | CRC16-CCITT-FALSE，覆盖字节 0..8 |
| 11 | 1 | 魔数 `0x56` |

解析规则：魔数、CRC16、`nIdx`/`cIdx`/`type` 取值范围均需合法，否则帧头无效。

### 帧类型

| type | 名称 | 编码规格 | arg |
| --- | --- | --- | --- |
| 0 | DATA | 用户配置 | LT 种子 u32 |
| 1 | META | 保守 | 0 |
| 2 | PROBE | 该档的 (N, 颜色) | `stepId`(8) \| `idx`(8) \| `total`(8) \| `fpsIdx`(4) \| `seg`(4) |
| 3 | PROBE_GAP | 保守 | `seg`（紧随其后的段号） |
| 4 | PROBE_END | 保守 | 0 |

`seg`：0=A（帧率）、1=B（密度）、2=C（颜色）、3=D（组合）。`idx` 为本档内序号（从 0），`total` 为本档总帧数。

## 4. 帧体与整帧 CRC32

网格的 payload 区域按字节展开为 `region`（长度 `capacityBytes`）：

```
region[0 .. length)            body
region[length .. length+4)     CRC32(header[0..12) ++ body)
其余                            0（随后整体白化）
```

CRC32 为 IEEE 802.3（多项式 0xEDB88320，初值/末异或 0xFFFFFFFF）。
校验失败的帧整帧丢弃，不做任何帧内纠错。

## 5. META 帧 body

```
u8  version = 1
u32 fileSize
u32 blockCount (K)
u16 blockSize
u32 fileCrc32
u8  nIdx      // 数据帧规格（信息性）
u8  cIdx
u8  nameLen
    name      // UTF-8，超出容量时在字符边界截断
```

## 6. 接口

```ts
type FrameType = 0|1|2|3|4;
type FrameHeader = { type: FrameType; nIdx: number; cIdx: number; transferId: number; arg: number; length: number };
type FramePlan = { type: FrameType; nIdx: number; cIdx: number; transferId: number; arg: number; body: Uint8Array };
type ParsedFrame = { header: FrameHeader; body: Uint8Array };

crc32(data: Uint8Array, seed?: number): number
crc16(data: Uint8Array): number
encodeHeader(h: FrameHeader): Uint8Array          // 12 字节
decodeHeader(bytes: Uint8Array): FrameHeader | null
buildFrame(plan: FramePlan): { header: Uint8Array; region: Uint8Array }  // body 过大时抛错
parseFrame(header: Uint8Array, region: Uint8Array): ParsedFrame | null   // CRC 失败返回 null
encodeMeta(m: Meta): Uint8Array; decodeMeta(b: Uint8Array): Meta | null
```
