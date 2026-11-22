# Context Anywhere Windows 向导

[English](#english) · [项目介绍](../README.zh-CN.md)

## 第一次部署

需要 Windows 10/11 x64、已启用 R2 的 Cloudflare 账号，以及安装并启用了 AI Bridge 的 Obsidian 知识库。[下载 Windows ZIP](https://github.com/uid21/Context-Anywhere/releases?q=windows-setup) · [安装 AI Bridge](https://community.obsidian.md/plugins/ai-bridge)

1. 完整解压 ZIP，运行 `ContextAnywhere.exe`。向导自带运行环境。选择本机知识库的根目录，点击「检查并继续」。如果你在 Obsidian 里改过配置目录名，展开对应选项填写。
2. 在默认浏览器登录 Cloudflare，授权后回到向导选择账号。第一次使用时创建独立镜像。如果已经有镜像，先在列表中选择原部署。
3. 选择允许同步的文件夹、笔记或整个知识库，预览笔记数。附件和双向同步都可以单独开启。同步单篇笔记需要 AI Bridge 0.4.3 或以上。若社区版暂未更新，退出 Obsidian，用 ZIP 的 `obsidian-plugin` 目录中的三个文件更新库里的插件目录，保留现有 `data.json`，再打开 Obsidian。
4. 完成部署后，打开所选知识库，点击「导入 Obsidian」，再点「检查导入结果」。如果尚无同步记录，在 Obsidian 中点击 AI Bridge 的云上传图标同步一次。
5. 点击「接入 AI」。给客户端填写以 `/mcp` 结尾的地址，读取密码只粘贴在**你自己镜像的 OAuth 授权页**。Gemini 在网页版 Connected Apps 添加 Custom app，Client ID 和 Client secret 留空；授权后可在聊天中输入 `@` 选中它。[Google 的账号与地区要求](https://support.google.com/gemini/answer/17209137)

## 找回已有镜像

换电脑或本机加密记录打不开时，1.1 版向导首页可选「从 Cloudflare 找回已有部署」。登录原账号，选择对应部署，点击「恢复此部署」。只想给新 AI 接入时，到这里就可以复制凭据；要同步本机笔记，再选择这台电脑上的知识库和同步范围。恢复成功后向导会保留原先无法读取的本机文件副本。

如果列表为空，先核对账号。原先用命令行手动部署的镜像，可以选「连接手动部署」，填写当前 Worker 名称和 AI Bridge 的上传凭据。向导核对云资源和镜像身份后，将它加入该账号的恢复列表。

## 管理读取密码

新镜像只有一把默认读取密码。忘了旧密码，或想给一个服务独立的密码时，登录原 Cloudflare 账号，在「凭据与新设备恢复」中选「新增读取密码」。可以给它取名，例如 Gemini 工作账号。原密码和已连接的客户端都可继续使用。接入 AI 时，选择要给这项服务的密码。所有读取密码都能读同一份镜像。

- **从 Cloudflare 手动添加。** 在该 Worker 的 Secrets 里添加一个空闲编号，例如 `MIRROR_READ_KEY_17`。原始密码叫 `MIRROR_READ_KEY`，后续密码使用从 2 开始的整数后缀，可以跳号。每把使用独立的随机值。
- **在别的设备找回。** 先登录原账号并选择镜像。在云端改过密码后，打开向导的凭据页即可刷新、选择并复制当前值，无需知道旧密码。离线时列表会标明来自本机缓存。
- **停止使用一把密码。** 从列表中移除它，会停止用这把密码直接读取或发起新的授权。要停止已有 OAuth 访问，还需要在对应客户端解除授权。

首次登记恢复后，Worker 会在成功的 REST 或 MCP 访问后更新加密密码清单。镜像完全空闲时，向导的在线刷新会触发即时更新。清单存放在镜像的 R2 桶，解密材料和部署索引存放在账号私有的恢复 KV。笔记、MCP 工具与导出的连接说明均不提供密码。当前 Windows 设备使用 DPAPI 保护本机缓存。

## English

### First setup

Use Windows 10/11 x64, a Cloudflare account with R2 enabled and an Obsidian vault with AI Bridge installed and enabled. [Download the portable ZIP](https://github.com/uid21/Context-Anywhere/releases?q=windows-setup) · [Install AI Bridge](https://community.obsidian.md/plugins/ai-bridge)

1. Extract the entire ZIP and open `ContextAnywhere.exe`. It includes its own runtime. Select the root of your local vault and choose **Check and continue**. If you use a custom Obsidian configuration folder, enter its name.
2. Sign in to Cloudflare in your browser and choose the account in the wizard. Create a new mirror on first use, or select your existing deployment.
3. Select folders, individual notes or the whole vault. Preview the count before continuing. Attachments and two-way sync are optional. Individual notes require AI Bridge 0.4.3 or later. If the community update is pending, close Obsidian and copy the three files from the ZIP’s `obsidian-plugin` folder into the vault’s AI Bridge plugin folder. Keep your existing `data.json` and reopen Obsidian.
4. Open that vault, select **Import into Obsidian** and check the import result. If there is no sync record yet, select the plugin’s cloud upload icon in Obsidian.
5. Select **Connect your AI**. Give the client the URL ending in `/mcp` and enter the read password on **your mirror’s OAuth authorization page**. In Gemini on the web, open Connected Apps and add a custom app. Leave Client ID and Client secret blank. After authorization, use `@` to select your app in chat. [Google’s availability requirements](https://support.google.com/gemini/answer/17209137)

### Restore an existing mirror

On a new computer, or when Windows cannot open the local encrypted record, choose the Cloudflare recovery option on the first page of setup 1.1. Sign in to the original account, select the deployment and restore it. You can copy credentials and connect an AI immediately. To sync locally, choose the vault on this computer and select its scope. Setup retains a copy of an unreadable local record when replacing it after recovery.

If no deployment is listed, check the account. To register a mirror deployed manually, choose the manual deployment option, enter its Worker name and the upload credential from AI Bridge. Setup verifies the resources and the live mirror before adding it to the account’s recovery list.

### Manage read passwords

New mirrors start with one read password. If you forgot it or want a separate password for one service, sign in to Cloudflare, open **Credentials and new-device recovery** and add a read password. Give it a recognizable name, such as “Gemini work account”. Existing passwords and connected clients continue to work. Choose the password to use when connecting each AI. Every read password covers the same mirror.

- **To add a password in Cloudflare**, add a Worker secret with an unused name such as `MIRROR_READ_KEY_17`. The original is `MIRROR_READ_KEY`. Additional passwords take numeric suffixes starting at 2 and can skip numbers. Generate a distinct random value for each secret.
- **To retrieve a password on another computer**, sign in to the original account and select the mirror. The credentials panel refreshes the list from Cloudflare, including manual changes. You can select and copy a password without entering its previous value. When offline, setup identifies the locally cached list.
- **To retire a password**, remove it in the wizard. This stops direct reads and future authorizations using that password. Unlink the OAuth grant in the client to stop an existing connection.

Once recovery is registered, the Worker refreshes its encrypted password list after successful REST or MCP traffic. On an idle mirror, an online wizard refresh triggers the update. The ciphertext lives in the mirror’s R2 bucket. The account-private recovery KV holds the decryption material and deployment index. The Windows cache is protected with DPAPI. Notes, MCP tools and exported setup instructions do not expose passwords.
