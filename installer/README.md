# Context Anywhere Windows 部署向导

从 [Windows 向导 1.0.0 发布页](https://github.com/uid21/Context-Anywhere/releases/tag/windows-setup-v1.0.0) 下载 ZIP 后完整解压，双击根目录的 `ContextAnywhere.exe` 即可运行。1.0.0 改进界面和交互，并支持新设备登录原 Cloudflare 账号后自动发现已有镜像，选择后恢复连接设置。程序和依赖放在同一个文件夹内，不需要安装，不写入卸载登记，也不需要另装 Node.js。

首次启动按 Windows 界面语言选择简体中文或 English，也可以在右上角手动切换；选择会保存到本机。切换不会清空已填写的选项或改变当前步骤。

需要 Windows 10/11 x64、已启用 R2 的 Cloudflare 账号，以及已安装并启用 AI Bridge的 Obsidian 知识库。

1. 选择知识库，确认 Cloudflare 已启用 R2，点击“检查并继续”。文件夹选择器支持地址栏粘贴路径；向导自动检查 AI Bridge，自定义配置目录和开通指引按需展开。
2. 在默认浏览器中登录 Cloudflare 并授权。返回向导后选择账号，向导自动查找恢复记录：找到后可直接恢复已有部署；没有记录则继续全新部署。API Token 是另一种连接方式，浏览器授权后无需填写。
3. 选择同步范围、设备名称、附件和同步选项。
4. 全新部署会创建镜像并保存私有恢复记录；恢复已有部署时直接导入，无需重部署。点击“导入 Obsidian”，插件会保存连接设置，检查连接并开始同步。
5. 默认选择 ChatGPT，依次复制 MCP 地址、名称和读取密码。第一步会同时打开默认浏览器；按每一步的说明填写并完成 OAuth 授权。选择“其他 AI”时，仅复制 MCP 地址和读取密码。地址、名称和授权密码的步骤入口始终可见，可直接切换。打开浏览器失败也不影响复制后续信息。JSON / Codex 配置可在“更多客户端配置”中展开。

外观默认跟随 Windows，也可以在右上角选择浅色或深色。中文使用微软雅黑 UI，英文使用 Segoe UI；窗口和 EXE 使用多尺寸笔记图标。窄窗口自动收起左侧步骤栏，表单支持纵向滚动，底部导航保持可见。可以点击左侧已到达的前序步骤返回，保留填写内容和滚动位置。切页动效遵循 Windows 的动画开关，按钮不再缩放文字。

同步范围有“选择文件夹或笔记”和“整个知识库”两种模式；全库模式收起路径区，切回后保留可编辑的草稿。可以手填库内路径、选择文件夹/多篇笔记，或拖入文件；预览不会上传笔记。附件大小、定时间隔等只在对应选项开启时出现，数值支持加减按钮和上下方向键；填错时展开并聚焦对应字段。

滚轮连续输入会平滑累计，反向滚动立即改变方向；多行输入框先滚内部，到边缘再滚页面。按钮、输入焦点、勾选、下拉弹层、展开收起均有短过渡；关闭 Windows 动画后立即切换。运行中锁定输入，同时保留滚动；未完成部署时禁用导入操作。

## 换电脑恢复

新电脑只需选择知识库、登录原 Cloudflare 账号，在自动发现的列表中选择部署并点击恢复。镜像地址、上传凭据、读取密码和资源信息会从账号内的私有恢复记录取回，再由新电脑保存自己的 DPAPI 记录。无须复制旧电脑的加密文件，也无须手动搬运密钥和地址。

恢复后可直接“复制上传凭据”“复制读取密码”，或选择这台设备的同步范围并“导入 Obsidian”。旧设备的知识库路径和同步范围不会自动套用到新库；需要下载镜像中的笔记时开启双向同步。恢复只检查已有资源和凭据，不重部署、不轮换密钥。

原电脑再次打开时直接使用本机记录。0.3.0 及更早版本尚未保存云端恢复记录：在持有原记录的电脑打开新版、登录 Cloudflare 并选择“保存新设备恢复记录”即可补存。若原本机记录和原密钥都已丢失、云端又没有恢复记录，向导无法从 Worker Secret 反向取回明文。

如果镜像已经部署好而恢复记录保存暂时失败，当前电脑仍可使用；向导显示待重试状态，重试只保存恢复记录，不会重新创建或部署镜像。账号权限不足、记录损坏或凭据失效时保留现状并给出具体提示。

## 更新 Obsidian 插件

请从 [Obsidian 社区](https://community.obsidian.md/plugins/ai-bridge)安装并启用 AI Bridge。如果向导提示插件需要更新，先在 Obsidian 中更新，再重新打开知识库。也可以退出 Obsidian，用压缩包 `obsidian-plugin` 内的三个文件更新所选知识库的插件目录，保留原有 `data.json`。

导入后，镜像地址、上传密钥和同步选项会保存在所选知识库的 AI Bridge 设置中。

## R2 免费额度

R2 标准存储每月包含 10 GB·月存储、100 万次 A 类操作（如写入、列举）和 1000 万次 B 类操作（如读取）的免费额度，出站流量免费。超出部分的费用和具体计费规则请查看 [Cloudflare 官方价格](https://developers.cloudflare.com/r2/pricing/)。

## 数据与凭证

每套部署都创建带随机后缀的独立 Worker、R2 和 OAuth KV，向导不会覆盖其他部署。重新部署会检查这些资源是否仍然存在，并补齐已经缺失的项。Cloudflare 部署凭证仅用于当前会话；镜像密钥和部署记录用 Windows DPAPI 加密，保存在 `%LOCALAPPDATA%\ContextAnywhereSetup\deployment.dpapi`，由当前 Windows 账号读取。移动程序目录不会丢失部署记录。

首次部署另存一份恢复副本到账号内独立的 `context-anywhere-recovery-v1` KV 空间，包含两种镜像凭据、地址和资源标识，不含笔记、本机路径或 Cloudflare 登录令牌。恢复空间不绑定到镜像 Worker，AI/MCP 和镜像凭据无法访问它。它由 Cloudflare 提供静态加密和 HTTPS 传输；拥有该账号 KV 读取权限的管理员可以读取恢复副本。这是可恢复备份，不是端到端加密保险库；Worker Secret 自身仍不支持明文读回。

读取密码只在镜像授权页面输入；导出的连接说明不含密钥。删除程序文件夹不会删除知识库、云端资源或部署记录。程序尚未签名，Windows 可能显示未知发布者提示。

## English

Download the ZIP from the [Windows setup 1.0.0 release](https://github.com/uid21/Context-Anywhere/releases/tag/windows-setup-v1.0.0), extract it completely, and run `ContextAnywhere.exe`. Version 1.0.0 improves the interface and interactions, and lets a new device discover and restore an existing mirror's connection settings after sign-in to the original Cloudflare account. The portable app includes its own Node.js runtime. It needs Windows 10/11 x64, a Cloudflare account with R2 enabled, and an Obsidian vault with AI Bridge installed and enabled.

Setup initially follows your Windows display language (Chinese or English). Use the language selector at the top right to switch at any time between operations. The choice is remembered; your entries, selections, and current step are preserved. Light, dark, and system themes are available beside it.

1. Choose your vault, confirm R2 is enabled, and select **Check and continue**. Setup checks AI Bridge automatically. Expand the custom configuration folder or setup guides only when needed.
2. Sign in to Cloudflare in your default browser, authorize, then choose an account. Setup automatically discovers private recovery records. Restore a listed deployment, or continue a new deployment if none exists. API Token is an alternative; leave it empty after browser authorization.
3. Choose folders or individual notes, or sync the entire vault. Paths can be typed, selected with a picker, or added by dragging files and folders; switching to the entire vault preserves your custom-path draft. Choose this device's name, attachment limits, and sync options. Previewing does not upload notes. Two-way sync is optional.
4. New deployment creates the mirror and its private recovery record; restoration uses the existing mirror without redeploying. Select **Import into Obsidian**, keep Obsidian open, and check the import result.
5. Copy the MCP URL, name, and read password to connect ChatGPT, or choose **Other AI**. Follow the instructions to complete OAuth in your browser. Every connection step stays accessible even if opening the browser fails. JSON and Codex configuration are under **More client configurations**.

Update AI Bridge through the Obsidian community plugins page when requested. Alternatively, close Obsidian and copy the three files from `obsidian-plugin` into that vault's plugin folder, preserving its existing `data.json`.

On a new computer, sign in to the original Cloudflare account and restore the discovered deployment. Setup retrieves its URL, upload credential, read password and resource identities, then writes a new DPAPI record for this Windows user. Choose the new device's sync scope before import; old local paths and scope are not silently reused. Both credentials can be copied when needed. Returning to the original device uses its local record without signing in again.

Version 0.3.0 and older deployments need a one-time **Save new-device recovery record** operation on a computer that still has the original record, after Cloudflare sign-in. Lost credentials cannot be read back from Worker Secrets. If saving recovery fails after a healthy deployment, this device can still work; retry only the recovery write.

Recovery copies live in the account-private `context-anywhere-recovery-v1` KV namespace, separate from notes and OAuth data and never bound to the mirror Worker. Cloudflare encrypts KV at rest and in transit. Authorized account KV administrators can read this copy; it is not an end-to-end encrypted vault. No Cloudflare login token, note content or local vault path is archived. Scrolling, controls, dropdowns and expandable sections have short transitions that follow the Windows animation preference.

Each deployment uses separate Worker, R2, and OAuth KV resources. Cloudflare credentials stay in the current session. Mirror keys and deployment records use Windows DPAPI in `%LOCALAPPDATA%\ContextAnywhereSetup\deployment.dpapi`. Exported connection instructions contain no passwords. Deleting the app folder does not delete your vault, cloud resources, or deployment record. The app is unsigned.

R2 Standard includes 10 GB-month of storage, 1 million Class A operations, and 10 million Class B operations per month, with free egress. Check [Cloudflare pricing](https://developers.cloudflare.com/r2/pricing/) for usage above those allowances.
