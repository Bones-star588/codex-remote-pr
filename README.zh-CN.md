# Codex Remote

[English](README.md) | [简体中文](README.zh-CN.md)

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-43853d)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0078d4)
[![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![CI](https://github.com/CoralFlower325/Codex-remote/actions/workflows/ci.yml/badge.svg)](https://github.com/CoralFlower325/Codex-remote/actions/workflows/ci.yml)

一个自托管的 Codex Desktop 网页工作区。通过手机或另一台电脑继续会话、查看代码变更、切换模型，并处理审批请求。

网页通过本机私有桥接连接桌面端所属的 App Server，提供响应式界面。Windows 是主要实测平台，同时保留 macOS 安装脚本。

本项目由社区独立维护，与 OpenAI 无隶属或背书关系。

![Codex Remote 桌面工作区](docs/images/desktop.png)

## 界面预览

截图来自实际前端，项目、聊天、路径和模型信息均使用虚构演示数据，不包含真实账户、会话或部署信息。截图中的模型仅用于演示，可选模型由实际连接的 Codex 运行时决定。

| 手机工作区 | 代码变更审阅 |
| --- | --- |
| <img src="docs/images/mobile.png" alt="手机聊天工作区" width="280"> | <img src="docs/images/review.png" alt="桌面代码审阅面板" width="340"> |

桌面截图分辨率：**2560 × 1440**。手机截图分辨率：**390 × 844**。

## 主要功能

- **共享桌面端会话**：通过同一个桌面后端打开和继续会话，接收桌面端发起的实时活动。
- **项目与任务导航**：按项目组织全部供应商的任务，支持分页、搜索、归档浏览、重命名、归档与恢复。
- **长会话展示**：按需加载更早记录，保留阅读位置，将连续工具活动折叠为一组。
- **原生模型信息**：模型列表和推理强度来自运行时，也能展示其暴露的自定义模型目录。
- **会话级权限**：选择原生只读、工作区或完全访问权限，并回复支持的审批请求。
- **图片与代码审阅**：上传或粘贴图片、查看原图，按文件审阅变更，支持统一与并排差异视图。
- **响应式浅色界面**：桌面侧边栏、手机导航抽屉、紧凑输入框和系统字体。
- **连接恢复**：心跳检测、连接超时、网络与前台恢复，以及按会话保存的浏览器草稿。
- **自托管访问**：密码登录、签名 HTTP-only 会话、本机初始化，以及可选的 Cloudflare Tunnel。
- **Windows 双击开关**：通过运行文件开启或关闭本地服务及已配置隧道。

## 工作原理

```text
手机 / 电脑浏览器
        |
        | HTTPS + WebSocket
        v
Cloudflare Tunnel（可选）
        |
        v
本地 Node.js 服务（127.0.0.1:4545）
        |
        | 私有 CDP 桥接（127.0.0.1:9229）
        v
Codex Desktop -> 桌面端所属的 App Server
```

桌面端不可用时，Remote 可以回退到独立 App Server。独立模式**不能共享桌面进程的实时事件**，可通过 `/health` 检查当前传输方式。

## 环境要求

| 组件 | 要求 |
| --- | --- |
| 主机 | Windows 10/11 或 macOS |
| 运行环境 | Node.js **22.19 及以上**，包含 npm |
| Codex | 已安装并登录的 Codex Desktop / 兼容的内置 CLI |
| 桌面同步 | 回环地址上的 `9229` 调试端口 |
| 公网访问 | 可选安装 `cloudflared`；Windows 助手需要 Cloudflare 管理的域名 |
| Windows 隧道助手 | PowerShell 7，以及已登录的 `cf` CLI |

项目使用桌面端内部接口，Codex Desktop 更新可能影响兼容性。Linux 桌面集成尚未验证。

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/CoralFlower325/Codex-remote.git
cd Codex-remote
```

### 2. 开启桌面同步

先保存工作并完全退出 Codex Desktop，再使用调试参数启动。正常使用过程中，Remote 不需要重启桌面客户端。

Windows 商店安装版，可在 PowerShell 中执行：

```powershell
$package = Get-AppxPackage -Name "*Codex*" | Select-Object -First 1
& (Join-Path $package.InstallLocation "app\Codex.exe") --remote-debugging-port=9229 --remote-debugging-address=127.0.0.1
```

其他 Windows 安装方式，请对实际的 `Codex.exe` 使用相同参数；不同安装包的路径可能有所差异。

macOS：

```bash
open -a Codex --args --remote-debugging-port=9229 --remote-debugging-address=127.0.0.1
```

在本机检查：

```powershell
Invoke-RestMethod http://127.0.0.1:9229/json/list
```

结果中应包含 URL 带有 `app://-/index.html` 的页面。该端口能控制本地应用，必须保持本机私有访问。

### 3. 安装并启动

**Windows**

```powershell
npm run setup:windows
npm start
```

安装脚本会按锁文件安装依赖、构建应用，并在尚未配置时要求设置访问密码。

**macOS / 手动安装**

```bash
npm ci
npm run build
npm run set-password
npm start
```

打开 **http://127.0.0.1:4545** 并登录。首次密码初始化仅接受本机请求。

### 4. 检查连接方式

```powershell
Invoke-RestMethod http://127.0.0.1:4545/health
```

实时桌面同步应显示 `codex: ready`、`transport: desktop`。若为 `standalone`，说明 Remote 正在使用独立 App Server。

## Windows 开启与关闭

构建并设置密码后：

| 文件 | 行为 |
| --- | --- |
| `Start Remote.cmd` | 启用并启动计划任务，检查本地就绪状态，然后打开配置的页面 |
| `Stop Remote.cmd` | 停止服务和隧道，并禁用其登录自启任务 |

关闭远控不会关闭 Codex Desktop。关闭后重新登录系统也不会自动开启，直到再次运行 Start。重复开启不会重复创建运行实例。

若计划任务不存在，首次开启会安装当前用户的任务。存在 `data/cloudflared-token` 时会同时管理隧道。

命令行用法：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/remote-control-windows.ps1 -Action Start -NoBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/remote-control-windows.ps1 -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/remote-control-windows.ps1 -Action Stop
```

安装或移除计划任务：

```powershell
npm run install-task:windows
npm run uninstall-task:windows
```

macOS 可运行 `bash scripts/install-service.sh` 为网页服务安装登录 LaunchAgent。双击开关仅适用于 Windows。

## 公网访问

仅在本机使用不需要域名。需要固定公网地址时，可配置 `codex.example.com` 等主机名。

### Windows Cloudflare 助手

安装 `cloudflared`、PowerShell 7 和 Cloudflare `cf` CLI，并完成登录：

```powershell
npm install --global cf
cf auth login
cf auth whoami
npm run tunnel:windows -- -PublicHost codex.example.com
```

助手会创建或复用远程管理隧道、设置入口、在记录不存在时创建 DNS、本地保存隧道令牌、更新 `.env`，并安装登录任务。已有 DNS 若指向其他目标，不会被覆盖。

默认隧道目标为 `http://127.0.0.1:4545`。本地就绪地址为 `http://127.0.0.1:20241/ready`，普通连接日志位于 `data/cloudflared.log`。

### macOS

`scripts/cloudflared-tunnel.sh` 是保留的交互式本地管理方案，会写入 `~/.cloudflared/config.yml` 并安装系统服务，需要 `sudo`。已有 cloudflared 配置时请先检查脚本。本次发布未重新完成该 macOS 路径的实机验收。

也可使用支持 WebSocket 升级的 HTTPS 反向代理，将请求转发到本地服务，并正确设置 `PUBLIC_ORIGIN`、`ALLOWED_ORIGINS`。不要公开桌面调试端口。

## 配置

将 `.env.example` 复制为 `.env` 后按需修改：

```powershell
Copy-Item .env.example .env
```

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 本地监听地址 |
| `PORT` | `4545` | 网页服务端口 |
| `PUBLIC_ORIGIN` | 空 | 最终 HTTPS 来源 |
| `ALLOWED_ORIGINS` | 空 | 额外允许的浏览器来源，逗号分隔 |
| `CODEX_BINARY` | 自动发现 | 显式指定内置 Codex CLI 路径 |
| `CODEX_HOME` | `~/.codex` | Codex 状态和配置目录 |
| `CODEX_WORKDIR` | 用户主目录 | 默认工作目录 |
| `CODEX_DESKTOP_DEBUG_PORT` | `9229` | 本地桌面调试端口 |
| `TRUST_PROXY` | `1` | 在预期的本地代理后信任转发头 |
| `SESSION_DAYS` | `30` | 浏览器会话有效天数 |

使用本地隧道或反向代理时，应保持回环监听。Windows 隧道助手默认转发到 `4545`，改端口时需要同时指定其 `-LocalUrl` 参数。

Windows 会依次探测应用包、独立安装目录和 `PATH` 中的 CLI；macOS 会探测支持的应用位置、独立安装目录及 `PATH`。发现失败时可设置 `CODEX_BINARY`。

## 模型、权限与状态

- 模型来自原生 `model/list`，推理档位使用各模型的 `supportedReasoningEfforts`，并非所有模型都具有相同档位。
- 自定义供应商在 Codex 中配置，Remote 没有独立供应商编辑器；可选模型由运行时暴露的目录决定。
- 模型和项目元数据在建立连接时刷新，不会在连接保持期间持续刷新。目前这两类列表只读取首次请求页；任务列表、历史和权限配置具有各自的分页处理。
- 新会话当前使用模型目录的默认推理档位初始化，可能与 Codex 全局配置覆盖值不同，请显式选择需要的强度。
- 权限来自 `permissionProfile/list`，修改作用于当前会话。内置配置包括 `:read-only`、`:workspace`、`:danger-full-access`。
- 未发送草稿保存在浏览器 `sessionStorage`，切换任务和重连时保留，不与桌面输入框或其他设备同步。
- 图片通过本地 Codex 工作流处理，项目不提供独立托管的模型服务。

## 安全与隐私

本项目面向**可信操作人控制自己的电脑**，并非多用户托管平台。登录用户可以访问会话、图片，以及所选原生权限允许的操作能力。

- 使用强访问密码，公网访问采用 HTTPS。
- 密码以加盐 `scrypt` 哈希保存。会话 Cookie 经过签名，使用 HTTP-only、`SameSite=Strict`，HTTPS 下启用 `Secure`。
- 错误密码尝试受到限流，可在主机运行 `npm run set-password` 重置密码。
- 不要公开 `.env`、`data/`、隧道凭据、会话密钥、日志或浏览器认证导出文件。
- 桌面调试端口和 App Server 连接保留在本机，只公开受保护的网页入口。
- 完全访问可以执行主机操作，运行任务前应确认权限档位。

公开源码未携带本地运行数据或旧开发提交历史，文档截图使用虚构数据。漏洞私密报告方式见 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm ci
npm run dev
```

前端由 Vite 提供，开发配置将 API 和 WebSocket 转发到本地后端。生产实例运行时，不要再启动一个争用同一桌面桥接的后端。

```bash
npm run typecheck
npm test
npm run build
```

发布基线包含 **13 个测试文件、50 项测试**。CI 在 Windows 和 Ubuntu 上运行类型检查、测试和生产构建；Ubuntu 构建不代表 Linux 桌面集成已经验证。

```text
src/client/       React 工作区、输入框、历史、审批与重连
src/server/       Express、认证、桌面桥接与原生历史
src/shared/       协议与权限辅助逻辑
scripts/          安装、自启、隧道与 Windows 开关
public/           应用资源
docs/images/      脱敏文档截图
```

## 已知限制

- 当前界面标签为简体中文，项目提供中英文文档。
- 项目是独立适配，不是所有 Codex Desktop 界面的像素级复制。
- 桌面内部协议变化可能影响同步；独立回退模式不能复现桌面实时事件。
- 命令记录不是交互式终端。检查器依赖已加载会话中的文件与变更，并非完整项目文件管理器。
- 命令审批已完成实机验证。文件修改、用户输入、持久命令和网络策略审批有辅助逻辑与测试，但仍需分别完成实机验收。
- 听写依赖浏览器支持和麦克风权限，本次发布尚未验收真实语音输入。
- 心跳重连不能保证网络永不掉线，已中断的请求不会自动重放。
- Windows 已完成在线实测，macOS 脚本本次尚无同等完整验收。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 桌面会话没有实时更新 | 检查 `/health` 是否为 `desktop`，确认调试页面存在且桌面端已登录 |
| 聊天记录看起来不完整 | 加载更早历史，检查是否连接到桌面端所属后端 |
| 缺少某个模型或推理档位 | 查看 Codex 提供的目录，修改供应商后重新连接 |
| 开启时提示缺少构建 | 先运行 `npm ci` 和 `npm run build` |
| 本机正常但公网打不开 | 检查隧道就绪状态、计划任务、DNS 和 `data/cloudflared.log` |
| 休眠后连接停滞 | 回到前台或恢复网络，客户端会检测并重连 |
| 忘记访问密码 | 在主机运行 `npm run set-password` |
| Codex 提示忽略某个全局设置 | 检查本机 Codex 配置，Remote 不负责管理废弃全局配置项 |

提交问题时，请提供操作系统、Node 版本、相关 Codex 版本、传输方式和脱敏错误。不要附带令牌、`.env`、认证文件、原始聊天导出或未脱敏截图。

## 参与贡献

欢迎提交 Issue 和 Pull Request。开发、验证和隐私要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 致谢与许可证

项目采用 [MIT License](LICENSE)。

- 原始项目：[Bones-star588/codex-remote](https://github.com/Bones-star588/codex-remote)，2026 lezi-fun。
- 工作区与审阅界面参考：[Bones-star588/codex-webui](https://github.com/Bones-star588/codex-webui)，2026 lezi-fun。
- Windows 移植与本发行版：[CoralFlower325](https://github.com/CoralFlower325)。
- 使用 React、TypeScript、Vite、Express、WebSocket 和 Lucide 图标构建。

完整上游声明保留于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。Codex 及相关品牌属于 OpenAI，软件许可证不授予商标使用权。
