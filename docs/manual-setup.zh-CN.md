# 通过命令行部署镜像

[English](manual-setup.md) · [项目介绍](../README.zh-CN.md)

适用于 macOS、Linux，或想自己管理 Worker 的用户。Windows 用户也可以直接使用[图形向导](../installer/README.md)。

## 创建镜像

1. 在 Cloudflare 账号启用 R2，下载或克隆本仓库，安装 [`.node-version`](../.node-version) 指定的 Node.js 版本，在项目根目录打开终端。
2. 安装 Worker 依赖，登录 Cloudflare，用 `whoami` 核对当前账号。

   ```sh
   cd worker
   npm ci
   npm run wrangler -- login
   npm run wrangler -- whoami
   ```

3. 分别为 Worker、存放镜像笔记的独立 R2 桶、保存 OAuth 授权的 KV 命名空间取名。替换下面的资源名，记下第二条命令返回的 Namespace ID。

   ```sh
   npm run wrangler -- r2 bucket create my-notes-mirror
   npm run wrangler -- kv namespace create my-notes-oauth
   ```

4. 复制 `wrangler.example.toml` 为 `wrangler.toml`。把 `name` 改为 Worker 名称，`AI_MIRROR` 下的 `bucket_name` 改为新建的桶名，`OAUTH_KV` 下的 `id` 改为刚才的 Namespace ID。保留模板的 binding 名称。部署后保存终端显示的 HTTPS 地址。

   ```sh
   npm run wrangler -- deploy --config wrangler.toml
   ```

5. 为每把密钥分别运行一次随机值生成命令，存入密码管理器，再按 Wrangler 提示分别粘贴。

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   npm run wrangler -- secret put MIRROR_TOKEN --config wrangler.toml
   npm run wrangler -- secret put MIRROR_READ_KEY --config wrangler.toml
   ```

   `MIRROR_TOKEN` 是给 Obsidian 的上传凭据，`MIRROR_READ_KEY` 是镜像 OAuth 授权页的读取密码。想单独给某项服务密码时，再生成一个随机值，取一个空闲编号，例如运行 `npm run wrangler -- secret put MIRROR_READ_KEY_17 --config wrangler.toml`。编号从 2 起，可以跳号，原有密码继续生效。请把密码保存在配置文件之外。

## 同步一篇笔记，再让 AI 读取

1. 在要同步的知识库安装并启用 [AI Bridge](https://community.obsidian.md/plugins/ai-bridge)。打开插件设置，填写 Worker 根地址（例如 `https://my-mirror.example.workers.dev`）和上传凭据。每行填写一个要共享的库内文件夹或笔记路径。列表留空时，所有符合条件的 Markdown 都会进入同步范围。
2. 测试连接，执行一次完整同步。要同步附件，打开附件选项。AI 可读受支持的图片。要让 AI 读取 PDF，请在引用它的笔记属性中设置 `ai-attachments: true`。
3. 在 AI 客户端添加远程 MCP，填写 **Worker 地址加 `/mcp`**，选择 OAuth，在镜像授权页输入读取密码。让它查找刚同步的笔记。[Gemini 连接说明](https://support.google.com/gemini/answer/17209137)

首次需要用向导找回密码时，登录原 Cloudflare 账号，选择「连接手动部署」，填写 Worker 名称和 AI Bridge 的上传凭据。登记后，Worker 会备份已生效的读取密码，其他电脑也可以用向导取回。[恢复与密码管理](../installer/README.md)
