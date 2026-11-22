# Context Anywhere

[English](README.md) · **中文**

在 Obsidian 里记，在你常用的 AI 里问。**Context Anywhere 把你选中的笔记同步到自己的 Cloudflare 账号，让 AI 从手机或网页也能读到。** 同步完成后，存放原始知识库的电脑就可以关机了。

比如，你这周在 Windows 和 iPhone 上陆续记了几次项目讨论。开会前，打开 AI 聊天，问一句「翻翻上周的项目笔记，哪些决定还没定？把出处也给我。」换一个 AI 客户端时，把它接到同一份镜像就行。

## Windows 快速开始

准备一个已启用 R2 的 Cloudflare 账号、一个本地 Obsidian 知识库，以及一个支持远程 MCP 和 OAuth 的 AI 客户端。**AI Bridge 是 Obsidian 端的同步插件**，云端镜像由向导在你的账号下创建。

1. 在要同步的知识库里安装并启用 [AI Bridge 社区插件](https://community.obsidian.md/plugins/ai-bridge)。
2. 下载 Windows x64 的 ZIP，完整解压，打开 `ContextAnywhere.exe`。[下载 Windows 向导](https://github.com/uid21/Context-Anywhere/releases?q=windows-setup)
3. 选择本机知识库，登录 Cloudflare，选好允许同步的文件夹或笔记。首次使用时创建镜像，换电脑时选原来的部署。保持 Obsidian 打开，点击「导入 Obsidian」，检查首次同步结果。
4. 在向导的「接入 AI」复制以 `/mcp` 结尾的地址，到 AI 客户端添加远程 MCP 连接。选择 OAuth，在你自己的镜像授权页输入读取密码。完成后，试着让 AI 找出一篇刚同步的笔记。

**用 Gemini？** 在网页版的 Connected Apps 中添加 Custom app，粘贴 MCP 地址，Client ID 和 Client secret 留空。找不到该入口时，先核对 Google 对账号和地区的开放条件。[Gemini 官方说明](https://support.google.com/gemini/answer/17209137)

[Windows 向导、换机恢复与密码管理](installer/README.md) · [macOS、Linux 或命令行部署](docs/manual-setup.zh-CN.md)

## 哪些内容会被共享？

- **你选范围。** 可以从一个文件夹开始，也可以选择整个库。启用附件同步后，插件只处理允许笔记引用的受支持附件。已有加密主库的用户可以给 AI 单独建镜像。
- **AI 只读。** 它可以搜索笔记、读取正文和允许的附件。想把一段回答存回去，可以让 AI 生成 `obsidian://` 链接，由你点击并在本机 Obsidian 中写入。
- **你也能跨设备同步。** 默认由 Obsidian 上传到镜像。在另一台设备安装 AI Bridge、导入加密设置链接并开启双向同步，就可以下载所选笔记。发生冲突时，较旧版本保存在本机的 `AI Bridge Conflicts` 文件夹。

Cloudflare 按资源用量计费，免费额度和超额价格以官方为准。[Workers 与 KV 价格](https://developers.cloudflare.com/workers/platform/pricing/) · [R2 价格](https://developers.cloudflare.com/r2/pricing/)

本项目采用 [PolyForm Noncommercial 1.0.0 许可证](LICENSE)。
