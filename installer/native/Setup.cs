using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace ContextAnywhereSetup {
  static class Program {
    [STAThread] static void Main() {
      Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
      bool first;
      using (var single = new Mutex(true, "Local\\ContextAnywhereSetup-" + Environment.UserName, out first)) {
        if (!first) { MessageBox.Show("安装向导已经打开，请返回那个窗口继续。", "Context Anywhere"); return; }
        Application.Run(new SetupForm());
      }
    }
  }

  class Rpc : IDisposable {
    readonly Process process;
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Dictionary<int, TaskCompletionSource<Dictionary<string, object>>> pending = new Dictionary<int, TaskCompletionSource<Dictionary<string, object>>>();
    int sequence;
    public event Action<string> Progress;
    public Rpc() {
      var root = AppDomain.CurrentDomain.BaseDirectory;
      var start = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "\"" + Path.Combine(root, "app", "bridge.mjs") + "\"");
      start.WorkingDirectory = root; start.UseShellExecute = false; start.CreateNoWindow = true;
      start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      start.StandardOutputEncoding = Encoding.UTF8; start.StandardErrorEncoding = Encoding.UTF8;
      start.EnvironmentVariables["CA_SETUP_ROOT"] = root;
      process = new Process(); process.StartInfo = start; process.EnableRaisingEvents = true;
      process.OutputDataReceived += (sender, eventArgs) => {
        if (String.IsNullOrEmpty(eventArgs.Data)) return;
        try {
          var message = json.Deserialize<Dictionary<string, object>>(eventArgs.Data);
          if (message.ContainsKey("progress")) { var progress = Progress; if (progress != null) progress(Convert.ToString(message["progress"])); return; }
          var id = Convert.ToInt32(message["id"]); TaskCompletionSource<Dictionary<string, object>> completion;
          lock (pending) { if (!pending.TryGetValue(id, out completion)) return; pending.Remove(id); }
          completion.TrySetResult(message);
        } catch { Fail(new Exception("安装器收到无法识别的后台响应，请关闭后重新打开。")); }
      };
      // Provider/automation errors can contain secrets. The bridge reports sanitized errors on stdout.
      process.ErrorDataReceived += (sender, eventArgs) => {};
      process.Exited += (sender, eventArgs) => Fail(new Exception("安装器后台已退出。请重新打开安装向导继续。"));
      process.Start(); process.StandardInput.NewLine = "\n"; process.BeginOutputReadLine(); process.BeginErrorReadLine();
    }
    void Fail(Exception error) {
      lock (pending) { foreach (var completion in pending.Values) completion.TrySetException(error); pending.Clear(); }
    }
    public Task<Dictionary<string, object>> Call(string action, Dictionary<string, object> input) {
      var id = ++sequence; var completion = new TaskCompletionSource<Dictionary<string, object>>();
      lock (pending) pending.Add(id, completion);
      try { process.StandardInput.WriteLine(json.Serialize(new { id = id, action = action, input = input })); process.StandardInput.Flush(); }
      catch { lock (pending) pending.Remove(id); completion.TrySetException(new Exception("安装器后台无法连接，请重新打开向导。")); }
      return completion.Task;
    }
    public void Dispose() {
      try { process.StandardInput.Close(); if (!process.WaitForExit(2000)) process.Kill(); } catch {}
      process.Dispose();
    }
  }

  class SetupForm : Form {
    readonly Color ink = Color.FromArgb(34,49,57), blue = Color.FromArgb(23,107,145), paper = Color.FromArgb(247,249,250);
    readonly Panel content = new Panel(); readonly Panel side = new Panel();
    readonly Label status = new Label(), stepLabel = new Label();
    readonly Button back = new Button(), next = new Button();
    readonly ProgressBar progressBar = new ProgressBar();
    readonly List<FlowLayoutPanel> pages = new List<FlowLayoutPanel>();
    readonly List<Label> steps = new List<Label>(); readonly List<Control> fields = new List<Control>();
    readonly Dictionary<string, TextBox> text = new Dictionary<string, TextBox>();
    readonly Dictionary<string, CheckBox> checks = new Dictionary<string, CheckBox>();
    readonly Dictionary<string, NumericUpDown> numbers = new Dictionary<string, NumericUpDown>();
    readonly ComboBox accounts = new ComboBox();
    readonly Label vaultResult = new Label(), previewResult = new Label(), deployResult = new Label(), importResult = new Label(), gptResult = new Label();
    readonly List<Dictionary<string, object>> accountList = new List<Dictionary<string, object>>();
    Rpc rpc; Dictionary<string, object> state = new Dictionary<string, object>(); int step; bool busy;

    public SetupForm() {
      Text = "Context Anywhere · Windows 安装向导"; Size = new Size(1060, 820); MinimumSize = new Size(870, 660);
      StartPosition = FormStartPosition.CenterScreen; Font = new Font("Segoe UI", 10F); BackColor = paper; ForeColor = ink;
      AutoScaleMode = AutoScaleMode.Dpi;
      side.Dock = DockStyle.Left; side.Width = 230; side.BackColor = Color.FromArgb(231,241,246); Controls.Add(side);
      var logo = new Label { Text = "C ↗ A", Font = new Font("Bahnschrift", 27F, FontStyle.Bold), Location = new Point(24,30), AutoSize = true, ForeColor = blue }; side.Controls.Add(logo);
      side.Controls.Add(new Label { Text = "Context Anywhere", Font = new Font("Segoe UI", 13F, FontStyle.Bold), Location = new Point(24,90), AutoSize = true });
      side.Controls.Add(new Label { Text = "Windows 安装向导 0.1.0", ForeColor = Color.SlateGray, Location = new Point(24,120), AutoSize = true });
      var titles = new[] { "准备好你的知识库", "连接 Cloudflare", "选择同步范围", "部署与导入", "接入你的 AI" };
      for (int i = 0; i < titles.Length; i++) {
        var label = new Label { Text = (i+1) + "   " + titles[i], Location = new Point(24, 195+i*52), Size = new Size(200,40), ForeColor = Color.SlateGray };
        steps.Add(label); side.Controls.Add(label);
      }
      var sideFoot = new Label { Text = "笔记留在自己的账号里。\nAI 随时可以换。", AutoSize = true, ForeColor = Color.SlateGray, Anchor = AnchorStyles.Left | AnchorStyles.Bottom, Location = new Point(24, 650) }; side.Controls.Add(sideFoot);
      var shell = new Panel { Dock = DockStyle.Fill, Padding = new Padding(30, 20, 30, 15) }; Controls.Add(shell); shell.BringToFront();
      var header = new Panel { Dock = DockStyle.Top, Height = 37 }; stepLabel.Dock = DockStyle.Left; stepLabel.Width = 200; stepLabel.ForeColor = Color.SlateGray; header.Controls.Add(stepLabel); shell.Controls.Add(header);
      var footer = new Panel { Dock = DockStyle.Bottom, Height = 100 };
      status.Dock = DockStyle.Top; status.Height = 43; status.AutoEllipsis = true; status.ForeColor = blue; footer.Controls.Add(status);
      progressBar.Dock = DockStyle.Top; progressBar.Height = 4; progressBar.Style = ProgressBarStyle.Marquee; progressBar.Visible = false; footer.Controls.Add(progressBar);
      back.Text = "上一步"; back.Size = new Size(92,35); back.Location = new Point(0,57); back.Click += (s,e) => ShowStep(step-1); footer.Controls.Add(back);
      next.Text = "下一步"; next.Size = new Size(145,35); next.Anchor = AnchorStyles.Right | AnchorStyles.Bottom; next.Location = new Point(570,57);
      next.BackColor = blue; next.ForeColor = Color.White; next.FlatStyle = FlatStyle.Flat; next.Click += async (s,e) => await Navigate(); footer.Controls.Add(next);
      footer.Resize += (s,e) => next.Left = footer.ClientSize.Width-next.Width;
      shell.Controls.Add(footer); content.Dock = DockStyle.Fill; shell.Controls.Add(content); content.BringToFront();
      BuildPages(); ShowStep(0);
      Shown += async (s,e) => {
        try { rpc = new Rpc(); rpc.Progress += value => { if (!IsDisposed) BeginInvoke((Action)(() => status.Text = value)); }; await Run("state", null); Restore(); }
        catch (Exception error) { Error(error.Message); }
      };
      FormClosing += (s,e) => {
        if (busy) { e.Cancel = true; status.Text = "当前操作尚未完成，请等结果后关闭。"; return; }
        if (rpc != null) rpc.Dispose();
      };
    }
    FlowLayoutPanel Page(string title, string intro) {
      var page = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(0,8,18,20), Visible = false };
      content.Controls.Add(page); pages.Add(page);
      page.Controls.Add(new Label { Text = title, Font = new Font("Segoe UI", 21F, FontStyle.Bold), AutoSize = true, Margin = new Padding(0,0,0,12) });
      Hint(page, intro, 650); return page;
    }
    void Hint(FlowLayoutPanel page, string value, int width = 650) {
      page.Controls.Add(new Label { Text = value, AutoSize = true, MaximumSize = new Size(width,0), ForeColor = Color.SlateGray, Margin = new Padding(0,2,0,15) });
    }
    void Heading(FlowLayoutPanel page, string value) {
      page.Controls.Add(new Label { Text = value, Font = new Font("Segoe UI", 13F, FontStyle.Bold), AutoSize = true, Margin = new Padding(0,25,0,10) });
    }
    TextBox Input(FlowLayoutPanel page, string key, string label, string value = "", bool password = false, int height = 28) {
      page.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(0,12,0,5) });
      var control = new TextBox { Text = value, Width = 650, Height = height, Multiline = height > 30, UseSystemPasswordChar = password, Margin = new Padding(0,0,0,8), ScrollBars = height > 30 ? ScrollBars.Vertical : ScrollBars.None };
      text.Add(key, control); fields.Add(control); page.Controls.Add(control); return control;
    }
    CheckBox Check(FlowLayoutPanel page, string key, string label, bool value = false) {
      var control = new CheckBox { Text = label, AutoSize = true, Checked = value, MaximumSize = new Size(650,0), Margin = new Padding(0,13,0,6) };
      checks.Add(key,control); fields.Add(control); page.Controls.Add(control); return control;
    }
    NumericUpDown Number(FlowLayoutPanel page, string key, string label, decimal value, decimal min, decimal max, int decimals = 0) {
      page.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(0,12,0,5) });
      var control = new NumericUpDown { Width = 160, Minimum = min, Maximum = max, Value = value, DecimalPlaces = decimals, Increment = decimals > 0 ? .5M : 1M, Margin = new Padding(0,0,0,8) };
      numbers.Add(key,control); fields.Add(control); page.Controls.Add(control); return control;
    }
    Button Action(FlowLayoutPanel page, string label, Func<Task> work) {
      var button = new Button { Text = label, AutoSize = true, Padding = new Padding(10,4,10,4), FlatStyle = FlatStyle.System, Margin = new Padding(0,12,0,8) };
      button.Click += async (s,e) => { try { await work(); } catch (Exception error) { Error(error.Message); } };
      fields.Add(button); page.Controls.Add(button); return button;
    }
    void Result(FlowLayoutPanel page, Label label) {
      label.AutoSize = true; label.MaximumSize = new Size(650,0); label.ForeColor = blue; label.Margin = new Padding(0,12,0,12); page.Controls.Add(label);
    }
    Dictionary<string, object> Args(params object[] items) {
      var data = new Dictionary<string, object>(); for (int i=0;i<items.Length;i+=2) data.Add((string)items[i],items[i+1]); return data;
    }
    string Value(Dictionary<string,object> data, string key, string fallback = "") { object value; return data.TryGetValue(key,out value) && value != null ? Convert.ToString(value) : fallback; }
    string NativeLines(string value) { return value.Replace("\r\n","\n").Replace("\n","\r\n"); }
    bool Bool(Dictionary<string,object> data, string key) { object value; return data.TryGetValue(key,out value) && value is bool && (bool)value; }
    Dictionary<string,object> Object(Dictionary<string,object> data, string key) { object value; return data.TryGetValue(key,out value) ? value as Dictionary<string,object> : null; }

    void BuildPages() {
      var page = Page("从你的知识库开始。", "你准备好账号和插件，剩下的部署和连接在这里设置。此向导为原生 Windows 程序，无需安装 Node 或运行本地网页服务。");
      Check(page,"cfAccountConfirmed","我已有 Cloudflare 账号，并已启用 R2");
      Hint(page,"R2 首次启用可能需要在 Cloudflare 页面登记付款方式；使用费用由你的账号承担。");
      Check(page,"pluginConfirmed","我已在 Obsidian 安装并启用 AI Bridge");
      Input(page,"vault","要接入的 Obsidian 知识库");
      Action(page,"选择知识库文件夹",() => { using (var picker = new FolderBrowserDialog { Description = "选择已安装 AI Bridge 的 Obsidian 知识库", ShowNewFolderButton = false }) { if (picker.ShowDialog(this)==DialogResult.OK) text["vault"].Text=picker.SelectedPath; } return Task.FromResult(0); });
      Input(page,"configDir","Obsidian 配置目录（通常保持默认）",".obsidian");
      Action(page,"检查知识库与插件",async () => { var result = await Run("vault.inspect",Args("path",text["vault"].Text,"configDir",text["configDir"].Text)); vaultResult.Text=Value(result,"name")+" · AI Bridge "+Value(result,"version")+"\n"+(Bool(result,"enabled") ? "已安装并启用，可以继续。" : "已安装但未启用。请在这个知识库启用插件后重新检查。"); }); Result(page,vaultResult);

      page = Page("连接你的 Cloudflare。", "浏览器里登录并授权。安装器只在选中的账号里创建一套全新的 Worker、R2 和 KV。");
      Action(page,"浏览器登录 Cloudflare",async () => { await Run("cloudflare.login",null); status.Text="已打开浏览器。授权完成后点击下方检查连接。"; });
      Hint(page,"通过 Cloudflare Wrangler 的公开 OAuth 客户端授权。部署凭证仅保存在本次会话，不会改写你现有的 Wrangler 登录。");
      Action(page,"我已授权，检查连接",async () => { await Run("state",null); if (!Bool(state,"authenticated")) throw new Exception(Value(state,"loginError","Cloudflare 尚未完成授权，请先在浏览器里登录并授权。")); status.Text="Cloudflare 已连接。"; });
      page.Controls.Add(new Label { Text="部署到哪个账号",AutoSize=true,Margin=new Padding(0,15,0,7) }); accounts.Width=650; accounts.DropDownStyle=ComboBoxStyle.DropDownList; fields.Add(accounts); page.Controls.Add(accounts);
      Heading(page,"已有 API Token / 浏览器授权不可用");
      Hint(page,"需账号读取、Workers Scripts 编辑、Workers KV 编辑、Workers R2 Storage 编辑权限。限定到本次部署账号。");
      Input(page,"cfToken","Cloudflare API Token","",true);
      Action(page,"使用 Token 连接",async () => { var token=text["cfToken"].Text; text["cfToken"].Clear(); await Run("cloudflare.token",Args("token",token)); status.Text="Cloudflare 已连接。"; });

      page = Page("决定 AI 能读到什么。", "选中的内容进入你自己的独立镜像桶。AI 只读；附件按笔记引用筛选。");
      Input(page,"label","部署名称（3–32 位小写字母、数字、连字符）","context-anywhere");
      Hint(page,"名称自动追加随机后缀。不会复用或覆盖现有 Worker、R2、KV。");
      Input(page,"workersSubdomain","首次开通 Workers 时的 workers.dev 子域名（可留空）");
      Hint(page,"已有子域名会保持原样。尚未开通时，留空将自动生成一个子域名；名称占用时可在这里更换。");
      Input(page,"deviceName","设备名称","Windows");
      Input(page,"includePrefixes","允许镜像的目录或笔记（相对于知识库，每行一个）","",false,90);
      Check(page,"mirrorAll","允许所有符合条件的 Markdown 笔记");
      Hint(page,".obsidian、冲突副本以及没有被允许笔记引用的附件始终排除。");
      Action(page,"预览选中范围",async () => { var result=await Run("preview",Options()); previewResult.Text="此范围包含 "+Value(result,"notes")+" 篇 Markdown。预览仅枚举文件名，不上传内容。"; }); Result(page,previewResult);
      Check(page,"syncOnChange","修改笔记后自动上传",true); Check(page,"syncAttachments","同步笔记引用的图片和已明确允许的 PDF");
      Number(page,"maxAttachmentMiB","单个附件上限（MiB）",8,1,8,1); Check(page,"autoSyncEnabled","定时补齐同步");
      Number(page,"autoSyncIntervalMinutes","定时同步间隔（分钟）",15,1,1440); Check(page,"bidirectionalEnabled","开启双向同步");
      Hint(page,"默认单向镜像。双向同步按修改时间决定版本，较旧的冲突副本保存在本机 AI Bridge Conflicts。");
      Number(page,"debounceMs","修改后等待时间（毫秒）",1200,250,10000);

      page = Page("把镜像部署起来。", "创建独立资源，生成两把不同密钥，再验证线上连接。首次导入需要在 Obsidian 输入一次临时密码。");
      Result(page,deployResult);
      Action(page,"创建资源并部署 / 重试",async () => { var input=Options(); input["label"]=text["label"].Text; input["workersSubdomain"]=text["workersSubdomain"].Text; input["accountId"]=SelectedAccount(); await Run("deploy",input); deployResult.Text="线上连接和 OAuth 入口已通过检查。\n"+Value(state,"workerUrl"); });
      Heading(page,"把设置交给 Obsidian");
      Input(page,"passphrase","临时导入密码（至少 8 个字符）","",true);
      Action(page,"显示 / 隐藏临时密码",() => { text["passphrase"].UseSystemPasswordChar=!text["passphrase"].UseSystemPasswordChar; return Task.FromResult(0); });
      Action(page,"打开 Obsidian 导入",async () => { await Run("obsidian.import",Args("passphrase",text["passphrase"].Text)); status.Text="请在选中的知识库输入临时密码完成导入，然后回来检查。"; });
      Hint(page,"AI Bridge 0.4.1 起，导入后自动测试连接并首次同步。0.4.0 会保留原设备名；请在 Obsidian 点击云上传图标完成首次同步。");
      Action(page,"我已导入，检查结果",async () => { var result=await Run("obsidian.verify",null); importResult.Text=Bool(result,"imported") ? "已确认插件保存了本次镜像设置。\n"+(Value(result,"lastSyncAt","0")!="0" ? "插件已记录同步时间。" : "尚无首次同步记录，请点击 Obsidian 的云上传图标。") : "尚未匹配导入设置，请在选中的知识库完成导入。"; if (Value(result,"syncError")!="") importResult.Text+="\n同步错误："+Value(result,"syncError"); }); Result(page,importResult);

      page = Page("把知识库接到你的 AI。", "ChatGPT 可通过 Chrome DevTools 自动配置。其他 AI 复制下方的连接信息即可，读取密码和上传密钥分开。");
      Input(page,"appName","ChatGPT 中显示的名称","Context Anywhere");
      Action(page,"打开专用 Chrome 并登录 ChatGPT",async () => { var result=await Run("chrome.open",null); numbers["port"].Value=Convert.ToDecimal(result["port"]); status.Text="在专用 Chrome 登录后，点击继续自动接入。"; });
      Hint(page,"日常 Chrome 的默认 profile 无法直接开放 DevTools。专用会话在本机保留登录，下次可继续使用。也可填写已经开放的本机调试端口。");
      Number(page,"port","Chrome DevTools 端口",9222,1024,65535);
      Action(page,"继续自动接入 ChatGPT",async () => { var result=await Run("chatgpt.connect",Args("port",(int)numbers["port"].Value,"appName",text["appName"].Text)); gptResult.Text=Bool(result,"connected") ? Value(result,"appName")+" 已连接。在 ChatGPT 输入 @ 选择该插件即可读取镜像。" : Value(result,"message"); }); Result(page,gptResult);
      Heading(page,"其他 AI / 手动接入");
      var endpoint=Input(page,"mcpUrl","MCP 地址"); endpoint.ReadOnly=true;
      Action(page,"复制 MCP 地址",() => { Clipboard.SetText(text["mcpUrl"].Text); status.Text="地址已复制。"; return Task.FromResult(0); });
      var password=Input(page,"readPassword","镜像读取密码（只在授权页面输入）","",true); password.ReadOnly=true;
      Action(page,"复制镜像读取密码",() => { Clipboard.SetText(text["readPassword"].Text); status.Text="读取密码已复制。"; return Task.FromResult(0); });
      var manual=Input(page,"manual","连接说明","",false,85); manual.ReadOnly=true;
      Action(page,"复制连接说明",() => { Clipboard.SetText(text["manual"].Text); return Task.FromResult(0); });
      var json=Input(page,"json","JSON（客户端字段需自行核对）","",false,105); json.ReadOnly=true;
      Action(page,"复制 JSON",() => { Clipboard.SetText(text["json"].Text); return Task.FromResult(0); });
      var toml=Input(page,"toml","Codex 配置（粘贴后还需 MCP OAuth 登录）","",false,60); toml.ReadOnly=true;
      Action(page,"复制 Codex 配置",() => { Clipboard.SetText(text["toml"].Text); return Task.FromResult(0); });
      Action(page,"导出无密钥的连接说明",async () => { using (var dialog=new SaveFileDialog { Filter="文本文件|*.txt",FileName="Context-Anywhere-connection.txt" }) { if(dialog.ShowDialog(this)==DialogResult.OK) await Run("export",Args("path",dialog.FileName)); } });
      foreach(var panel in pages) panel.Resize += (s,e) => { var p=(FlowLayoutPanel)s; foreach(Control control in p.Controls) { if(control is TextBox || control is ComboBox) control.Width=Math.Max(300,p.ClientSize.Width-25); if(control is Label || control is CheckBox) control.MaximumSize=new Size(Math.Max(300,p.ClientSize.Width-25),0); } };
    }
    Dictionary<string,object> Options() {
      var input=Args("deviceName",text["deviceName"].Text,"includePrefixes",text["includePrefixes"].Text);
      foreach(var pair in checks) input[pair.Key]=pair.Value.Checked;
      foreach(var pair in numbers) if(pair.Key!="port") input[pair.Key]=(double)pair.Value.Value;
      return input;
    }
    string SelectedAccount() { return accounts.SelectedIndex>=0 && accounts.SelectedIndex<accountList.Count ? Value(accountList[accounts.SelectedIndex],"id") : ""; }
    void Update(Dictionary<string,object> latest) {
      state=latest; var selected=SelectedAccount(); if(selected=="") selected=Value(state,"accountId");
      accounts.Items.Clear(); accountList.Clear(); object raw;
      if(state.TryGetValue("accounts",out raw) && raw is IEnumerable) foreach(var item in (IEnumerable)raw) { var account=item as Dictionary<string,object>; if(account!=null) { accountList.Add(account); accounts.Items.Add(Value(account,"name")); } }
      for(int i=0;i<accountList.Count;i++) if(Value(accountList[i],"id")==selected) accounts.SelectedIndex=i;
      if(accounts.SelectedIndex<0 && accountList.Count==1) accounts.SelectedIndex=0;
    }
    void Restore() {
      text["label"].Text=Value(state,"label","context-anywhere");
      text["workersSubdomain"].Text=Value(state,"workersSubdomain");
      text["appName"].Text=Value(Object(state,"chatgpt")??new Dictionary<string,object>(),"appName","Context Anywhere "+Value(state,"id"));
      var vault=Object(state,"vault"); if(vault!=null) { text["vault"].Text=Value(vault,"path"); text["configDir"].Text=Value(vault,"configDir",".obsidian"); }
      var settings=Object(state,"settings");
      if(settings!=null) {
        text["deviceName"].Text=Value(settings,"deviceName","Windows"); object prefixes;
        if(settings.TryGetValue("includePrefixes",out prefixes) && prefixes is IEnumerable && !(prefixes is string)) { var strings=new List<string>(); foreach(var item in (IEnumerable)prefixes) strings.Add(Convert.ToString(item)); text["includePrefixes"].Lines=strings.ToArray(); checks["mirrorAll"].Checked=strings.Count==0; }
        foreach(var pair in checks) if(settings.ContainsKey(pair.Key)) pair.Value.Checked=Bool(settings,pair.Key);
        foreach(var pair in numbers) if(settings.ContainsKey(pair.Key)) pair.Value.Value=Math.Min(pair.Value.Maximum,Math.Max(pair.Value.Minimum,Convert.ToDecimal(settings[pair.Key])));
      }
      if(Value(state,"chromePort")!="") numbers["port"].Value=Convert.ToDecimal(state["chromePort"]);
      if(Bool(state,"deployed")) { checks["cfAccountConfirmed"].Checked=true; checks["pluginConfirmed"].Checked=true; ShowStep(3); deployResult.Text="此安装已部署，可继续导入或接入 AI。\n"+Value(state,"workerUrl"); }
    }
    void ShowStep(int value) {
      if(value<0 || value>=pages.Count || busy) return; step=value;
      for(int i=0;i<pages.Count;i++) { pages[i].Visible=i==step; steps[i].ForeColor=i==step ? blue : Color.SlateGray; steps[i].Font=new Font(Font,i==step ? FontStyle.Bold : FontStyle.Regular); }
      pages[step].BringToFront(); pages[step].AutoScrollPosition=Point.Empty; stepLabel.Text="步骤 "+(step+1)+" / 5"; back.Enabled=step>0; next.Text=step==4 ? "完成并关闭" : "下一步";
      if(step==3 && !Bool(state,"deployed")) deployResult.Text="知识库："+text["vault"].Text+"\nWorker："+text["label"].Text+"-"+Value(state,"id")+"\nR2 和 OAuth KV 使用同一随机后缀，完全独立。\n同步方式："+(checks["bidirectionalEnabled"].Checked ? "双向同步" : "单向镜像");
    }
    async Task Navigate() {
      try {
        if(step==0) { var vault=Object(state,"vault"); if(!checks["cfAccountConfirmed"].Checked || !checks["pluginConfirmed"].Checked || vault==null || !Bool(vault,"enabled") || Value(vault,"path")!=Path.GetFullPath(text["vault"].Text)) throw new Exception("请勾选前提，并检查选中知识库里的插件已启用。"); }
        if(step==1 && (!Bool(state,"authenticated") || SelectedAccount()=="")) throw new Exception("请连接 Cloudflare 并选择账号。");
        if(step==2) await Run("preview",Options());
        if(step==3 && !Bool(state,"deployed")) throw new Exception("请先完成部署。");
        if(step==4) { await Run("close",null); Close(); return; }
        ShowStep(step+1);
        if(step==4) {
          var manual=await Run("manual",null); text["mcpUrl"].Text=Value(manual,"url"); text["readPassword"].Text=Value(manual,"readPassword"); text["manual"].Text=NativeLines(Value(manual,"text")); text["json"].Text=NativeLines(Value(manual,"json")); text["toml"].Text=NativeLines(Value(manual,"toml"));
          // Re-enabling controls and filling multiline text can scroll a focused child into view.
          next.Focus(); pages[4].AutoScrollPosition=Point.Empty;
          BeginInvoke((Action)(() => { if(step==4) pages[4].AutoScrollPosition=Point.Empty; }));
        }
      } catch(Exception error) { Error(error.Message); }
    }
    void Error(string message) { status.ForeColor=Color.FromArgb(164,55,50); status.Text=message; MessageBox.Show(this,message,"Context Anywhere",MessageBoxButtons.OK,MessageBoxIcon.Information); }
    async Task<Dictionary<string,object>> Run(string action, Dictionary<string,object> input) {
      if(rpc==null) throw new Exception("安装器尚未初始化，请稍等。");
      if(busy) throw new Exception("另一项操作正在进行，请等待完成。");
      busy=true; progressBar.Visible=true; status.ForeColor=blue; status.Text="正在处理…"; next.Enabled=false; back.Enabled=false;
      foreach(var control in fields) control.Enabled=false;
      try {
        var message=await rpc.Call(action,input??new Dictionary<string,object>()); var latest=Object(message,"state"); if(latest!=null) Update(latest);
        if(message.ContainsKey("error")) throw new Exception(Value(message,"error"));
        status.Text="操作完成。"; return Object(message,"result")??new Dictionary<string,object>();
      } finally { busy=false; progressBar.Visible=false; foreach(var control in fields) control.Enabled=true; next.Enabled=true; back.Enabled=step>0; }
    }
  }
}
