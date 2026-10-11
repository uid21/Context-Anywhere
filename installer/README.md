# Context Anywhere Windows 部署向导

下载 ZIP 后完整解压，双击根目录的 `ContextAnywhere.exe` 即可运行。程序和依赖放在同一个文件夹内，不需要安装，不写入卸载登记，也不需要另装 Node.js。

需要 Windows 10/11 x64、已启用 R2 的 Cloudflare 账号，以及已安装并启用 AI Bridge的 Obsidian 知识库。

1. 选择知识库。首页提供 Cloudflare 注册、R2 启用和 Obsidian 社区插件页面的链接。
2. 在默认浏览器中登录 Cloudflare 并授权。返回向导后会自动显示连接成功，直接选择账号、继续下一步。API Token 是另一种连接方式，浏览器授权后无需填写。
3. 选择同步范围、设备名称、附件和同步选项。
4. 部署镜像，点击“导入 Obsidian”。插件会保存连接设置，检查连接并开始同步。
5. 默认选择 ChatGPT，依次复制 MCP 地址、名称和读取密码。第一步会同时打开默认浏览器；按每一步的说明填写并完成 OAuth 授权。选择“其他 AI”时，仅复制 MCP 地址和读取密码。地址、名称和授权密码的步骤入口始终可见，可直接切换。打开浏览器失败也不影响复制后续信息。JSON / Codex 配置可在“更多客户端配置”中展开。

外观默认跟随 Windows，也可以在右上角选择浅色或深色。窄窗口自动收起左侧步骤栏，表单支持纵向滚动，底部导航保持可见。

## 更新 Obsidian 插件

请从 [Obsidian 社区](https://community.obsidian.md/plugins/ai-bridge)安装并启用 AI Bridge。如果向导提示插件需要更新，先在 Obsidian 中更新，再重新打开知识库。也可以退出 Obsidian，用压缩包 `obsidian-plugin` 内的三个文件更新所选知识库的插件目录，保留原有 `data.json`。

导入后，镜像地址、上传密钥和同步选项会保存在所选知识库的 AI Bridge 设置中。

## R2 免费额度

R2 标准存储每月包含 10 GB·月存储、100 万次 A 类操作（如写入、列举）和 1000 万次 B 类操作（如读取）的免费额度，出站流量免费。超出部分的费用和具体计费规则请查看 [Cloudflare 官方价格](https://developers.cloudflare.com/r2/pricing/)。

## 数据与凭证

每套部署都创建带随机后缀的独立 Worker、R2 和 OAuth KV，向导不会覆盖其他部署。重新部署会检查这些资源是否仍然存在，并补齐已经缺失的项。Cloudflare 部署凭证仅用于当前会话；镜像密钥和部署记录用 Windows DPAPI 加密，保存在 `%LOCALAPPDATA%\ContextAnywhereSetup\deployment.dpapi`，由当前 Windows 账号读取。移动程序目录不会丢失部署记录。

读取密码只在镜像授权页面输入；导出的连接说明不含密钥。删除程序文件夹不会删除知识库、云端资源或部署记录。程序尚未签名，Windows 可能显示未知发布者提示。

## 构建

在仓库根目录运行：

```powershell
npm ci
npm --prefix worker ci
npm --prefix installer ci
npm run check
npm run test:installer
npm run build:installer
npm run package:windows
npm --prefix installer run test:ui
```

需要 Windows 自带的 .NET Framework C# 编译器。构建会下载 Node.js 22.23.3 并核对官方 SHA256。输出 `installer/dist/Context-Anywhere-0.2.3-win-x64.zip` 和 `SHA256SUMS.txt`。

向导使用 Windows 自带的 WPF，后台通过私有管道工作。Cloudflare 登录会临时接收本机 OAuth 回调，浏览器始终使用 Windows 默认设置。
