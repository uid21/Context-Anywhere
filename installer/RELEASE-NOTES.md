Windows x64 原生安装向导，基于 GitHub 公开版 Context Anywhere。安装后双击即可配置，无需安装 Node/npm，也无需运行本地网页服务。

向导检查账号与 Obsidian 插件前提，提供知识库选择、Cloudflare 授权、同步目录、附件、设备名、同步时间和双向同步选项。每次安装创建带随机后缀的独立 Worker、R2、OAuth KV；通过加密链接导入插件设置。其他 AI 提供可复制的 MCP 地址、只读密码、JSON 和 Codex 配置。

需要 Windows 10/11 x64、Chrome、已启用 R2 的 Cloudflare 账号，以及已安装并启用的 AI Bridge。附带插件 0.4.1 文件，支持导入后的自动首次同步；0.4.0 也支持导入，首次同步需手动点击插件的云上传按钮。

实际验收通过：原生界面部署独立资源、Obsidian 加密导入及自动首次同步、37 项新镜像 OAuth/MCP 线上检查、最终安装包安装与卸载。另有 33 项插件/Worker/安装器测试通过。测试只上传合成笔记，生产镜像和主知识库未参与。Cloudflare 浏览器授权路径尚未实跑；本次通过已有 OAuth 凭证在 Token 栏完成部署。详见源码中的 `installer/ACCEPTANCE.md`。

这是预发布版本。ChatGPT 自动接入已实现 Chrome DevTools 操作，但现有 test Chrome 的真实网页验收被 Computer Use 的 URL 识别检查终止，因此尚未确认自动创建、安装和读取成功；必要时使用向导的手动连接信息。日常 Chrome 默认目录不能直接开放 DevTools，自动模式使用向导专用会话或已经开放的本机调试端口。账号需要支持自定义 MCP，界面变化可能影响自动操作。

安装包尚未签名，Windows 可能提示未知发布者。卸载保留知识库、云端资源和本机加密安装记录。
