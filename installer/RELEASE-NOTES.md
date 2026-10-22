## 简体中文

Context Anywhere Windows 部署向导 **0.3.0**：新增英文界面，并更新向导、AI 读取服务与发布工具中的安全组件。

### 多语言

- 同时提供简体中文和 English。
- 首次启动自动跟随 Windows 界面语言，也可以在右上角手动切换。
- 记住语言选择；切换语言不会清空已填写的内容或改变当前步骤。
- 验证提示、部署进度和连接说明随所选语言显示。

### 安全更新

- 随包 Node.js 更新到 **22.23.4**，包含修复后的内置联网组件及压缩数据处理修复。
- 部署工具统一使用修复后的 Undici **7.30.1**，替换工具内原先仍在使用的旧副本。
- 更新 AI 读取接口依赖，限制异常请求的大小和复杂程度；保持每次请求独立处理和只读授权。
- 更新本地图片、地址解析以及构建与发布依赖，修复相关网络处理和签名问题。

### 安装与升级

适用于 **Windows 10/11 x64**。下载并完整解压 ZIP，双击 ContextAnywhere.exe。程序自带运行环境，无需另装 Node.js；AI Bridge **0.4.2** 继续随包提供。

已有用户请先关闭旧向导，再使用新版。已有知识库和加密部署记录会保留。**如果已经部署了云端镜像，请使用新版向导对原部署重新执行一次部署，云端接口修复才会生效。** 仅下载或打开新版不会自动修改云端服务。

程序尚未签名，Windows 可能显示未知发布者提示。

---

## English

Context Anywhere Windows Setup **0.3.0** adds an English interface and updates security components in the setup app, AI read service, and release tooling.

### Languages

- Both **Simplified Chinese** and **English** are available.
- Setup initially follows the Windows display language; switch manually at the top right.
- The language choice is remembered. Switching preserves entered values and the current step.
- Validation messages, deployment progress, and connection instructions follow the selected language.

### Security updates

- Bundled Node.js updated to **22.23.4**, including fixes to built-in networking and compressed-data handling.
- Deployment tooling now uses fixed Undici **7.30.1**, replacing the older copies previously embedded in the tooling.
- Updated AI interface dependencies and added request-size and input-complexity limits while preserving per-request isolation and read-only authorization.
- Updated local image processing, IP address parsing, build, and release dependencies to address related networking and signature issues.

### Install or upgrade

Requires **Windows 10/11 x64**. Download and extract the entire ZIP, then run ContextAnywhere.exe. No separate Node.js installation is needed. AI Bridge **0.4.2** remains included.

Close the old setup app before using this version. Your vault and encrypted deployment record are preserved. **If you already have a cloud mirror, use the new wizard to redeploy the existing mirror so the cloud-side fixes take effect.** Downloading or opening the new version does not automatically change a deployed service.

This app is unsigned; Windows may display an unknown-publisher warning.
