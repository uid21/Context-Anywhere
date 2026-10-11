using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using Microsoft.Win32;
using System.Runtime.InteropServices;
[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8")]
namespace ContextAnywhereSetup {
  static class Program {
    [STAThread] static void Main() {
      bool first;
      using(var single=new Mutex(true,"Local\\ContextAnywhereSetup-"+Environment.UserName,out first)) {
        if(!first){MessageBox.Show("部署向导已经打开，请返回那个窗口继续。","Context Anywhere");return;}
        new Application().Run(new SetupWindow());
      }
    }
  }
  class WindowOwner : System.Windows.Forms.IWin32Window {
    public IntPtr Handle {get;private set;} public WindowOwner(Window window){Handle=new WindowInteropHelper(window).Handle;}
  }
  class SetupWindow : Window {
    readonly Grid root=new Grid(),shell=new Grid();
    readonly Border sidebar=new Border();
    readonly ScrollViewer scroll=new ScrollViewer();
    readonly TextBlock logo=new TextBlock(),stepLabel=new TextBlock(),status=new TextBlock();
    readonly Button back=new Button(),next=new Button();
    readonly ComboBox theme=new ComboBox(),accounts=new ComboBox(),aiClient=new ComboBox();
    readonly StackPanel[] pages=new StackPanel[5];
    readonly List<TextBlock> stepLabels=new List<TextBlock>();
    readonly List<Control> actions=new List<Control>();
    readonly Dictionary<string,TextBox> text=new Dictionary<string,TextBox>();
    readonly Dictionary<string,CheckBox> checks=new Dictionary<string,CheckBox>();
    readonly Dictionary<string,double[]> ranges=new Dictionary<string,double[]>();
    readonly PasswordBox cfToken=new PasswordBox(),readPassword=new PasswordBox();
    readonly TextBlock authResult=new TextBlock(),vaultResult=new TextBlock(),previewResult=new TextBlock(),deployResult=new TextBlock(),importResult=new TextBlock();
    readonly List<Dictionary<string,object>> accountList=new List<Dictionary<string,object>>();
    readonly TextBlock connectionTitle=new TextBlock(),connectionHint=new TextBlock();
    readonly Button connectionPrimary=new Button(),connectionBack=new Button();
    readonly WrapPanel connectionSteps=new WrapPanel();
    readonly StackPanel connectionFields=new StackPanel(),tokenArea=new StackPanel();
    Button tokenButton;Rpc rpc;Dictionary<string,object> state=new Dictionary<string,object>();
    int step,connectionStep;bool busy,ready,started,dark;string password="";
    readonly bool startBackend;
    public SetupWindow() : this(true) {}
    internal SetupWindow(bool startBackend) {
      this.startBackend=startBackend;
      Title="Context Anywhere · 部署向导";FontFamily=new FontFamily("Segoe UI");FontSize=14;UseLayoutRounding=true;SnapsToDevicePixels=true;
      WindowStartupLocation=WindowStartupLocation.CenterScreen;MinWidth=Math.Min(480,SystemParameters.WorkArea.Width-16);MinHeight=Math.Min(360,SystemParameters.WorkArea.Height-16);
      Width=Math.Min(1040,SystemParameters.WorkArea.Width-32);Height=Math.Min(800,SystemParameters.WorkArea.Height-32);
      using(var styles=Assembly.GetExecutingAssembly().GetManifestResourceStream("ContextAnywhere.Theme.xaml"))Resources.MergedDictionaries.Add((ResourceDictionary)XamlReader.Load(styles));
      ApplyTheme();SetResourceReference(BackgroundProperty,"Surface");SetResourceReference(ForegroundProperty,"Ink");
      root.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(220)});root.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});
      Content=root;root.SetResourceReference(Grid.BackgroundProperty,"Surface");sidebar.SetResourceReference(Border.BackgroundProperty,"Side");sidebar.Padding=new Thickness(24,28,20,24);root.Children.Add(sidebar);
      var rail=new Grid();rail.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});rail.RowDefinitions.Add(new RowDefinition{Height=new GridLength(1,GridUnitType.Star)});rail.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});sidebar.Child=rail;
      var brand=new StackPanel();rail.Children.Add(brand);logo.Text="C ↗ A";logo.FontFamily=new FontFamily("Bahnschrift");logo.FontSize=34;logo.FontWeight=FontWeights.Bold;logo.SetResourceReference(TextBlock.ForegroundProperty,"Logo");brand.Children.Add(logo);
      brand.Children.Add(Label("Context Anywhere",18,false));brand.Children.Add(Label("Windows 部署向导 0.2.3",12,true));
      var steps=new StackPanel{Margin=new Thickness(0,35,0,0)};Grid.SetRow(steps,1);rail.Children.Add(steps);
      var names=new[]{"准备好你的知识库","连接 Cloudflare","选择同步范围","部署与导入","接入你的 AI"};
      for(int i=0;i<names.Length;i++){var item=Label((i+1)+"   "+names[i],14,true);item.Margin=new Thickness(0,0,0,24);steps.Children.Add(item);stepLabels.Add(item);}
      var foot=Label("笔记留在自己的账号里。\nAI 随时可以换。",13,true);Grid.SetRow(foot,2);rail.Children.Add(foot);
      Grid.SetColumn(shell,1);shell.Margin=new Thickness(28,20,28,18);root.Children.Add(shell);
      shell.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});shell.RowDefinitions.Add(new RowDefinition{Height=new GridLength(1,GridUnitType.Star)});shell.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});
      var header=new Grid{Margin=new Thickness(0,0,0,16)};header.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});shell.Children.Add(header);
      stepLabel.VerticalAlignment=VerticalAlignment.Center;stepLabel.SetResourceReference(TextBlock.ForegroundProperty,"Muted");header.Children.Add(stepLabel);
      theme.Items.Add("跟随系统");theme.Items.Add("浅色");theme.Items.Add("深色");theme.SelectedIndex=0;theme.Width=132;AutomationProperties.SetName(theme,"外观");Grid.SetColumn(theme,1);header.Children.Add(theme);theme.SelectionChanged+=(s,e)=>ApplyTheme();
      scroll.VerticalScrollBarVisibility=ScrollBarVisibility.Auto;scroll.HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled;scroll.HorizontalContentAlignment=HorizontalAlignment.Stretch;scroll.Padding=new Thickness(0,0,12,0);Grid.SetRow(scroll,1);shell.Children.Add(scroll);
      var footer=new Grid{Margin=new Thickness(0,12,0,0)};footer.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});footer.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});Grid.SetRow(footer,2);shell.Children.Add(footer);
      status.TextWrapping=TextWrapping.Wrap;status.MinHeight=34;status.MaxHeight=60;status.TextTrimming=TextTrimming.CharacterEllipsis;status.Margin=new Thickness(0,0,0,10);status.SetResourceReference(TextBlock.ForegroundProperty,"Accent");footer.Children.Add(status);
      var nav=new Grid();nav.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});nav.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});Grid.SetRow(nav,1);footer.Children.Add(nav);
      back.Content="上一步";back.HorizontalAlignment=HorizontalAlignment.Left;back.Click+=(s,e)=>ShowStep(step-1);nav.Children.Add(back);
      next.Content="下一步";next.MinWidth=132;next.SetResourceReference(Control.BackgroundProperty,"Primary");next.Foreground=Brushes.White;Grid.SetColumn(next,1);next.Click+=async(s,e)=>await Navigate();nav.Children.Add(next);
      BuildPages();ShowStep(0);UpdateResponsiveLayout();SizeChanged+=(s,e)=>UpdateResponsiveLayout();
      SourceInitialized+=(s,e)=>UpdateTitleBar();SystemEvents.UserPreferenceChanged+=SystemThemeChanged;
      ContentRendered+=async(s,e)=>{if(started)return;started=true;if(this.startBackend)await StartBackend();else{ready=true;RefreshEnabled();}};
      Closing+=(s,e)=>{if(busy){e.Cancel=true;status.Text="当前操作尚未完成，请等结果后关闭。";}};
      Closed+=(s,e)=>{SystemEvents.UserPreferenceChanged-=SystemThemeChanged;if(rpc!=null)rpc.Dispose();};
    }
    [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
    void UpdateTitleBar(){var handle=new WindowInteropHelper(this).Handle;if(handle==IntPtr.Zero)return;try{int value=dark?1:0;DwmSetWindowAttribute(handle,20,ref value,4);int corners=2;DwmSetWindowAttribute(handle,33,ref corners,4);}catch{}}
    void ApplyTheme(){
      dark=theme.SelectedIndex==2;
      if(theme.SelectedIndex<=0)try{dark=Convert.ToInt32(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize","AppsUseLightTheme",1))==0;}catch{}
      var palette=dark?new[]{"#1A1D22","#1F2831","#262B32","#E8EDF2","#A4B0BC","#64C2E7","#4D5965","#1D7299","#E8EDF2"}:new[]{"#F7F9FA","#E7F1F6","#FFFFFF","#223139","#586C7A","#176B91","#B9C7D0","#176B91","#176B91"};
      var keys=new[]{"Surface","Side","Field","Ink","Muted","Accent","Edge","Primary","Logo"};
      for(int i=0;i<keys.Length;i++){var brush=new SolidColorBrush((Color)ColorConverter.ConvertFromString(palette[i]));brush.Freeze();Resources[keys[i]]=brush;}UpdateTitleBar();
    }
    void SystemThemeChanged(object sender,UserPreferenceChangedEventArgs e){Dispatcher.BeginInvoke(new Action(()=>{if(theme.SelectedIndex==0)ApplyTheme();}));}
    void UpdateResponsiveLayout(){bool compact=ActualWidth>0&&(ActualWidth<900||ActualHeight<620);sidebar.Visibility=compact?Visibility.Collapsed:Visibility.Visible;root.ColumnDefinitions[0].Width=new GridLength(compact?0:220);var inset=compact?18:28;if(shell.Margin.Left!=inset)shell.Margin=new Thickness(inset,16,inset,16);}
    async Task StartBackend(){status.Text="正在读取部署记录…";RefreshEnabled();try{
      rpc=await Task.Run(()=>new Rpc());rpc.Progress+=message=>Dispatcher.BeginInvoke(new Action(()=>status.Text=message));rpc.StateChanged+=latest=>Dispatcher.BeginInvoke(new Action(()=>{Update(latest);if(step==1)status.Text=authResult.Text;}));
      var response=await rpc.Call("state",Args());if(response.ContainsKey("error"))throw new Exception(Value(response,"error"));Update(Object(response,"state"));Restore();ready=true;status.Text=Bool(state,"deployed")?"已找到部署记录，可以继续部署或连接 Obsidian、AI。":"请选择要接入的知识库。";
    }catch(Exception error){Error(error.Message);}finally{RefreshEnabled();}}
    TextBlock Label(string value,double size=14,bool muted=false){var label=new TextBlock{Text=value,FontSize=size,TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,4,0,8)};label.SetResourceReference(TextBlock.ForegroundProperty,muted?"Muted":"Ink");return label;}
    StackPanel Page(int index,string title,string intro){var page=new StackPanel();pages[index]=page;var heading=Label(title,28);heading.FontWeight=FontWeights.SemiBold;heading.Margin=new Thickness(0,0,0,12);page.Children.Add(heading);Hint(page,intro);return page;}
    void Hint(StackPanel page,string value){var label=Label(value,14,true);label.Margin=new Thickness(0,0,0,16);page.Children.Add(label);}
    void Heading(StackPanel page,string value){var label=Label(value,18);label.FontWeight=FontWeights.SemiBold;label.Margin=new Thickness(0,20,0,10);page.Children.Add(label);}
    TextBox Input(StackPanel page,string key,string label,string value="",int height=0){page.Children.Add(Label(label));var box=new TextBox{Text=value,Margin=new Thickness(0,0,0,12)};if(height>0){box.Height=height;box.AcceptsReturn=true;box.TextWrapping=TextWrapping.Wrap;box.VerticalScrollBarVisibility=ScrollBarVisibility.Auto;}AutomationProperties.SetName(box,label);text.Add(key,box);page.Children.Add(box);return box;}
    void Check(StackPanel page,string key,string label,bool value=false){var box=new CheckBox{Content=Label(label),IsChecked=value,Margin=new Thickness(0,10,0,6)};checks.Add(key,box);page.Children.Add(box);}
    void Number(StackPanel page,string key,string label,double value,double min,double max){Input(page,key,label,value.ToString(CultureInfo.InvariantCulture));ranges.Add(key,new[]{min,max});}
    Button Action(StackPanel page,string label,Func<Task> work){var button=new Button{Content=new TextBlock{Text=label,TextWrapping=TextWrapping.Wrap,TextAlignment=TextAlignment.Center},HorizontalAlignment=HorizontalAlignment.Left,Margin=new Thickness(0,4,0,14)};AutomationProperties.SetName(button,label);button.Click+=async(s,e)=>{try{await work();}catch(Exception error){Error(error.Message);}};actions.Add(button);page.Children.Add(button);return button;}
    void Result(StackPanel page,TextBlock result){result.TextWrapping=TextWrapping.Wrap;result.SetResourceReference(TextBlock.ForegroundProperty,"Accent");result.Margin=new Thickness(0,4,0,16);page.Children.Add(result);}
    void Guide(StackPanel page,string name,string url){var link=Action(page,name,()=>{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});return Task.FromResult(0);});link.BorderThickness=new Thickness(0);link.Background=Brushes.Transparent;link.SetResourceReference(Control.ForegroundProperty,"Accent");link.Padding=new Thickness(0,2,0,2);link.MinHeight=26;link.Margin=new Thickness(0,0,0,6);}
    Dictionary<string,object> Args(params object[] items){var result=new Dictionary<string,object>();for(int i=0;i<items.Length;i+=2)result.Add((string)items[i],items[i+1]);return result;}
    string Value(Dictionary<string,object> data,string key,string fallback=""){object value;return data!=null&&data.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):fallback;}
    bool Bool(Dictionary<string,object> data,string key){object value;return data!=null&&data.TryGetValue(key,out value)&&value is bool&&(bool)value;}
    Dictionary<string,object> Object(Dictionary<string,object> data,string key){object value;return data!=null&&data.TryGetValue(key,out value)?value as Dictionary<string,object>:null;}
    void BuildPages(){
      var p=Page(0,"准备账号和知识库","确认下面两项已准备好，再选择你的 Obsidian 知识库。");
      Check(p,"cfAccountConfirmed","我已有 Cloudflare 账号，并已启用 R2");Guide(p,"注册 Cloudflare 账号 ↗","https://dash.cloudflare.com/sign-up");Guide(p,"查看 R2 启用指引 ↗","https://developers.cloudflare.com/r2/get-started/");Hint(p,"R2 标准存储每月免费额度：10 GB·月存储、100 万次 A 类操作（如写入、列举）、1000 万次 B 类操作（如读取）。出站流量免费。超出额度的费用以 Cloudflare 官方价格为准。");
      Check(p,"pluginConfirmed","我已在 Obsidian 安装并启用 AI Bridge");Guide(p,"安装 AI Bridge 插件 ↗","https://community.obsidian.md/plugins/ai-bridge");Hint(p,"在要接入的知识库中安装并启用 AI Bridge，然后选择这个知识库的文件夹。");
      Input(p,"vault","要接入的 Obsidian 知识库");Action(p,"选择知识库文件夹",()=>{using(var picker=new System.Windows.Forms.FolderBrowserDialog{Description="选择已安装 AI Bridge 的知识库",ShowNewFolderButton=false}){if(picker.ShowDialog(new WindowOwner(this))==System.Windows.Forms.DialogResult.OK)text["vault"].Text=picker.SelectedPath;}return Task.FromResult(0);});Input(p,"configDir","Obsidian 配置目录（通常保持默认）",".obsidian");
      Action(p,"检查知识库与插件",async()=>{var result=await Run("vault.inspect",Args("path",text["vault"].Text,"configDir",text["configDir"].Text));vaultResult.Text=Value(result,"name")+" · AI Bridge "+Value(result,"version")+"\n"+(!Bool(result,"localImportSupported")?"请更新 AI Bridge，重新打开 Obsidian 后再检查。":Bool(result,"enabled")?"插件已就绪，可以继续。":"请在这个知识库中启用 AI Bridge，然后重新检查。");});Result(p,vaultResult);
      p=Page(1,"连接 Cloudflare","在浏览器中登录并授权，再回来选择用于存放笔记的 Cloudflare 账号。");Action(p,"登录 Cloudflare / 更换账号",async()=>{await Run("cloudflare.login",null);status.Text=Bool(state,"authenticated")?authResult.Text:"请在浏览器中完成授权。连接成功后，这里会自动提示。";});Hint(p,"授权页面中的 Wrangler 是 Cloudflare 官方工具。授权后，向导才能为你创建镜像。");Result(p,authResult);p.Children.Add(Label("部署到哪个账号"));accounts.Margin=new Thickness(0,0,0,16);AutomationProperties.SetName(accounts,"部署到哪个账号");p.Children.Add(accounts);
      p.Children.Add(tokenArea);Heading(tokenArea,"使用 API Token 连接（可选）");Hint(tokenArea,"如果已通过浏览器连接，直接点击下一步。\n使用 API Token 时，需要账号读取权限，以及 Workers Scripts、Workers KV、Workers R2 Storage 编辑权限。");tokenArea.Children.Add(Label("Cloudflare API Token"));cfToken.Margin=new Thickness(0,0,0,12);AutomationProperties.SetName(cfToken,"Cloudflare API Token");tokenArea.Children.Add(cfToken);tokenButton=Action(tokenArea,"使用 Token 连接",async()=>{var token=cfToken.Password;cfToken.Clear();await Run("cloudflare.token",Args("token",token));status.Text=authResult.Text;});
      p=Page(2,"选择要同步的内容","只有你选中的笔记会上传到镜像，供 AI 搜索和读取。");Input(p,"label","部署名称（小写字母、数字、连字符）","context-anywhere");Hint(p,"名称末尾会自动加上一段随机字符，用来区分不同镜像。");Input(p,"workersSubdomain","首次开通 Workers 时的子域名（可留空）");Input(p,"deviceName","设备名称","Windows");Input(p,"includePrefixes","要同步的文件夹或笔记（每行一个，填写库内路径）","",86);Check(p,"mirrorAll","同步知识库中的全部 Markdown 笔记");Hint(p,"插件设置和冲突副本不会上传。启用附件同步后，只上传所选笔记引用的附件。");Action(p,"预览选中范围",async()=>{var result=await Run("preview",Options());previewResult.Text="此范围包含 "+Value(result,"notes")+" 篇笔记。这里只做预览，还没有上传。";});Result(p,previewResult);Check(p,"syncOnChange","修改笔记后自动上传",true);Check(p,"syncAttachments","同步笔记引用的图片和已允许的 PDF");Number(p,"maxAttachmentMiB","单个附件上限（MiB）",8,1,8);Check(p,"autoSyncEnabled","定时同步");Number(p,"autoSyncIntervalMinutes","同步间隔（分钟）",15,1,1440);Check(p,"bidirectionalEnabled","开启双向同步");Hint(p,"默认只把本机内容上传到镜像。开启双向同步后，也会下载镜像中的更新；发生冲突时，较旧版本保存在 AI Bridge Conflicts 文件夹中。");Number(p,"debounceMs","修改后等待时间（毫秒）",1200,250,10000);
      p=Page(3,"部署镜像","先创建镜像，再将连接设置导入 Obsidian。导入后会自动检查连接并开始同步。");Result(p,deployResult);Action(p,"部署镜像",async()=>{var input=Options();input["label"]=text["label"].Text;input["workersSubdomain"]=text["workersSubdomain"].Text;input["accountId"]=SelectedAccount();await Run("deploy",input);deployResult.Text="镜像已就绪。\n"+Value(state,"workerUrl");});Heading(p,"连接 Obsidian");Action(p,"导入 Obsidian",async()=>{await Run("obsidian.import",null);status.Text="已打开所选知识库，正在导入连接设置。";});Hint(p,"请保持 Obsidian 打开，稍后点击“检查导入结果”。");Action(p,"检查导入结果",async()=>{var result=await Run("obsidian.verify",null);importResult.Text=Bool(result,"imported")?"连接设置已导入。\n"+(Value(result,"lastSyncAt","0")!="0"?"插件已有同步记录。":"请在 Obsidian 点击云上传图标完成首次同步。"):"尚未检测到这次导入。请确认所选知识库已打开、AI Bridge 已启用，再点击“导入 Obsidian”。";if(Value(result,"syncError")!="")importResult.Text+="\n同步错误："+Value(result,"syncError");});Result(p,importResult);
      p=Page(4,"连接你的 AI","按下面的步骤添加连接。登录和授权在你常用的浏览器中完成。");p.Children.Add(Label("选择要接入的 AI"));aiClient.Items.Add("ChatGPT");aiClient.Items.Add("其他 AI");aiClient.SelectedIndex=0;aiClient.Margin=new Thickness(0,0,0,20);AutomationProperties.SetName(aiClient,"选择要接入的 AI");p.Children.Add(aiClient);
      connectionSteps.Margin=new Thickness(0,0,0,16);p.Children.Add(connectionSteps);
      connectionTitle.FontSize=20;connectionTitle.FontWeight=FontWeights.SemiBold;connectionTitle.TextWrapping=TextWrapping.Wrap;connectionTitle.Margin=new Thickness(0,0,0,10);p.Children.Add(connectionTitle);connectionHint.TextWrapping=TextWrapping.Wrap;connectionHint.SetResourceReference(TextBlock.ForegroundProperty,"Muted");connectionHint.Margin=new Thickness(0,0,0,16);p.Children.Add(connectionHint);p.Children.Add(connectionFields);
      text.Add("mcpUrl",new TextBox{IsReadOnly=true,Margin=new Thickness(0,0,0,16)});text.Add("appName",new TextBox{Text="Context Anywhere",Margin=new Thickness(0,0,0,16)});readPassword.IsEnabled=false;readPassword.Margin=new Thickness(0,0,0,16);
      connectionPrimary.HorizontalAlignment=HorizontalAlignment.Left;connectionPrimary.Margin=new Thickness(0,0,0,10);connectionPrimary.SetResourceReference(Control.BackgroundProperty,"Primary");connectionPrimary.Foreground=Brushes.White;connectionPrimary.Click+=async(s,e)=>{try{await AdvanceConnection();}catch(Exception error){Error(error.Message);}};actions.Add(connectionPrimary);p.Children.Add(connectionPrimary);
      connectionBack.Content="返回上一项";connectionBack.HorizontalAlignment=HorizontalAlignment.Left;connectionBack.Click+=(s,e)=>{if(connectionStep>0)connectionStep--;RenderConnection();};p.Children.Add(connectionBack);aiClient.SelectionChanged+=(s,e)=>{connectionStep=0;RenderConnection();};
      var extra=new StackPanel();Input(extra,"manual","连接说明","",90).IsReadOnly=true;Action(extra,"复制连接说明",()=>Copy(text["manual"].Text,"连接说明已复制。"));Input(extra,"json","JSON 配置","",110).IsReadOnly=true;Action(extra,"复制 JSON",()=>Copy(text["json"].Text,"JSON 已复制。"));Input(extra,"toml","Codex 配置","",75).IsReadOnly=true;Action(extra,"复制 Codex 配置",()=>Copy(text["toml"].Text,"Codex 配置已复制。"));Action(extra,"保存连接说明（不含密码）",async()=>{var dialog=new SaveFileDialog{Filter="文本文件|*.txt",FileName="Context-Anywhere-connection.txt"};if(dialog.ShowDialog(this)==true)await Run("export",Args("path",dialog.FileName));});p.Children.Add(new Expander{Header="更多客户端配置",Content=extra,Margin=new Thickness(0,24,0,8)});RenderConnection();
    }
    Task Copy(string value,string message){if(String.IsNullOrEmpty(value))throw new Exception("连接信息尚未准备好，请稍后再试。");Clipboard.SetText(value);status.Text=message;return Task.FromResult(0);}
    async Task AdvanceConnection(){
      if(connectionStep==0){
        await Copy(text["mcpUrl"].Text,"MCP 地址已复制。");
        bool openChatGPT=aiClient.SelectedIndex==0;
        connectionStep=1;RenderConnection();
        // Browser/online checks must not hide the remaining local connection fields.
        if(openChatGPT)try{await Run("chatgpt.open",null);}catch(Exception error){Error("地址已复制，后续信息仍可继续复制。"+error.Message);}
      }
      else if(connectionStep==1){if(aiClient.SelectedIndex==0){await Copy(text["appName"].Text,"名称已复制。");connectionStep=2;}else{await Copy(password,"读取密码已复制，请在镜像授权页粘贴。");connectionStep=3;}}
      else if(connectionStep==2){await Copy(password,"读取密码已复制，请在镜像授权页粘贴。");connectionStep=3;}
      else{connectionStep=0;}RenderConnection();
    }
    void RenderConnection(){
      bool gpt=aiClient.SelectedIndex==0;connectionFields.Children.Clear();connectionBack.Visibility=connectionStep==0?Visibility.Collapsed:Visibility.Visible;
      connectionSteps.Children.Clear();
      var labels=gpt?new[]{"1 · MCP 地址","2 · 名称","3 · 授权密码"}:new[]{"1 · MCP 地址","2 · 授权密码"};
      for(int i=0;i<labels.Length;i++){
        int selectedStep=i;
        var button=new Button{Content=labels[i],Padding=new Thickness(10,7,10,7),Margin=new Thickness(0,0,8,8)};
        AutomationProperties.SetName(button,labels[i]);
        if(connectionStep==i){button.SetResourceReference(Control.BackgroundProperty,"Primary");button.Foreground=Brushes.White;}
        button.Click+=(s,e)=>{connectionStep=selectedStep;RenderConnection();};connectionSteps.Children.Add(button);
      }
      if(connectionStep==0){connectionTitle.Text="1 · 复制 MCP 地址";connectionHint.Text=gpt?"打开 ChatGPT 后，在插件页选择“添加”→“添加自定义 MCP 服务器”，把地址粘贴到服务器 URL 栏。未登录时，先登录你的账号。":"在 AI 客户端添加远程 MCP，把下方地址粘贴到服务器 URL 栏。";connectionFields.Children.Add(text["mcpUrl"]);connectionPrimary.Content=gpt?"复制 MCP 地址并打开 ChatGPT":"复制 MCP 地址";}
      else if(connectionStep==1&&gpt){connectionTitle.Text="2 · 复制名称";connectionHint.Text="将名称粘贴到创建页面的名称栏。身份验证选择 OAuth，然后点击创建。";connectionFields.Children.Add(text["appName"]);connectionPrimary.Content="复制名称，下一项";}
      else if(connectionStep<3){connectionTitle.Text=(gpt?"3":"2")+" · 复制授权密码";connectionHint.Text="这是镜像读取密码。在 OAuth 授权页的密码框中粘贴，再点击授权。"+(gpt?"如果出现“继续连接”，先点它进入授权页。":"客户端的认证方式选择 OAuth。");readPassword.Password=password;connectionFields.Children.Add(readPassword);connectionPrimary.Content="复制授权密码";}
      else{connectionTitle.Text="回到 AI 完成连接";connectionHint.Text=gpt?"在浏览器完成授权和插件安装，然后在聊天中输入 @ 选择插件，试着读取一篇笔记。":"在客户端完成 OAuth 授权，再尝试读取一篇笔记。";connectionPrimary.Content="重新复制连接信息";}
      scroll.ScrollToTop();
    }
    Dictionary<string,object> Options(){var input=Args("deviceName",text["deviceName"].Text,"includePrefixes",text["includePrefixes"].Text);foreach(var pair in checks)input[pair.Key]=pair.Value.IsChecked==true;foreach(var pair in ranges){double value;if(!Double.TryParse(text[pair.Key].Text,NumberStyles.Float,CultureInfo.InvariantCulture,out value)||Double.IsNaN(value)||Double.IsInfinity(value)||value<pair.Value[0]||value>pair.Value[1])throw new Exception("请填写有效的数值："+AutomationProperties.GetName(text[pair.Key]));input[pair.Key]=value;}return input;}
    string SelectedAccount(){return accounts.SelectedIndex>=0&&accounts.SelectedIndex<accountList.Count?Value(accountList[accounts.SelectedIndex],"id"):"";}
    void Update(Dictionary<string,object> latest){if(latest==null)return;state=latest;var selected=SelectedAccount();if(selected=="")selected=Value(state,"accountId");accounts.Items.Clear();accountList.Clear();object raw;if(state.TryGetValue("accounts",out raw)&&raw is IEnumerable)foreach(var item in (IEnumerable)raw){var account=item as Dictionary<string,object>;if(account!=null){accountList.Add(account);accounts.Items.Add(Value(account,"name"));}}for(int i=0;i<accountList.Count;i++)if(Value(accountList[i],"id")==selected)accounts.SelectedIndex=i;if(accounts.SelectedIndex<0&&accountList.Count==1)accounts.SelectedIndex=0;RefreshEnabled();}
    void RefreshEnabled(){scroll.IsEnabled=!busy;foreach(var control in actions)control.IsEnabled=ready&&!busy;back.IsEnabled=ready&&!busy&&step>0;next.IsEnabled=ready&&!busy;cfToken.IsEnabled=ready&&!busy&&!Bool(state,"authenticated");if(tokenButton!=null)tokenButton.IsEnabled=cfToken.IsEnabled;tokenArea.Opacity=Bool(state,"authenticated")?0.55:1;authResult.Text=Bool(state,"authenticated")?"Cloudflare 已连接。选好账号后点击下一步，下面的 API Token 不用填写。":Value(state,"loginError","完成浏览器授权后，这里会自动更新连接结果。");}
    void Restore(){text["label"].Text=Value(state,"label","context-anywhere");text["workersSubdomain"].Text=Value(state,"workersSubdomain");text["appName"].Text="Context Anywhere "+Value(state,"id");var vault=Object(state,"vault");if(vault!=null){text["vault"].Text=Value(vault,"path");text["configDir"].Text=Value(vault,"configDir",".obsidian");}var settings=Object(state,"settings");if(settings!=null){text["deviceName"].Text=Value(settings,"deviceName","Windows");object prefixes;if(settings.TryGetValue("includePrefixes",out prefixes)&&prefixes is IEnumerable&&!(prefixes is string)){var values=new List<string>();foreach(var item in (IEnumerable)prefixes)values.Add(Convert.ToString(item));text["includePrefixes"].Text=String.Join(Environment.NewLine,values);checks["mirrorAll"].IsChecked=values.Count==0;}foreach(var pair in checks)if(settings.ContainsKey(pair.Key))pair.Value.IsChecked=Bool(settings,pair.Key);foreach(var pair in ranges)if(settings.ContainsKey(pair.Key))text[pair.Key].Text=Convert.ToDouble(settings[pair.Key]).ToString(CultureInfo.InvariantCulture);}if(Bool(state,"deployed")){checks["cfAccountConfirmed"].IsChecked=true;checks["pluginConfirmed"].IsChecked=true;ShowStep(3);deployResult.Text="已找到部署记录，可以继续部署或连接 Obsidian、AI。\n"+Value(state,"workerUrl");}}
    void ShowStep(int value){if(value<0||value>=pages.Length||busy)return;step=value;scroll.Content=pages[step];scroll.ScrollToTop();stepLabel.Text="步骤 "+(step+1)+" / 5";for(int i=0;i<stepLabels.Count;i++){stepLabels[i].SetResourceReference(TextBlock.ForegroundProperty,i==step?"Accent":"Muted");stepLabels[i].FontWeight=i==step?FontWeights.SemiBold:FontWeights.Normal;}next.Content=step==4?"完成并关闭":"下一步";if(step==3&&!Bool(state,"deployed"))deployResult.Text="知识库："+text["vault"].Text+"\n部署名称："+text["label"].Text+"-"+Value(state,"id");RefreshEnabled();}
    async Task Navigate(){try{if(step==0){var vault=Object(state,"vault");if(checks["cfAccountConfirmed"].IsChecked!=true||checks["pluginConfirmed"].IsChecked!=true||!Bool(vault,"enabled")||!Bool(vault,"localImportSupported")||Value(vault,"path")!=Path.GetFullPath(text["vault"].Text))throw new Exception("请确认账号和插件已准备好，选择知识库后点击“检查知识库与插件”。");}if(step==1&&(!Bool(state,"authenticated")||SelectedAccount()==""))throw new Exception("请连接 Cloudflare 并选择账号。");if(step==2)await Run("preview",Options());if(step==3&&!Bool(state,"deployed"))throw new Exception("请先完成部署。");if(step==4){await Run("close",null);Close();return;}ShowStep(step+1);if(step==4){var manual=await Run("manual",null);text["mcpUrl"].Text=Value(manual,"url");password=Value(manual,"readPassword");foreach(var key in new[]{"manual","json","toml"})text[key].Text=Value(manual,key=="manual"?"text":key);connectionStep=0;RenderConnection();}}catch(Exception error){Error(error.Message);}}
    void Error(string message){status.Text=message;status.ToolTip=message;}
    async Task<Dictionary<string,object>> Run(string action,Dictionary<string,object> input){if(!ready||rpc==null)throw new Exception("向导正在准备，请稍后再试。");if(busy)throw new Exception("当前操作还在进行，请等待完成。");busy=true;RefreshEnabled();status.Text="正在处理…";try{var message=await rpc.Call(action,input??Args());Update(Object(message,"state"));if(message.ContainsKey("error"))throw new Exception(Value(message,"error"));status.Text="操作完成。";return Object(message,"result")??Args();}finally{busy=false;RefreshEnabled();}}
  }
}
