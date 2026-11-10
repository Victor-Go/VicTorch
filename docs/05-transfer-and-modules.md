# 传输流程与模块接口

## 发送（sender）

`createFileSource({ data, name, spec: {nIdx,cIdx}, redundancyIdx | 'endless', transferId?, seedBase? })`

- `blockSize = capacityBytes(spec) - 4`，`K = ceil(size / blockSize)`；空文件拒绝。
- 序列：开头连续 3 个 META，之后每 16 个 DATA 插 1 个 META。
- 有限模式共 `ceil(K * (1 + REDUNDANCY_LEVELS[redundancyIdx]))` 个 DATA 帧，随后 `next()` 返回 `null`。
- 一直发送：DATA 种子 `seedBase + i` 无限递增，直至用户停止。
- 返回的 `FramePlan` 经 `planToCells(plan)`（buildFrame + encodeGrid）得到格子码，`renderRGBA` 绘制。

`createTicker(fps, onTick)`：基于 `requestAnimationFrame` 时间戳节拍，不使用 setInterval；
`createFrameClock(intervalMs)` 是其纯函数核心（`due(now)`），便于测试。

## 检测发送

`createProbeSource()`：按 04-probe.md 的序列逐帧产出 `{ plan, fps }`，另有 `describe()` 返回当前档位提示。

## 接收（receiver）

`createReceiverSession()`，纯逻辑，输入已通过 CRC 的 `ParsedFrame`：

- `onFrame(frame, nowMs)`：
  - META：记录（按 `transferId`；新 ID 视为新传输并重置）。
  - DATA：需要 META 才能解码；META 之前到达的 DATA 先缓存（上限 4000 帧）。
  - PROBE/GAP/END：自动进入检测模式；`END` 触发检测完成。
- `getState()`：`{ mode: 'idle'|'transfer'|'probe', transfer?: {fileName,fileSize,k,solved,status:'receiving'|'done'|'failed', fileBytes?}, probe?: {...}, kbps }`
- `finishProbe()`：用户手动结束检测。
- 吞吐：最近 3 秒内被接受帧的 body 字节数 / 窗口长度。
- 收齐后校验整文件 CRC32，通过才给出 `fileBytes`；不通过状态为 `failed`。

## 摄像头与解码线程

- `camera/camera.ts`：`getUserMedia`（facingMode environment，ideal 1920×1080@30）；对焦/曝光等高级约束仅 try/catch 尝试一次；`track.getSettings()` 回报实际分辨率与帧率。
- `camera/grabber.ts`：优先 `requestVideoFrameCallback`，否则 `requestAnimationFrame`；每帧 `createImageBitmap` 后交给 Worker，Worker 忙时只保留最新一帧，旧的丢弃并 `close()`。
- `camera/decodeWorker.ts`：`OffscreenCanvas` 取像素 → `detectAndSample` → `parseFrame`，回传 `ParsedFrame` 或失败原因。
- 摄像头需要 HTTPS 或 localhost，界面给出提示。
