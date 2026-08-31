# Context Anywhere

> **你的笔记归你，你的 AI 随便换，两者不必绑在同一台设备上，让你的知识库随时随地易于访问。**

**中文** · [English](README.md)

## 功能概述

Context Anywhere 是一套把 Obsidian 知识库变成 **AI 可远程读取的私人上下文层** 的完整工作流。

它的功能：让任意支持自定义MCP的AI 无论网页，APP 或是其他设备上的 harness agent 能够访问你的知识库，随时随地让AI利用你的知识库跟你协作，无需Vault和AI必须在同一台设备上，同时也实现了同步插件做的事。

宗旨就是：你可以今天用 ChatGPT，明天换另一个 AI（只要你设置了自定义的MCP）；可以在 Windows 上整理笔记，在 iPhone 上补一句，然后从网页 AI 里继续讨论,不被局限于一台设备中。

例如一个很好的使用场景：
- 你只负责随手记录
- 随时随地交给 AI 负责扩散、串联、找历史上下文，
- 再判断：继续做 / 变项目 / 以后再说 / 垃圾桶
- 把杂乱的idea 变成可执行的规划


传统的AI插件就是在你的侧边栏开一个codex或其他agent，你电脑关闭则一切归零；所以它不是又一个在 Obsidian 里塞聊天框的 AI 插件。

## 工作流程

在Obsidian中安装AI Bridge插件，你的内容将在远端由Cloudflare Worker 存进 R2 桶，并可以由任意接入了 MCP Server 的 AI 搜索或读取。

默认情况下，AI Bridge 是单向镜像：插件把所有MD内容发给 Worker，由 Worker 鉴权并存进独立的 R2 桶。插件也提供可选的双向同步，但它**默认关闭**。`.obsidian`、本地冲突副本目录和密钥等敏感设置始终排除，不会被上传。

当然，也支持你自主选择要镜像的目录，指定目录之外的任何文件则被排除，这种模式适合你已经有主同步库并设置过加密，但是想要一个独立的不加密的桶专门存放方便暴露给AI的内容。

开启附件同步后，AI Bridge 会检查哪些附件被允许范围内的笔记引用。附件可以放在 `日记/assets/` 这类嵌套目录中，不必集中到一个总附件文件夹。附件大小上限可以调整，默认 8 MiB；没有被笔记引用的附件不会进入镜像。

同时，AI 可以通过 MCP Server 访问 Worker。用户完成 OAuth 授权后，Worker 会向 MCP 客户端颁发具有只读权限的 OAuth Access Token，用于搜索和读取镜像内容

mcp功能如下：

| 工具                      | 用途                 |
| ----------------------- | ------------------ |
| `search_notes`          | 搜索镜像中的笔记路径和正文      |
| `get_note`              | 读取一篇 Markdown 笔记   |
| `recent_notes`          | 查看最近修改的笔记          |
| `list_note_attachments` | 查看某篇笔记允许提供给 AI 的附件 |
| `read_attachment`       | 读取允许的图片或显式开放的 PDF  |


一旦内容已经进入远端镜像，AI 读取它时就不需要再去连接存放主库的那台电脑。

AI 写入部分，让其把要输出的内容返回obsidian官方url以写入你自己的设备，例如：

```
obsidian://new?vault=<vault>&file=<path>&content=<经过URL编码的内容>&append
```
设备打开这个 URI 后，由本机 Obsidian 真正执行写入。

设备完成写入后，AI Bridge 和你设置的其他同步各自负责后续同步。MCP 客户端将没有直接操作镜像内容的写权限。





## 快速部署


### 1. 安装 AI Bridge 插件

从**Obsidian 社区插件：** https://community.obsidian.md/plugins/ai-bridge

**手动安装：** 如果使用 Release 里的构建文件，复制下面三个文件：

```text
main.js
manifest.json
styles.css
```

到你的 Vault：

```text
<你的 Vault>/.obsidian/plugins/ai-bridge/
```

然后进入 **设置 → 第三方插件**，启用 **AI Bridge**。

如果你是从源码构建插件，先在项目根目录执行：

```powershell
npm install
npm run build
```

再复制上面的三个构建文件。

### 2. 检查源码并登录 Cloudflare

需要 Cloudflare 账号、Node.js/npm，以及本项目源码。

在项目根目录执行：

```powershell
npm install
npm --prefix worker install
npm run check
cd worker
npx wrangler login
npx wrangler whoami
```

`npm run check` 会检查插件和 Worker 是否能正常测试、构建和 dry-run；它通过不代表真实 Cloudflare 资源已经绑定成功。

### 3. 创建 R2 和 OAuth KV

在 `worker` 目录创建两个独立资源：

```powershell
npx wrangler r2 bucket create my-obsidian-ai-mirror
npx wrangler kv namespace create my-obsidian-ai-mirror-oauth
```

创建 KV 后记下 Cloudflare 返回的 **Namespace ID**。

如果你本来已经有加密主同步桶，这里的 R2 应该新建一个独立镜像桶，不要直接复用主同步桶。

### 4. 创建 Worker 配置

从公开模板生成真实配置：

