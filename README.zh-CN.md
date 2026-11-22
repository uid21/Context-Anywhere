# Context Anywhere

[English](README.md) · **中文**

工具当各司其职，在 Obsidian 里记，直接在任何远端 AI 里问，在任何地点、设备上看，存放原始知识库的设备直接关机。**Context Anywhere 把你选中的笔记同步到自己的 Cloudflare 账号，让你和 AI 从手机或网页也能读到。** 

让任意支持自定义MCP的AI 无论网页，APP 或是其他设备上的 harness agent 能够访问你的知识库，随时随地让AI利用你的知识库跟你协作，无需Vault和AI必须在同一台设备上。

## 如何部署

### Windows快速开始

准备一个已启用 R2 的 Cloudflare 账号、一个本地 Obsidian 知识库，以及任意支持远程 MCP 和 OAuth 的 AI 客户端。**AI Bridge 是 Obsidian 端的同步插件**，云端镜像由向导在你的账号下创建。

1. 在要同步的知识库里安装并启用 [AI Bridge 社区插件](https://community.obsidian.md/plugins/ai-bridge)（或在release中下载）。
2. 下载 Windows x64 的 ZIP，完整解压，打开 `ContextAnywhere.exe`。[下载 Windows 向导](https://github.com/uid21/Context-Anywhere/releases?q=windows-setup)
3. 选择本机知识库，登录 Cloudflare，选好允许同步的文件夹或笔记。首次使用时创建镜像，换电脑时选原来的部署。保持 Obsidian 打开，点击「导入 Obsidian」，检查首次同步结果。
4. 在向导的「接入 AI」复制以 `/mcp` 结尾的地址，到 AI 客户端添加远程 MCP 连接。选择 OAuth，在你自己的镜像授权页输入读取密码。完成后，试着让 AI 找出一篇刚同步的笔记。**在跳转的OAuth界面中填写你的 READ_KEY而不是在AI设置里**.

更多功能信息 [Windows 向导、换机恢复与密码管理](installer/README.md) 

### macOS/Linux 或手动构建

 [macOS、Linux 或手动构建](docs/manual-setup.zh-CN.md)

### 交给 Agent 部署

点下方代码块右上角的「复制」，把提示词粘贴给能操作本机和终端的 Agent。

```text
请帮我部署 Context Anywhere：https://github.com/uid21/Context-Anywhere
打开仓库，按 README.zh-CN.md、AGENTS.md 和对应的部署文档执行。Windows 优先用发布版向导，只有终端时走命令行。先核对我的 Cloudflare 账号、Obsidian 库和允许共享的范围。有镜像就恢复，没有就新建独立镜像。需要我登录或授权时交给我，完成后继续。
在 Obsidian 里配置 AI Bridge 并同步，再给我的 AI 客户端添加远程 MCP，用 OAuth 接入，实际读到一篇获准共享的笔记。最后告诉我 MCP 地址、实际同步范围和验证结果。凭据留在安全存储和对应授权入口里。
```

[完整版部署提示词](docs/deploy-with-agent.zh-CN.md)

## 它的原理

在 Obsidian 中安装 **AI Bridge** 插件后，你的笔记内容会通过 Cloudflare Worker 同步到你私有的 R2 存储桶中，并由 Worker 对外提供标准的 MCP Server 接口。

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

设备打开这个 URI 后，由本机 Obsidian 真正执行写入。设备完成写入后，AI Bridge 和你设置的其他同步各自负责后续同步。MCP 客户端将没有直接操作镜像内容的写权限。


### 哪些内容会被共享？

- **你选范围。** 可以从一个文件夹开始，也可以选择整个库。启用附件同步后，插件只处理允许笔记引用的受支持附件。已有加密主库的用户可以给 AI 单独建镜像。
- **AI 只读。** 它可以搜索笔记、读取正文和允许的附件。
- **你也能跨设备同步。** 默认由 Obsidian 上传到镜像。在另一台设备安装 AI Bridge、导入加密设置链接并开启双向同步，就可以下载所选笔记。发生冲突时，较旧版本保存在本机的 `AI Bridge Conflicts` 文件夹。
- **按需同步附件：** 开启附件同步后，仅上传被白名单内笔记实际引用到的附件（支持 `日记/assets/` 等任意嵌套目录，无需集中存放）。默认单文件上限 8 MiB，未被笔记引用的孤立附件不会进入镜像。

## 如何使用

使用@ （或取决于AI客户端设定）唤起插件，用人话说需求

## 费用预估（Cloudflare 免费额度）

对于以 Markdown 文本为主、包含少量图片附件的个人知识库，日常使用完全在 Cloudflare 免费额度（Free Plan）覆盖范围内，基本实现零成本运行：

- **Cloudflare Workers**：免费版包含每天 100,000 次请求（单次 10 ms CPU 时间）。超出后 Paid 计划最低 $5/月。官方定价：[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)
- **Cloudflare R2**：免费版包含每月 10 GB 存储、100 万次 Class A 操作（写入/修改）、1,000 万次 Class B 操作（读取），且公网流出流量（Egress）全免。官方定价：[R2 价格](https://developers.cloudflare.com/r2/pricing/)
- **Cloudflare Workers KV**：仅用于存储轻量级的 OAuth 授权状态，不存笔记正文。免费版包含 1 GB 存储、每天 100,000 次读取及 1,000 次写入/删除。官方定价：[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)；限制说明：[KV 限制](https://developers.cloudflare.com/kv/platform/limits/)


本项目采用 [PolyForm Noncommercial 1.0.0 许可证](LICENSE)，具体条款见原文。