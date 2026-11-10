# VicTorch

纯前端光学数据传输：发送端把单个文件编码成连续变化的网格码显示在屏幕上，接收端用摄像头录像并逐帧解码还原。无后端、无网络依赖、单向。

## 范围

只做：速率检测（可选）→ 发送 → 接收；单文件；“一直发送”模式；接收端显示推荐配置，由用户手动抄到发送端。
不做：加密、压缩、多文件、断点续传、PWA/离线缓存、对准辅助、纯文本模式、配置预设、日志导出、双向对扫、推荐配置码回传。

## 模块职责（`src/`）

| 目录 | 职责 |
| --- | --- |
| `frame` | 参数表、CRC、帧头、帧体、META 编解码；不含像素逻辑 |
| `fountain` | LT 编码 / peeling 解码 |
| `codec` | 网格码版面、渲染、检测、单应矩阵、颜色校准、采样 |
| `probe` | 检测档位表、统计、推荐算法 |
| `sender` | 文件/检测的帧序列源、帧节拍器 |
| `receiver` | 接收会话状态机（纯逻辑）、解码流水线 |
| `camera` | getUserMedia、取帧循环、解码 Worker |
| `i18n` | 文案目录：英文为基准（`en.ts`），中文为译文（`zh.ts`），按浏览器语言自动选择，回退英文 |
| `ui` | React 界面（发送 / 检测 / 接收），所有文案经 `t()` 取自 i18n |

契约文档在 `docs/`，改格式先改文档，再改测试，最后改实现。

## 约定

- TypeScript 函数一律写成 `export const fn = (...) => ...`，不使用 `function` 声明与 class。
- 除 React 外不引入运行时依赖；新增依赖前先核对许可证并登记到 `docs/06-third-party.md`。
- 网格/颜色/帧率/纠错比例在帧与 UI 中一律用档位下标（idx），数值只在显示处查表。
- 新增界面文案：先写英文（`src/i18n/en.ts`），再补中文（`zh.ts`，类型会强制键一致）；不在组件里写死文案。
- 代码、注释、提交信息、文档中不出现与工具来源相关的描述。

## 命令

```bash
npm install
npm run dev        # 开发服务器（localhost 可用摄像头）
npm test           # vitest run
npm run typecheck
npm run build      # 类型检查 + 纯静态产物 dist/
```

## 测试要点

- `test/fountain.test.ts`：随机丢包、乱序、重复仍能还原
- `test/frame.test.ts`：CRC 失败帧被丢弃；帧头可从保守编码读出
- `test/codec.test.ts`：透视、噪声、亮度/颜色偏移后各 N、各颜色档位仍可检测解码
- `test/probe.test.ts`：给定各档成功率，推荐算法输出符合预期
- `test/i18n.test.ts`：中英文键与参数一致、语言检测与回退
- `test/transfer.test.ts`：发送源 → 丢包乱序 → 接收会话的端到端