```powershell
Copy-Item .\wrangler.example.toml .\wrangler.toml
```

打开 `worker/wrangler.toml`，至少确认：

- `name` 是你的 Worker 名称；
- `bucket_name` 是刚创建的 AI Mirror R2 Bucket；
- `id` 是刚创建的 KV Namespace ID；
- R2 binding 保持为 `AI_MIRROR`；
- KV binding 保持为 `OAUTH_KV`。

不要把真实 Secret 写进 `wrangler.toml`。

### 5. 创建两个 Secret 并部署 Worker

用 Node.js 生成两个不同的随机值：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

分别作为：

- `MIRROR_TOKEN`：给 Obsidian 插件上传/同步使用；
- `MIRROR_READ_KEY`：只在 Worker 的 OAuth 授权页面输入。

写入 Cloudflare：

```powershell
npx wrangler secret put MIRROR_TOKEN --config wrangler.toml
npx wrangler secret put MIRROR_READ_KEY --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

Wrangler 部署完成后会返回 Worker HTTPS 地址。

注意两种地址不要填反：

- Obsidian AI Bridge 填 Worker **根地址**，例如 `https://xxx.workers.dev`；
- AI 客户端填完整 MCP 地址：`https://xxx.workers.dev/mcp`。

### 6. 配置 Obsidian AI Bridge

进入：

**设置 → AI Bridge**

填写：

1. Worker 根地址；
2. Write Token（`MIRROR_TOKEN`）；
3. 需要镜像的目录；
4. 是否上传附件；
5. 是否开启可选的双向同步；
6. 一个好认的设备名称；
7. 是否开启定时同步以及同步间隔。

然后测试连接并执行一次完整同步。

如果目录列表留空，就会允许所有符合条件的 Markdown 进入镜像。

双向同步默认关闭。开启后，较新的修改会成为正式版本，较旧的冲突版本会被保存在 `AI Bridge Conflicts`。这个文件夹只用于让你本机检查，不会再次上传。这里做的是简单、透明的“修改时间较新者胜出”，不是把两篇文章逐段智能拼接。

如果你像我一样已经有加密主同步，更建议明确填写目录，不要偷懒留空。

### 7. 把设置传到 移动设备

在已经配置好的设备上创建“加密设置链接”。

插件会要求你设置一个临时传输密码，然后把当前 Worker 地址、Write Token 和 AI Bridge 配置整体加密进一个 `obsidian://` 链接。

到移动设备上打开或粘贴这个链接，再输入同一个临时密码即可导入。

### 8. 连接 AI

首先需要去账户安全那里开启开发者模式并允许非官方MCP插件（如果你的ai客户端要求）、

MCP Endpoint：

```text
https://<你的-worker-domain>/mcp
```

客户端支持 OAuth 时选择 OAuth。

授权页面会由 AI Bridge Worker 自己显示，并要求输入 Mirror Read Password。

通过后，AI 拿到的是只读 OAuth Access Token，而不是上传用的 Write Token。

### 9.使用方法

使用 @ （以gpt为例） 调用插件并直接用人话说出你的需求，剩下的交给AI

## License

本项目采用 **PolyForm Noncommercial License 1.0.0**。

允许个人学习、研究、修改和非商业使用；具体条款以仓库中的 `LICENSE` 原文为准。

## 可能的费用

### Cloudflare Workers

Worker Free 目前包含：

- 每天 **100,000 次请求**；
- 每次请求最多 **10 ms CPU 时间**。

对于个人知识库的同步和 MCP 读取通常已经非常宽裕。需要更高额度时，Workers Paid 当前最低为 **$5 / 月 / 账户**。

官方价格：<https://developers.cloudflare.com/workers/platform/pricing/>

### Cloudflare R2

AI Mirror 建议使用 **R2 Standard**。当前每月免费额度为：

- **10 GB-month** 存储；
- **1,000,000 次 Class A** 操作（主要是写入、修改等）；
- **10,000,000 次 Class B** 操作（主要是读取等）；
- 公网 **Egress（流出流量）免费**。

超过免费额度后的 Standard 价格目前为：

- 存储：**$0.015 / GB-month**；
- Class A：**$4.50 / 100 万次**；
- Class B：**$0.36 / 100 万次**。

对以 Markdown 为主、只有少量图片附件的个人 Vault 来说，正常使用通常很难超过免费额度。

官方价格：<https://developers.cloudflare.com/r2/pricing/>

### Cloudflare Workers KV

KV 在这里只保存 OAuth 相关状态，不保存你的笔记正文。

Free Plan 当前包含：

- **1 GB** 存储；
- 每天 **100,000 次读取**；
- 每天 **1,000 次写入 / 删除 / List**。

这个项目正常个人使用的 OAuth 状态量非常小，通常不会接近上述限制。

Workers Paid 下，KV 当前超额价格为：

- 读取：**$0.50 / 100 万次**；
- 写入、删除、List：**$5.00 / 100 万次**；
- 存储：**$0.50 / GB-month**。

官方价格与限制：<https://developers.cloudflare.com/workers/platform/pricing/> · <https://developers.cloudflare.com/kv/platform/limits/>
