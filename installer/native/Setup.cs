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
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Input;
using System.Windows.Data;
using Microsoft.Win32;
using System.Runtime.InteropServices;
[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8")]
[assembly: AssemblyTitle("Context Anywhere")]
[assembly: AssemblyProduct("Context Anywhere Windows Setup")]
[assembly: AssemblyVersion("1.1.1.0")]
[assembly: AssemblyFileVersion("1.1.1.0")]
[assembly: AssemblyInformationalVersion("1.1.1")]
namespace ContextAnywhereSetup {
  static class Program {
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int processId);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window,int command);
    [STAThread] static void Main() {
      bool first;string name="Local\\ContextAnywhereSetup-"+Environment.UserName;
      using(var activate=new EventWaitHandle(false,EventResetMode.AutoReset,name+"-Activate"))
      using(var single=new Mutex(true,name,out first)) {
        if(!first){
          using(var current=Process.GetCurrentProcess())foreach(var other in Process.GetProcessesByName(current.ProcessName))using(other){
            try{
              if(other.Id==current.Id||other.SessionId!=current.SessionId||other.MainModule.FileVersionInfo.ProductName!="Context Anywhere Windows Setup")continue;
              AllowSetForegroundWindow(other.Id);var handle=other.MainWindowHandle;
              if(handle!=IntPtr.Zero){if(IsIconic(handle))ShowWindowAsync(handle,9);SetForegroundWindow(handle);}break;
            }catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){}
          }
          activate.Set();return;
        }
        var app=new Application();var window=new SetupWindow();
        var listener=ThreadPool.RegisterWaitForSingleObject(activate,(s,t)=>window.Dispatcher.BeginInvoke(new Action(()=>{
          if(window.WindowState==WindowState.Minimized)SystemCommands.RestoreWindow(window);window.Activate();
        })),null,Timeout.Infinite,false);
        try{app.Run(window);}finally{listener.Unregister(null);}
      }
    }
  }
  class SetupWindow : Window {
    readonly Grid root=new Grid(),shell=new Grid();
    readonly Border sidebar=new Border();
    readonly Border activityTrack=new Border(),activityFill=new Border();
    readonly ScaleTransform activityScale=new ScaleTransform(0,1);
    bool activityRunning;
    readonly ScrollViewer scroll=new SmoothScrollViewer();
    readonly TextBlock logo=new TextBlock(),stepLabel=new TextBlock(),status=new TextBlock();
    readonly Button back=new Button(),next=new Button();
    readonly Button retryBackend=new Button();
    readonly ComboBox theme=new ComboBox(),language=new ComboBox(),accounts=new ComboBox(),aiClient=new ComboBox(),deployments=new ComboBox();
    readonly List<Action> localizations=new List<Action>();
    bool localizing;
    readonly StackPanel[] pages=new StackPanel[5];
    readonly List<TextBlock> stepLabels=new List<TextBlock>();
    readonly List<Button> stepButtons=new List<Button>();
    readonly List<Border> stepBadges=new List<Border>();
    readonly Dictionary<string,StackPanel> fieldGroups=new Dictionary<string,StackPanel>();
    readonly Dictionary<string,double> scrollOffsets=new Dictionary<string,double>();
    readonly RadioButton scopeCustom=new RadioButton(),scopeAll=new RadioButton();
    readonly StackPanel scopePaths=new StackPanel();
    readonly TextBlock scopeHint=new TextBlock();
    bool updatingScope;
    readonly Expander tokenSection=new Expander(),credentialSection=new Expander();
    readonly ComboBox managedReadKey=new ComboBox(),connectionReadKey=new ComboBox();
    readonly List<Dictionary<string,object>> readKeys=new List<Dictionary<string,object>>();
    readonly Dictionary<int,string> connectionKeyChoices=new Dictionary<int,string>();
    readonly StackPanel connectionKeyFields=new StackPanel(),selectedKeyActions=new StackPanel();
    readonly WrapPanel connectionKeyActions=new WrapPanel();
    readonly TextBlock keySyncStatus=new TextBlock(),connectionKeySyncStatus=new TextBlock();
    readonly Expander addKeySection=new Expander();
    readonly PasswordBox importedReadKey=new PasswordBox();
    TextBox newKeyName,managedKeyName;
    Button copyReadKey,addReadKey,rotateReadKey,renameReadKey,deleteReadKey,importReadKey,resumeReadKey,attachDeployment;
    bool renderingReadKeys,keyRefreshRequested,keyRefreshQueued,keyRefreshFailed;
    string managedKeySourceName="",managedKeyKind="";
    Button deployButton,importButton,verifyImportButton,scopeFolderButton,scopeNoteButton;
    readonly List<Control> actions=new List<Control>();
    readonly Dictionary<string,TextBox> text=new Dictionary<string,TextBox>();
    readonly Dictionary<string,CheckBox> checks=new Dictionary<string,CheckBox>();
    readonly Dictionary<string,double[]> ranges=new Dictionary<string,double[]>();
    readonly PasswordBox cfToken=new PasswordBox();
    readonly TextBlock authResult=new TextBlock(),vaultResult=new TextBlock(),previewResult=new TextBlock(),deployResult=new TextBlock(),importResult=new TextBlock();
    readonly List<Dictionary<string,object>> accountList=new List<Dictionary<string,object>>();
    readonly List<Dictionary<string,object>> recoveryList=new List<Dictionary<string,object>>();
    readonly StackPanel recoveryArea=new StackPanel(),deploymentFields=new StackPanel(),deploymentActions=new StackPanel(),credentialActions=new StackPanel();
    readonly Expander deploymentMaintenance=new Expander();
    Expander attachDeploymentSection;
    readonly TextBlock recoveryResult=new TextBlock();
    readonly PasswordBox attachWrite=new PasswordBox();
    TextBox attachWorker;
    Button selectLocalVault,cloudRecovery;
    bool recoveryFirst,closed,renderingRecoveries;
    Button restoreDeployment,newDeployment,backupDeployment,refreshRecovery,backupShortcut;
    bool updatingAccounts,discoveryQueued;
    string discoveryAttempt="",recoveryError="";
    bool Recovered {get{return Bool(state,"recovered");}}
    readonly TextBlock connectionTitle=new TextBlock(),connectionHint=new TextBlock();
    readonly Button connectionPrimary=new Button(),connectionBack=new Button();
    readonly WrapPanel connectionSteps=new WrapPanel();
    readonly StackPanel connectionFields=new StackPanel(),tokenArea=new StackPanel();
    Button tokenButton;Rpc rpc;Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>> send;Dictionary<string,object> state=new Dictionary<string,object>();
    int step,connectionStep;bool busy,ready,started,dark,initializing;
    readonly bool startBackend;
    readonly Action<string> writeClipboard;
    public SetupWindow() : this(true) {}
    internal SetupWindow(bool startBackend,Action<string> writeClipboard=null) {
      this.startBackend=startBackend;
      this.writeClipboard=writeClipboard??Clipboard.SetText;
      Title=L.T("Context Anywhere · 部署向导");SetTypography();FontSize=14;UseLayoutRounding=true;SnapsToDevicePixels=true;
      TextOptions.SetTextFormattingMode(this,TextFormattingMode.Display);TextOptions.SetTextRenderingMode(this,TextRenderingMode.ClearType);
      using(var icon=Assembly.GetExecutingAssembly().GetManifestResourceStream("ContextAnywhere.Icon.ico"))if(icon!=null){var frames=new IconBitmapDecoder(icon,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad).Frames;Icon=frames[frames.Count-1];}
      WindowStartupLocation=WindowStartupLocation.CenterScreen;MinWidth=Math.Min(480,SystemParameters.WorkArea.Width-16);MinHeight=Math.Min(360,SystemParameters.WorkArea.Height-16);
      Width=Math.Min(1040,SystemParameters.WorkArea.Width-32);Height=Math.Min(800,SystemParameters.WorkArea.Height-32);
      using(var styles=Assembly.GetExecutingAssembly().GetManifestResourceStream("ContextAnywhere.Theme.xaml"))Resources.MergedDictionaries.Add((ResourceDictionary)XamlReader.Load(styles));
      ApplyTheme();SetResourceReference(BackgroundProperty,"Surface");SetResourceReference(ForegroundProperty,"Ink");
      root.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(220)});root.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});
      Content=root;root.SetResourceReference(Grid.BackgroundProperty,"Surface");sidebar.SetResourceReference(Border.BackgroundProperty,"Side");sidebar.Padding=new Thickness(24,28,20,24);root.Children.Add(sidebar);
      var rail=new Grid();rail.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});rail.RowDefinitions.Add(new RowDefinition{Height=new GridLength(1,GridUnitType.Star)});rail.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});sidebar.Child=rail;
      var brand=new StackPanel();rail.Children.Add(brand);brand.Children.Add(new Image{Source=Icon,Width=48,Height=48,HorizontalAlignment=HorizontalAlignment.Left,Margin=new Thickness(0,0,0,14)});
      logo.Text="Context\nAnywhere";logo.FontFamily=new FontFamily("Segoe UI Variable Display, Segoe UI");logo.FontSize=23;logo.FontWeight=FontWeights.SemiBold;logo.LineHeight=29;logo.SetResourceReference(TextBlock.ForegroundProperty,"Ink");brand.Children.Add(logo);
      brand.Children.Add(Label("Windows 部署向导 1.1.1",12,true));
      var steps=new StackPanel{Margin=new Thickness(0,35,0,0)};Grid.SetRow(steps,1);rail.Children.Add(steps);
      var names=new[]{"准备好你的知识库","连接 Cloudflare","选择同步范围","部署与导入","接入你的 AI"};
      for(int i=0;i<names.Length;i++){
        int index=i;var row=new Grid();row.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(32)});row.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});
        var number=new TextBlock{Text=(i+1).ToString(),FontSize=12,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
        var badge=new Border{Child=number,Width=24,Height=24,CornerRadius=new CornerRadius(12),HorizontalAlignment=HorizontalAlignment.Left};row.Children.Add(badge);stepBadges.Add(badge);
        var item=Label("",13,true);Localize(()=>item.Text=L.T(Recovered&&index==3?"恢复与导入":names[index]));item.Margin=new Thickness(0);item.VerticalAlignment=VerticalAlignment.Center;Grid.SetColumn(item,1);row.Children.Add(item);stepLabels.Add(item);
        var button=new Button{Content=row,Style=(Style)Resources["StepButton"],HorizontalContentAlignment=HorizontalAlignment.Stretch,Padding=new Thickness(8,10,8,10),Margin=new Thickness(-8,0,-8,8),BorderThickness=new Thickness(0),MinHeight=44};button.SetResourceReference(Control.BackgroundProperty,"Side");button.Click+=(s,e)=>{if(index<step)ShowStep(index);};steps.Children.Add(button);stepButtons.Add(button);
      }
      var foot=Label("笔记留在自己的账号里。\nAI 随时可以换。",13,true);Grid.SetRow(foot,2);rail.Children.Add(foot);
      Grid.SetColumn(shell,1);shell.Margin=new Thickness(28,20,28,18);root.Children.Add(shell);
      shell.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});shell.RowDefinitions.Add(new RowDefinition{Height=new GridLength(1,GridUnitType.Star)});shell.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});
      var header=new Grid{Margin=new Thickness(0,0,0,16)};header.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});header.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});shell.Children.Add(header);
      stepLabel.VerticalAlignment=VerticalAlignment.Center;stepLabel.SetResourceReference(TextBlock.ForegroundProperty,"Muted");header.Children.Add(stepLabel);
      theme.Items.Add(L.T("跟随系统"));theme.Items.Add(L.T("浅色"));theme.Items.Add(L.T("深色"));theme.SelectedIndex=0;theme.Width=132;AutomationProperties.SetName(theme,L.T("外观"));Grid.SetColumn(theme,1);header.Children.Add(theme);theme.SelectionChanged+=(s,e)=>ApplyTheme();
      language.Items.Add("简体中文");language.Items.Add("English");language.SelectedIndex=L.Language=="zh-CN"?0:1;language.Width=112;language.Margin=new Thickness(8,0,0,0);AutomationProperties.SetName(language,"Language / 语言");Grid.SetColumn(language,2);header.Children.Add(language);language.SelectionChanged+=async(s,e)=>{if(!localizing)await ChangeLanguage();};
      scroll.VerticalScrollBarVisibility=ScrollBarVisibility.Auto;scroll.HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled;scroll.HorizontalContentAlignment=HorizontalAlignment.Stretch;scroll.Padding=new Thickness(0,0,12,0);Grid.SetRow(scroll,1);shell.Children.Add(scroll);
      var footer=new Grid{Margin=new Thickness(0,12,0,0)};footer.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});footer.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});Grid.SetRow(footer,2);shell.Children.Add(footer);
      status.TextWrapping=TextWrapping.Wrap;status.FontSize=13;status.LineHeight=20;status.Margin=new Thickness(0,0,0,10);status.SetResourceReference(TextBlock.ForegroundProperty,"Muted");AutomationProperties.SetLiveSetting(status,AutomationLiveSetting.Polite);var statusScroll=new ScrollViewer{Content=status,MaxHeight=64,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};footer.Children.Add(statusScroll);
      activityTrack.Height=2;activityTrack.VerticalAlignment=VerticalAlignment.Bottom;activityTrack.Margin=new Thickness(0,0,0,4);activityTrack.Visibility=Visibility.Collapsed;activityTrack.ClipToBounds=true;activityTrack.SetResourceReference(Border.BackgroundProperty,"Edge");activityFill.SetResourceReference(Border.BackgroundProperty,"Accent");activityFill.RenderTransform=activityScale;activityFill.RenderTransformOrigin=new Point(0,0.5);activityTrack.Child=activityFill;footer.Children.Add(activityTrack);
      var nav=new Grid();nav.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});nav.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});Grid.SetRow(nav,1);footer.Children.Add(nav);
      back.Content=L.T("上一步");back.HorizontalAlignment=HorizontalAlignment.Left;back.Click+=(s,e)=>ShowStep(step-1);nav.Children.Add(back);
      next.Content=L.T("下一步");next.MinWidth=148;next.SetResourceReference(Control.BackgroundProperty,"Primary");next.SetResourceReference(Control.BorderBrushProperty,"Primary");next.Foreground=Brushes.White;Grid.SetColumn(next,1);next.Click+=async(s,e)=>await Navigate();nav.Children.Add(next);
      Localize(()=>retryBackend.Content=L.T("重新连接后台"));retryBackend.Visibility=Visibility.Collapsed;retryBackend.HorizontalAlignment=HorizontalAlignment.Left;retryBackend.Click+=async(s,e)=>await StartBackend();nav.Children.Add(retryBackend);
      ButtonMotion(back);ButtonMotion(next);ButtonMotion(connectionPrimary);ButtonMotion(connectionBack);
      BuildPages();foreach(var page in pages)UiMotion.AttachTree(page);Loaded+=(s,e)=>UiMotion.AttachTree(root);ShowStep(0);UpdateResponsiveLayout();SizeChanged+=(s,e)=>UpdateResponsiveLayout();
      SourceInitialized+=(s,e)=>UpdateTitleBar();SystemEvents.UserPreferenceChanged+=SystemThemeChanged;
      ContentRendered+=async(s,e)=>{if(started)return;started=true;if(this.startBackend)await StartBackend();else{ready=true;RefreshEnabled();}};
      Activated+=(s,e)=>{if(step>=3)RequestReadKeyRefresh();};
      Closing+=(s,e)=>{if(busy){e.Cancel=true;status.Text=L.T("当前操作尚未完成，请等结果后关闭。");}};
      Closed+=(s,e)=>{closed=true;SystemEvents.UserPreferenceChanged-=SystemThemeChanged;if(rpc!=null)rpc.Dispose();};
    }
    async Task ChangeLanguage(){
      L.Select(language.SelectedIndex==0?"zh-CN":"en",startBackend);
      SetTypography();
      if(rpc!=null)rpc.Language=L.Language;
      localizing=true;
      try {
        Title=L.T("Context Anywhere · 部署向导");
        foreach(var update in localizations)update();
        int themeIndex=theme.SelectedIndex;theme.Items.Clear();foreach(var item in new[]{"跟随系统","浅色","深色"})theme.Items.Add(L.T(item));theme.SelectedIndex=themeIndex;
        AutomationProperties.SetName(theme,L.T("外观"));
        SetClientChoices(aiClient.SelectedIndex);
        back.Content=L.T("上一步");connectionBack.Content=L.T("返回上一项");
        // Discard transient messages, not selections, credentials, deployment state, or typed values.
        status.Text="";status.ToolTip=null;vaultResult.Text="";previewResult.Text="";importResult.Text="";recoveryError="";
        if(state.ContainsKey("loginError"))state["loginError"]="";
        deployResult.Text=Bool(state,"deployed")?DeploymentSummary():"";
        ShowStep(step);RenderRecovery();RebuildReadKeyPickers();RenderConnection();
      } finally {localizing=false;}
      if(ready&&rpc!=null)try {
        await Run("state",null);
        if(Bool(state,"deployed")){var manual=await Run("manual",Args("includePassword",false));text["manual"].Text=Value(manual,"text");}
      } catch(Exception error){Error(error.Message);}
    }
    void SetTypography(){FontFamily=new FontFamily(L.Language=="zh-CN"?"Microsoft YaHei UI, Segoe UI":"Segoe UI Variable Text, Segoe UI, Microsoft YaHei UI");}
    [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
    void UpdateTitleBar(){var handle=new WindowInteropHelper(this).Handle;if(handle==IntPtr.Zero)return;try{int value=dark?1:0;DwmSetWindowAttribute(handle,20,ref value,4);int corners=2;DwmSetWindowAttribute(handle,33,ref corners,4);}catch{}}
    void ApplyTheme(){
      dark=theme.SelectedIndex==2;
      if(theme.SelectedIndex<=0)try{dark=Convert.ToInt32(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize","AppsUseLightTheme",1))==0;}catch{}
      var palette=dark?new[]{"#1B2028","#222B36","#252D38","#EDF2F8","#ACB9C9","#8DC4FF","#4F6073","#2868A8","#E8EDF2","#293E55","#FFB4AB"}:new[]{"#FFFFFF","#F1F5FA","#FFFFFF","#23344B","#5D6E83","#2163A7","#C6D1DE","#2163A7","#2163A7","#E4EFFB","#B33232"};
      var keys=new[]{"Surface","Side","Field","Ink","Muted","Accent","Edge","Primary","Logo","Selected","ErrorInk"};
      for(int i=0;i<keys.Length;i++){var brush=new SolidColorBrush((Color)ColorConverter.ConvertFromString(palette[i]));brush.Freeze();Resources[keys[i]]=brush;}UpdateTitleBar();
    }
    void ButtonMotion(Button button){
      // Keep labels on their pixel grid; hover and press feedback belong to the template.
      button.FocusVisualStyle=(Style)Resources["KeyboardFocus"];
      UiMotion.Attach(button);
    }
    void AnimatePage(StackPanel page,int direction){
      page.BeginAnimation(OpacityProperty,null);page.Opacity=1;var offset=new TranslateTransform();page.RenderTransform=offset;
      if(!IsLoaded||!SystemParameters.ClientAreaAnimation)return;
      var duration=TimeSpan.FromMilliseconds(180);var ease=new CubicEase{EasingMode=EasingMode.EaseOut};
      page.BeginAnimation(OpacityProperty,new DoubleAnimation(0.45,1,duration){EasingFunction=ease,FillBehavior=FillBehavior.Stop});
      offset.BeginAnimation(TranslateTransform.XProperty,new DoubleAnimation(direction<0?-12:12,0,duration){EasingFunction=ease,FillBehavior=FillBehavior.Stop});
    }
    void Activity(bool running){
      if(activityRunning==running)return;activityRunning=running;activityTrack.BeginAnimation(OpacityProperty,null);activityFill.BeginAnimation(OpacityProperty,null);activityTrack.Opacity=1;activityFill.Opacity=1;activityScale.ScaleX=1;
      if(running){activityTrack.Visibility=Visibility.Visible;if(SystemParameters.ClientAreaAnimation)activityFill.BeginAnimation(OpacityProperty,new DoubleAnimation(0.3,1,TimeSpan.FromMilliseconds(850)){AutoReverse=true,RepeatBehavior=RepeatBehavior.Forever});}
      else if(!SystemParameters.ClientAreaAnimation){activityTrack.Visibility=Visibility.Collapsed;}
      else {activityScale.ScaleX=1;var fade=new DoubleAnimation(1,0,TimeSpan.FromMilliseconds(180)){FillBehavior=FillBehavior.Stop};fade.Completed+=(s,e)=>{if(!activityRunning)activityTrack.Visibility=Visibility.Collapsed;};activityTrack.BeginAnimation(OpacityProperty,fade);}
    }
    void SystemThemeChanged(object sender,UserPreferenceChangedEventArgs e){Dispatcher.BeginInvoke(new Action(()=>{if(theme.SelectedIndex==0)ApplyTheme();}));}
    void UpdateResponsiveLayout(){bool compact=ActualWidth>0&&(ActualWidth<900||ActualHeight<620);sidebar.Visibility=compact?Visibility.Collapsed:Visibility.Visible;root.ColumnDefinitions[0].Width=new GridLength(compact?0:220);var inset=compact?18:28;if(shell.Margin.Left!=inset)shell.Margin=new Thickness(inset,16,inset,16);}
    async Task StartBackend(){if(initializing||closed)return;initializing=true;ready=false;status.Text=L.T("正在读取部署记录…");RefreshEnabled();try{
      if(rpc!=null){var old=rpc;rpc=null;old.Dispose();}
      var backend=await Task.Run(()=>new Rpc());if(closed){backend.Dispose();return;}
      rpc=backend;send=backend.Call;
      backend.Progress+=message=>Dispatcher.BeginInvoke(new Action(()=>{if(rpc==backend)status.Text=message;}));
      backend.StateChanged+=latest=>Dispatcher.BeginInvoke(new Action(()=>{if(rpc==backend){Update(latest);if(step==1)status.Text=authResult.Text;}}));
      backend.Disconnected+=()=>Dispatcher.BeginInvoke(new Action(()=>{if(rpc==backend&&!closed){ready=false;Error(L.T("后台连接已断开，请重新连接。"));RefreshEnabled();}}));
      var response=await send("state",Args());if(response.ContainsKey("error"))throw new Exception(Value(response,"error"));Update(Object(response,"state"));Restore();ready=true;
      status.Text=Bool(state,"localRecordUnreadable")?L.T("当前 Windows 账号无法打开本机记录。可登录 Cloudflare 找回部署，原记录会保留。"):Bool(state,"missingVault")?L.T("原知识库路径已失效。请选择这台电脑上的知识库。"):Bool(state,"deployed")?L.T("已恢复本机部署记录，可以继续连接 Obsidian、AI。"):L.T("请选择要接入的知识库。");
    }catch(Exception error){Error(error.Message);}finally{initializing=false;RefreshEnabled();}}
    void Localize(Action update){localizations.Add(update);update();}
    TextBlock Label(string value,double size=14,bool muted=false){var label=new TextBlock{FontSize=size,LineHeight=size*1.6,TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,0,0,7)};label.SetResourceReference(TextBlock.ForegroundProperty,muted?"Muted":"Ink");Localize(()=>label.Text=L.T(value));return label;}
    StackPanel Page(int index,string title,string intro){var page=new StackPanel{Margin=new Thickness(0,6,0,12)};pages[index]=page;var heading=Label(title,26);heading.FontWeight=FontWeights.Normal;heading.Margin=new Thickness(0,0,0,8);page.Children.Add(heading);Hint(page,intro);return page;}
    void Hint(StackPanel page,string value){var label=Label(value,14,true);label.Margin=new Thickness(0,0,0,16);page.Children.Add(label);}
    void Heading(StackPanel page,string value){var label=Label(value,17);label.FontWeight=FontWeights.Medium;label.Margin=new Thickness(0,20,0,10);page.Children.Add(label);}
    TextBox Input(StackPanel page,string key,string label,string value="",int height=0){var group=new StackPanel{Margin=new Thickness(0,0,0,16)};fieldGroups.Add(key,group);group.Children.Add(Label(label));var box=new TextBox{Text=value};if(height>0){box.Height=height;box.AcceptsReturn=true;box.TextWrapping=TextWrapping.Wrap;box.VerticalContentAlignment=VerticalAlignment.Top;box.VerticalScrollBarVisibility=ScrollBarVisibility.Auto;}Localize(()=>AutomationProperties.SetName(box,L.T(label)));box.TextChanged+=(s,e)=>box.ClearValue(Control.BorderBrushProperty);text.Add(key,box);group.Children.Add(box);page.Children.Add(group);return box;}
    void Check(StackPanel page,string key,string label,bool value=false){var content=Label(label);content.Margin=new Thickness(0);var box=new CheckBox{Content=content,IsChecked=value,Margin=new Thickness(0,3,0,3)};Localize(()=>AutomationProperties.SetName(box,L.T(label)));checks.Add(key,box);page.Children.Add(box);}
    void Number(StackPanel page,string key,string label,double value,double min,double max){
      var input=Input(page,key,label,value.ToString(CultureInfo.InvariantCulture));ranges.Add(key,new[]{min,max});
      var row=new StackPanel{Orientation=Orientation.Horizontal};fieldGroups[key].Children.Remove(input);input.Width=110;row.Children.Add(input);fieldGroups[key].Children.Add(row);
      Action<double> nudge=direction=>{double current;if(!Double.TryParse(input.Text,NumberStyles.Float,CultureInfo.InvariantCulture,out current)||Double.IsNaN(current)||Double.IsInfinity(current))current=value;input.Text=Math.Max(min,Math.Min(max,current+direction*(key=="debounceMs"?100:1))).ToString(CultureInfo.InvariantCulture);};
      foreach(var delta in new[]{-1.0,1.0}){double direction=delta;var button=new Button{Content=delta<0?"−":"+",Width=40,Padding=new Thickness(0),Margin=new Thickness(6,0,0,0)};Localize(()=>AutomationProperties.SetName(button,L.T(delta<0?"减少":"增加")+" · "+L.T(label)));button.Click+=(s,e)=>nudge(direction);ButtonMotion(button);actions.Add(button);row.Children.Add(button);}
      input.PreviewKeyDown+=(s,e)=>{if(e.Key==Key.Up||e.Key==Key.Down){nudge(e.Key==Key.Up?1:-1);e.Handled=true;}};input.ToolTip=min+"–"+max;
    }
    Button Action(Panel page,string label,Func<Task> work){var button=new Button{Content=Label(label),HorizontalAlignment=HorizontalAlignment.Left,Margin=new Thickness(0,4,0,14)};((TextBlock)button.Content).ClearValue(TextBlock.ForegroundProperty);((TextBlock)button.Content).Margin=new Thickness(0);((TextBlock)button.Content).TextAlignment=TextAlignment.Center;Localize(()=>AutomationProperties.SetName(button,L.T(label)));ButtonMotion(button);button.Click+=async(s,e)=>{try{await work();}catch(Exception error){Error(error.Message);}};actions.Add(button);page.Children.Add(button);return button;}
    void Result(StackPanel page,TextBlock result){result.TextWrapping=TextWrapping.Wrap;result.LineHeight=22;result.SetResourceReference(TextBlock.ForegroundProperty,"Accent");result.Margin=new Thickness(0,4,0,16);AutomationProperties.SetLiveSetting(result,AutomationLiveSetting.Polite);var style=new Style(typeof(TextBlock));var trigger=new Trigger{Property=TextBlock.TextProperty,Value=""};trigger.Setters.Add(new Setter(VisibilityProperty,Visibility.Collapsed));style.Triggers.Add(trigger);result.Style=style;page.Children.Add(result);}
    StackPanel Details(StackPanel page,string title){var content=new StackPanel();var section=new Expander{Content=content,Margin=new Thickness(0,4,0,16)};Localize(()=>section.Header=L.T(title));page.Children.Add(section);return content;}
    void DependsOn(string field,string option){Action update=()=>UiMotion.Reveal(fieldGroups[field],checks[option].IsChecked==true);checks[option].Checked+=(s,e)=>update();checks[option].Unchecked+=(s,e)=>update();update();}
    void FocusField(Control control){DependencyObject parent=control;while(parent!=null){var expander=parent as Expander;if(expander!=null)expander.IsExpanded=true;for(int i=0;i<pages.Length;i++)if(parent==pages[i]&&step!=i)ShowStep(i);parent=LogicalTreeHelper.GetParent(parent);}control.SetResourceReference(Control.BorderBrushProperty,"ErrorInk");UpdateLayout();control.BringIntoView();control.Focus();}
    void Guide(StackPanel page,string name,string url){var link=Action(page,name,()=>{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});return Task.FromResult(0);});link.BorderThickness=new Thickness(0);link.Background=Brushes.Transparent;link.SetResourceReference(Control.ForegroundProperty,"Accent");link.Padding=new Thickness(0,2,0,2);link.MinHeight=26;link.Margin=new Thickness(0,0,0,6);}
    void Primary(Button button){button.SetResourceReference(Control.BackgroundProperty,"Primary");button.SetResourceReference(Control.BorderBrushProperty,"Primary");button.Foreground=Brushes.White;}
    void RefreshScope(){
      if(updatingScope)return;updatingScope=true;try{bool all=checks["mirrorAll"].IsChecked==true;scopeAll.IsChecked=all;scopeCustom.IsChecked=!all;UiMotion.Reveal(scopePaths,!all);scopeHint.Text=L.T("将同步全部 Markdown 笔记。自定义路径已保留，切回后可继续编辑。");UiMotion.Reveal(scopeHint,all);if(scopeFolderButton!=null)scopeFolderButton.Visibility=scopeNoteButton.Visibility=all?Visibility.Collapsed:Visibility.Visible;previewResult.Text="";}finally{updatingScope=false;}
    }
    void AddScopePaths(IEnumerable<string> selected){
      string vault=Value(Object(state,"vault"),"path",text["vault"].Text);if(String.IsNullOrWhiteSpace(vault)||!Directory.Exists(vault))throw new Exception(L.T("知识库文件夹不存在，请返回第一步重新选择。"));
      string rootPath=Path.GetFullPath(vault).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar)+Path.DirectorySeparatorChar;
      var paths=new List<string>();foreach(var item in selected){string full=Path.GetFullPath(item);if(String.Equals(full.TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,rootPath,StringComparison.OrdinalIgnoreCase))throw new Exception(L.T("这是知识库根目录。如需全部笔记，请选择“整个知识库”。"));if(!full.StartsWith(rootPath,StringComparison.OrdinalIgnoreCase))throw new Exception(L.T("请选择当前知识库内的文件夹或 Markdown 笔记。"));if(!Directory.Exists(full)&&(!File.Exists(full)||!full.EndsWith(".md",StringComparison.OrdinalIgnoreCase)))throw new Exception(L.T("请选择当前知识库内的文件夹或 Markdown 笔记。"));paths.Add(full.Substring(rootPath.Length).Replace('\\','/'));}
      var combined=new List<string>();var unique=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var item in text["includePrefixes"].Text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries)){if(unique.Add(item.Trim()))combined.Add(item.Trim());}foreach(var item in paths)if(unique.Add(item))combined.Add(item);
      text["includePrefixes"].Text=String.Join(Environment.NewLine,combined);checks["mirrorAll"].IsChecked=false;text["includePrefixes"].Focus();text["includePrefixes"].CaretIndex=text["includePrefixes"].Text.Length;
    }
    Task BrowseScope(bool notes){
      string vault=Value(Object(state,"vault"),"path",text["vault"].Text);if(!Directory.Exists(vault)){FocusField(text["vault"]);throw new Exception(L.T("知识库文件夹不存在，请返回第一步重新选择。"));}
      if(notes){var picker=new OpenFileDialog{Title=L.T("选择要同步的笔记"),InitialDirectory=vault,Filter=L.T("Markdown 笔记|*.md"),Multiselect=true,CheckFileExists=true};if(picker.ShowDialog(this)==true)AddScopePaths(picker.FileNames);}
      else{var chosen=FolderPicker.Select(this,L.T("选择知识库内的文件夹"),vault);if(chosen!=null)AddScopePaths(new[]{chosen});}return Task.FromResult(0);
    }
    Dictionary<string,object> Args(params object[] items){var result=new Dictionary<string,object>();for(int i=0;i<items.Length;i+=2)result.Add((string)items[i],items[i+1]);return result;}
    string Value(Dictionary<string,object> data,string key,string fallback=""){object value;return data!=null&&data.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):fallback;}
    bool Bool(Dictionary<string,object> data,string key){object value;return data!=null&&data.TryGetValue(key,out value)&&value is bool&&(bool)value;}
    Dictionary<string,object> Object(Dictionary<string,object> data,string key){object value;return data!=null&&data.TryGetValue(key,out value)?value as Dictionary<string,object>:null;}
    string SelectedRecovery(){return deployments.SelectedIndex>=0&&deployments.SelectedIndex<recoveryList.Count?Value(recoveryList[deployments.SelectedIndex],"key"):"";}
    void QueueDiscovery(){
      var account=SelectedAccount();if(!ready||send==null||busy||localizing||updatingAccounts||discoveryQueued||!Bool(state,"authenticated")||account==""||discoveryAttempt==account)return;
      if(Bool(state,"recoveryChecked")&&Value(state,"recoveryAccountId")==account)return;
      discoveryQueued=true;Dispatcher.BeginInvoke(new Action(async()=>{discoveryQueued=false;await DiscoverRecoveries(false);}));
    }
    async Task DiscoverRecoveries(bool force){
      var account=SelectedAccount();if(!ready||send==null||busy||!Bool(state,"authenticated")||account=="")return;
      if(!force&&(discoveryAttempt==account||(Bool(state,"recoveryChecked")&&Value(state,"recoveryAccountId")==account)))return;
      discoveryAttempt=account;recoveryError="";recoveryResult.Text=L.T("正在查找这个账号中的部署…");
      try{await Run("recovery.list",Args("accountId",account));}
      catch(Exception error){recoveryError=error.Message;Error(error.Message);}finally{RenderRecovery();}
    }
    void RenderRecovery(){
      if(restoreDeployment==null)return;
      recoveryArea.Visibility=Bool(state,"authenticated")?Visibility.Visible:Visibility.Collapsed;
      string selected=SelectedRecovery();renderingRecoveries=true;recoveryList.Clear();deployments.Items.Clear();object raw;
      bool checkedAccount=Bool(state,"recoveryChecked")&&Value(state,"recoveryAccountId")==SelectedAccount();
      if(checkedAccount&&state.TryGetValue("recoveries",out raw)&&raw is IEnumerable)foreach(var item in (IEnumerable)raw){var record=item as Dictionary<string,object>;if(record!=null){recoveryList.Add(record);deployments.Items.Add(Value(record,"label")+"\n"+Value(record,"workerUrl"));}}
      for(int i=0;i<recoveryList.Count;i++)if(Value(recoveryList[i],"key")==selected)deployments.SelectedIndex=i;
      if(deployments.SelectedIndex<0&&recoveryList.Count==1)deployments.SelectedIndex=0;
      renderingRecoveries=false;
      bool found=recoveryList.Count>0;deployments.Visibility=restoreDeployment.Visibility=found&&!Bool(state,"deployed")?Visibility.Visible:Visibility.Collapsed;
      newDeployment.Visibility=checkedAccount&&(found||Bool(state,"localRecordUnreadable"))&&!Bool(state,"deployed")&&Object(state,"names")==null?Visibility.Visible:Visibility.Collapsed;
      attachDeploymentSection.Visibility=Bool(state,"deployed")||Object(state,"names")!=null?Visibility.Collapsed:Visibility.Visible;
      backupDeployment.Visibility=Bool(state,"deployed")&&!Bool(state,"recoverySaved")?Visibility.Visible:Visibility.Collapsed;
      if(recoveryError!="")recoveryResult.Text=recoveryError;
      else if(SelectedAccount()=="")recoveryResult.Text=L.T("选择账号后会自动查找可恢复的部署。");
      else if(Bool(state,"deployed"))recoveryResult.Text=Value(state,"recoveryWarning")!=""?Value(state,"recoveryWarning"):Bool(state,"recoverySaved")?L.T("这个部署已有恢复记录，新电脑登录 Cloudflare 即可找回。"):L.T("本机部署已保留。登录原账号后保存恢复记录，新电脑就能找回。");
      else if(!checkedAccount&&discoveryAttempt==SelectedAccount()&&!busy)recoveryResult.Text=L.T("查找尚未完成，可以点击“重新查找”再试。");
      else if(!checkedAccount)recoveryResult.Text=L.T("正在查找这个账号中的部署…");
      else if(found)recoveryResult.Text=Value(state,"recoveryChoice")=="new"?L.T("已选择创建全新镜像，点击下一步继续。"):L.T("找到已有部署。选择后恢复，无需手动搬运密钥和地址。");
      else if(Bool(state,"localRecordUnreadable"))recoveryResult.Text=L.T("这个账号没有云端恢复记录。可尝试其他账号，或在原电脑保存恢复记录。");
      else recoveryResult.Text=L.T("这个账号还没有恢复记录，点击下一步创建全新镜像。旧部署需先在原电脑保存恢复记录。");
      deploymentFields.Visibility=deploymentActions.Visibility=Bool(state,"deployed")?Visibility.Collapsed:Visibility.Visible;
      credentialActions.Visibility=Bool(state,"deployed")?Visibility.Visible:Visibility.Collapsed;
      credentialSection.Visibility=credentialActions.Visibility;
      if(Value(state,"recoveryWarning")!="")credentialSection.IsExpanded=true;
      deploymentMaintenance.Visibility=Bool(state,"deployed")&&!Recovered?Visibility.Visible:Visibility.Collapsed;
      if(backupShortcut!=null)backupShortcut.Visibility=Bool(state,"deployed")&&!Bool(state,"recoverySaved")?Visibility.Visible:Visibility.Collapsed;
      if(pages[3]!=null){((TextBlock)pages[3].Children[0]).Text=L.T(Recovered?"恢复与导入":Bool(state,"deployed")?"连接与导入":"部署镜像");((TextBlock)pages[3].Children[1]).Text=L.T(Recovered?"部署和凭据已恢复。将这台设备的同步设置导入 Obsidian，即可继续使用。":Bool(state,"deployed")?"镜像已就绪。将本机连接设置导入 Obsidian，或继续接入 AI。":"先创建镜像，再将连接设置导入 Obsidian。导入后会自动检查连接并开始同步。");}
      if(stepLabels.Count>3)stepLabels[3].Text=L.T(Recovered?"恢复与导入":Bool(state,"deployed")?"连接与导入":"部署与导入");
    }
    async Task CopySecret(string kind){
      if(kind=="")throw new Exception(L.T("请选择读取密码。"));
      var result=await Run("secret.get",Args("kind",kind));
      try{await Copy(Value(result,"value"),L.T(kind=="write"?"上传凭据已复制。":"读取密码已复制，请在镜像授权页粘贴。"));}
      finally{result.Clear();}
    }
    string SelectedReadKey(ComboBox picker){return picker.SelectedValue as string??"";}
    bool CanManageReadKeys(){return Bool(state,"authenticated")&&SelectedAccount()!=""&&SelectedAccount()==Value(state,"accountId");}
    bool RequireReadKeyAccount(){
      if(CanManageReadKeys())return true;
      ShowStep(1);status.Text=L.T("登录原部署所属的 Cloudflare 账号，再返回刷新或管理读取密码。");return false;
    }
    void RequestReadKeyRefresh(){keyRefreshRequested=true;QueueReadKeyRefresh();}
    void QueueReadKeyRefresh(){
      if(closed||!keyRefreshRequested||keyRefreshQueued||!ready||send==null||busy||localizing||step<3||!Bool(state,"deployed")||!CanManageReadKeys())return;
      keyRefreshQueued=true;Dispatcher.BeginInvoke(new Action(async()=>{
        keyRefreshQueued=false;
        if(closed||!keyRefreshRequested||busy||step<3||!ready||!CanManageReadKeys())return;
        await RefreshReadKeysFromCloud();
      }));
    }
    async Task RefreshReadKeysFromCloud(){
      if(!RequireReadKeyAccount())return;
      keyRefreshRequested=false;
      try{
        var result=await Run("secret.refresh",null);
        keyRefreshFailed=!Bool(result,"refreshed");
        if(!keyRefreshFailed)status.Text=L.T("云端读取密码已刷新。");
      }
      catch(Exception error){keyRefreshFailed=true;Error(error.Message);}
      RenderReadKeyStatus();
    }
    void RenderReadKeyStatus(){
      string message=keyRefreshFailed?L.T("未能刷新云端读取密码。列表为本机缓存，可重试。"):
        Value(state,"pendingKeyUpdate")!=""?L.T("有一项读取密码更改尚未完成。请在管理读取密码中继续。"):
        Bool(state,"deployed")&&!CanManageReadKeys()?L.T("当前显示本机保存的读取密码。登录原部署所属的 Cloudflare 账号可刷新云端列表。"):
        Bool(state,"deployed")&&readKeys.Count==0?L.T("没有可选的读取密码。可以新增一把。"):"";
      keySyncStatus.Text=connectionKeySyncStatus.Text=message;
      keySyncStatus.SetResourceReference(TextBlock.ForegroundProperty,keyRefreshFailed?"ErrorInk":"Muted");
      connectionKeySyncStatus.SetResourceReference(TextBlock.ForegroundProperty,keyRefreshFailed?"ErrorInk":"Muted");
    }
    void PopulateReadKeyPicker(ComboBox picker,string selected,bool selectFirst){
      picker.Items.Clear();
      for(int i=0;i<readKeys.Count;i++){
        var key=readKeys[i];string name=Value(key,"name"),kind=Value(key,"kind");
        string binding=kind=="read"?"MIRROR_READ_KEY":"MIRROR_READ_KEY_"+Value(key,"slot");
        string title=name!=""?name:kind=="read"?L.T("默认读取密码"):binding;
        var item=new ComboBoxItem{Tag=kind,ToolTip=binding,Content=new TextBlock{Text=title,TextWrapping=TextWrapping.Wrap}};
        AutomationProperties.SetHelpText(item,binding);picker.Items.Add(item);
      }
      if(selected!="")picker.SelectedValue=selected;
      if(picker.SelectedIndex<0&&selectFirst&&picker.Items.Count>0)picker.SelectedIndex=0;
    }
    void RebuildReadKeyPickers(){
      string managed=SelectedReadKey(managedReadKey),chosen="";connectionKeyChoices.TryGetValue(aiClient.SelectedIndex,out chosen);
      object raw;readKeys.Clear();
      if(state.TryGetValue("readKeys",out raw)&&raw is IEnumerable)foreach(var item in (IEnumerable)raw){var key=item as Dictionary<string,object>;if(key!=null&&Value(key,"kind")!="")readKeys.Add(key);}
      renderingReadKeys=true;
      try{
        PopulateReadKeyPicker(managedReadKey,managed,true);
        // Preserve a deliberate choice if it still exists. Ask again if it was removed.
        PopulateReadKeyPicker(connectionReadKey,chosen??"",chosen==null&&readKeys.Count==1);
      }finally{renderingReadKeys=false;}
      RenderManagedReadKey();RenderReadKeyStatus();
    }
    void RenderManagedReadKey(){
      string kind=SelectedReadKey(managedReadKey);
      var key=readKeys.Find(item=>Value(item,"kind")==kind);
      string name=Value(key,"name");
      if(managedKeyKind!=kind||managedKeyName.Text==managedKeySourceName)managedKeyName.Text=name;
      if(managedKeyKind!=kind)importedReadKey.Clear();
      managedKeyKind=kind;managedKeySourceName=name;
      managedReadKey.Visibility=selectedKeyActions.Visibility=readKeys.Count>0?Visibility.Visible:Visibility.Collapsed;
      resumeReadKey.Visibility=Value(state,"pendingKeyUpdate")==""?Visibility.Collapsed:Visibility.Visible;
    }
    async Task ChangeReadKey(string action){
      if(!RequireReadKeyAccount())return;
      string kind=SelectedReadKey(managedReadKey);
      bool adding=action=="add"||(action=="resume"&&Value(state,"pendingKeyAction")=="add");
      var input=action=="resume"?Args():Args("kind",kind);
      if(action=="add")input=Args("name",newKeyName.Text.Trim());
      else if(action=="rename")input["name"]=managedKeyName.Text.Trim();
      else if(action=="import")input["value"]=importedReadKey.Password;
      else if(action=="rotate"&&Value(state,"pendingKeyUpdate")==""){
        if(MessageBox.Show(this,L.T("更换这把读取密码？使用旧密码直接读取的客户端需要更新，已有 OAuth 授权仍有效。"),L.T("管理读取密码"),MessageBoxButton.OKCancel,MessageBoxImage.Question)!=MessageBoxResult.OK)return;
      }
      else if(action=="delete"){
        if(MessageBox.Show(this,L.T("删除所选读取密码？直接使用这把密码的客户端将无法读取。"),L.T("管理读取密码"),MessageBoxButton.OKCancel,MessageBoxImage.Question)!=MessageBoxResult.OK)return;
      }
      try{
        var result=await Run("secret."+action,input);
        if(adding){
          string added=Value(result,"kind");if(added!="")managedReadKey.SelectedValue=added;
          newKeyName.Clear();addKeySection.IsExpanded=false;
        }
        if(action=="rename"){managedKeyName.Text=managedKeySourceName;}
        if(action=="import")importedReadKey.Clear();
        keyRefreshFailed=false;RenderReadKeyStatus();
        string warning=Value(result,"warning");
        status.Text=warning!=""?warning:L.T(adding?"读取密码已新增，可以复制。":"读取密码列表已更新。");
      }finally{input.Clear();}
    }
    void BuildReadKeys(){
      Heading(credentialActions,"管理读取密码");
      Result(credentialActions,keySyncStatus);
      Action(credentialActions,"刷新云端读取密码",RefreshReadKeysFromCloud);
      resumeReadKey=Action(credentialActions,"继续上次密码更新",()=>ChangeReadKey("resume"));
      managedReadKey.SelectedValuePath="Tag";managedReadKey.Margin=new Thickness(0,0,0,8);
      Localize(()=>AutomationProperties.SetName(managedReadKey,L.T("选择读取密码")));credentialActions.Children.Add(managedReadKey);
      credentialActions.Children.Add(selectedKeyActions);
      copyReadKey=Action(selectedKeyActions,"复制所选读取密码",()=>CopySecret(SelectedReadKey(managedReadKey)));
      var settings=Details(selectedKeyActions,"编辑所选读取密码");
      managedKeyName=Input(settings,"managedKeyName","名称（可选）");
      renameReadKey=Action(settings,"保存名称",()=>ChangeReadKey("rename"));
      rotateReadKey=Action(settings,"轮换所选读取密码",()=>ChangeReadKey("rotate"));
      deleteReadKey=Action(settings,"删除所选读取密码",()=>ChangeReadKey("delete"));
      var advanced=Details(settings,"导入已在 Cloudflare 更改的读取密码");
      Hint(advanced,"粘贴所选读取密码的线上值。向导验证后会更新本机和云端恢复记录。");
      Localize(()=>AutomationProperties.SetName(importedReadKey,L.T("当前线上读取密码")));advanced.Children.Add(importedReadKey);
      importReadKey=Action(advanced,"验证并导入",()=>ChangeReadKey("import"));
      managedReadKey.SelectionChanged+=(s,e)=>{if(!renderingReadKeys){RenderManagedReadKey();RefreshEnabled();}};
      var add=new StackPanel();addKeySection.Content=add;addKeySection.Margin=new Thickness(0,4,0,16);
      Localize(()=>addKeySection.Header=L.T("新增读取密码"));credentialActions.Children.Add(addKeySection);
      newKeyName=Input(add,"newKeyName","名称（可选）");
      addReadKey=Action(add,"生成新密码",()=>ChangeReadKey("add"));
    }
    string DeploymentSummary(){return L.T(Bool(state,"recoverySaved")?"镜像已就绪。\n":"镜像已就绪，恢复记录待重试。\n")+Value(state,"workerUrl")+(Value(state,"recoveryWarning")==""?"":"\n"+Value(state,"recoveryWarning"));}
    async Task BackupRecovery(){
      recoveryError="";
      try{var result=await Run("recovery.backup",null);if(Bool(result,"saved")){ShowStep(3);status.Text=L.T("恢复记录已保存。新电脑登录 Cloudflare 即可找回部署。");}else{RenderRecovery();status.Text=L.T("镜像可继续使用，恢复记录稍后可以重试。");}}
      catch(Exception error){recoveryError=error.Message;RenderRecovery();Error(error.Message);}
    }
    void FinishRecovery(){
      Restore();
      if(recoveryFirst||Object(state,"vault")==null||Bool(state,"missingVault")){credentialSection.IsExpanded=true;ShowStep(3);status.Text=L.T("部署已恢复，可以复制凭据或接入 AI。");}
      else{ShowStep(2);status.Text=L.T("部署已恢复到这台电脑。接下来选择本机同步范围。");}
    }
    void BuildRecovery(StackPanel page){
      page.Children.Add(recoveryArea);Heading(recoveryArea,"这个账号的部署");Result(recoveryArea,recoveryResult);
      deployments.Margin=new Thickness(0,0,0,12);Localize(()=>AutomationProperties.SetName(deployments,L.T("选择要恢复的部署")));recoveryArea.Children.Add(deployments);
      restoreDeployment=Action(recoveryArea,"恢复此部署",async()=>{
        if(SelectedRecovery()=="")throw new Exception(L.T("请选择要恢复的部署。"));
        await Run("recovery.restore",Args("accountId",SelectedAccount(),"key",SelectedRecovery()));FinishRecovery();
      });
      restoreDeployment.SetResourceReference(Control.BackgroundProperty,"Primary");restoreDeployment.Foreground=Brushes.White;
      newDeployment=Action(recoveryArea,"创建全新镜像",async()=>{await Run("recovery.new",Args("accountId",SelectedAccount()));ShowStep(Object(state,"vault")==null?0:2);});
      backupDeployment=Action(recoveryArea,"保存本机部署的恢复记录",async()=>await BackupRecovery());
      refreshRecovery=Action(recoveryArea,"重新查找",async()=>await DiscoverRecoveries(true));
      var attach=new StackPanel();var attachSection=new Expander{Content=attach,Margin=new Thickness(0,4,0,16)};
      Localize(()=>attachSection.Header=L.T("连接手动部署"));recoveryArea.Children.Add(attachSection);
      attachDeploymentSection=attachSection;
      Hint(attach,"填写原有 Worker 的名称和上传凭据。向导会核验该 Worker、更新镜像程序，并在原账号内保存恢复记录。");
      attachWorker=Input(attach,"attachWorker","现有 Worker 名称");
      attach.Children.Add(Label("现有上传凭据"));Localize(()=>AutomationProperties.SetName(attachWrite,L.T("现有上传凭据")));attach.Children.Add(attachWrite);
      attachDeployment=Action(attach,"验证并连接 Worker",async()=>{
        if(SelectedAccount()=="")throw new Exception(L.T("请连接 Cloudflare 并选择账号。"));
        if(String.IsNullOrWhiteSpace(attachWorker.Text)){FocusField(attachWorker);throw new Exception(L.T("请填写现有 Worker 的名称。"));}
        if(attachWrite.Password==""){FocusField(attachWrite);throw new Exception(L.T("请填写现有上传凭据。"));}
        var input=Args("accountId",SelectedAccount(),"worker",attachWorker.Text.Trim(),"write",attachWrite.Password);
        try{await Run("recovery.attach",input);attachWrite.Clear();attachWorker.Clear();FinishRecovery();}finally{input.Clear();}
      });
      deployments.SelectionChanged+=(s,e)=>{if(!renderingRecoveries)RefreshEnabled();};
      accounts.SelectionChanged+=(s,e)=>{if(!updatingAccounts&&!localizing){attachWrite.Clear();recoveryError="";RenderRecovery();RenderReadKeyStatus();RefreshEnabled();}};
      RenderRecovery();
    }
    void BuildPages(){
      var p=Page(0,"选择你的知识库","把选中的笔记连接到 AI。先选知识库，向导会检查 AI Bridge 是否就绪。");
      Input(p,"vault","Obsidian 知识库文件夹");
      var picker=Action(p,"浏览文件夹…",()=>{try{var selected=FolderPicker.Select(this,L.T("选择已安装 AI Bridge 的知识库"),text["vault"].Text);if(selected!=null)text["vault"].Text=selected;}catch(COMException){FocusField(text["vault"]);throw new Exception(L.T("文件夹选择器无法打开。请在输入框粘贴这台电脑上的知识库完整路径。"));}return Task.FromResult(0);});
      p.Children.Remove(picker);var vaultRow=new Grid();vaultRow.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});vaultRow.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});fieldGroups["vault"].Children.Remove(text["vault"]);vaultRow.Children.Add(text["vault"]);picker.Margin=new Thickness(10,0,0,0);Grid.SetColumn(picker,1);vaultRow.Children.Add(picker);fieldGroups["vault"].Children.Add(vaultRow);
      Check(p,"replaceMissingVault","原知识库已移动，将现有部署连接到所选文件夹");
      checks["replaceMissingVault"].Visibility=Visibility.Collapsed;
      cloudRecovery=Action(p,"从 Cloudflare 找回已有部署",()=>{recoveryFirst=true;ShowStep(Bool(state,"deployed")?3:1);return Task.FromResult(0);});
      Localize(RenderVaultShortcut);
      Result(p,vaultResult);Guide(p,"安装 AI Bridge 插件 ↗","https://community.obsidian.md/plugins/ai-bridge");
      checks.Add("pluginConfirmed",new CheckBox());
      var vaultAdvanced=Details(p,"自定义 Obsidian 配置目录");Input(vaultAdvanced,"configDir","Obsidian 配置目录（通常保持默认）",".obsidian");
      Heading(p,"准备 Cloudflare 账号");Check(p,"cfAccountConfirmed","我已有 Cloudflare 账号，并已启用 R2");
      var prerequisites=Details(p,"还没准备好？查看开通指引");Guide(prerequisites,"注册 Cloudflare 账号 ↗","https://dash.cloudflare.com/sign-up");Guide(prerequisites,"查看 R2 启用指引 ↗","https://developers.cloudflare.com/r2/get-started/");Hint(prerequisites,"R2 标准存储每月免费额度：10 GB·月存储、100 万次 A 类操作（如写入、列举）、1000 万次 B 类操作（如读取）。出站流量免费。超出额度的费用以 Cloudflare 官方价格为准。");
      text["vault"].TextChanged+=(s,e)=>{checks["pluginConfirmed"].IsChecked=false;vaultResult.Text="";};text["configDir"].TextChanged+=(s,e)=>{checks["pluginConfirmed"].IsChecked=false;vaultResult.Text="";};
      p=Page(1,"连接 Cloudflare","登录 Cloudflare 后，向导会在所选账号中查找可恢复的部署。");
      var login=Action(p,"在浏览器中登录 Cloudflare",async()=>{await Run("cloudflare.login",null);status.Text=Bool(state,"authenticated")?authResult.Text:L.T("请在浏览器中完成授权。连接成功后，这里会自动提示。");});Primary(login);
      Hint(p,"授权页面中的 Wrangler 是 Cloudflare 官方工具。授权用于发现已有部署或创建新镜像。");Result(p,authResult);p.Children.Add(Label("选择 Cloudflare 账号"));accounts.Margin=new Thickness(0,0,0,16);Localize(()=>AutomationProperties.SetName(accounts,L.T("选择 Cloudflare 账号")));p.Children.Add(accounts);BuildRecovery(p);
      tokenSection.Content=tokenArea;tokenSection.Margin=new Thickness(0,12,0,12);Localize(()=>tokenSection.Header=L.T("改用 API Token 连接"));p.Children.Add(tokenSection);
      Hint(tokenArea,"如果已通过浏览器连接，直接点击下一步。\n使用 API Token 时，需要账号读取权限，以及 Workers Scripts、Workers KV、Workers R2 Storage 编辑权限。");tokenArea.Children.Add(Label("Cloudflare API Token"));cfToken.Margin=new Thickness(0,0,0,12);AutomationProperties.SetName(cfToken,"Cloudflare API Token");tokenArea.Children.Add(cfToken);tokenButton=Action(tokenArea,"使用 Token 连接",async()=>{var token=cfToken.Password;cfToken.Clear();await Run("cloudflare.token",Args("token",token));status.Text=authResult.Text;});
      p=Page(2,"选择要同步的内容","只有你选中的笔记会上传到镜像，供 AI 搜索和读取。");
      Input(p,"deviceName","设备名称",Environment.MachineName);
      checks.Add("mirrorAll",new CheckBox());var scopeChoices=new WrapPanel{Margin=new Thickness(0,0,0,10)};scopeCustom.GroupName=scopeAll.GroupName="SyncScope";scopeCustom.Margin=new Thickness(0,0,24,0);scopeAll.Margin=new Thickness(0);Localize(()=>{scopeCustom.Content=L.T("选择文件夹或笔记");scopeAll.Content=L.T("整个知识库");AutomationProperties.SetName(scopeCustom,L.T("选择文件夹或笔记"));AutomationProperties.SetName(scopeAll,L.T("整个知识库"));});scopeChoices.Children.Add(scopeCustom);scopeChoices.Children.Add(scopeAll);p.Children.Add(scopeChoices);
      scopeHint.TextWrapping=TextWrapping.Wrap;scopeHint.LineHeight=22;scopeHint.Margin=new Thickness(0,0,0,12);scopeHint.SetResourceReference(TextBlock.ForegroundProperty,"Muted");p.Children.Add(scopeHint);p.Children.Add(scopePaths);
      Input(scopePaths,"includePrefixes","指定文件夹或笔记（每行一项）","",100);Hint(scopePaths,"例如：Projects 或 Inbox/想法.md；也可拖入文件夹或笔记。");
      scopeFolderButton=Action(scopePaths,"添加文件夹…",()=>BrowseScope(false));scopeNoteButton=Action(scopePaths,"添加笔记…",()=>BrowseScope(true));scopePaths.Children.Remove(scopeFolderButton);scopePaths.Children.Remove(scopeNoteButton);var scopeTools=new WrapPanel();scopeFolderButton.Margin=new Thickness(0,0,10,12);scopeNoteButton.Margin=new Thickness(0,0,10,12);scopeTools.Children.Add(scopeFolderButton);scopeTools.Children.Add(scopeNoteButton);p.Children.Add(scopeTools);
      scopeCustom.Checked+=(s,e)=>{if(!updatingScope)checks["mirrorAll"].IsChecked=false;};scopeAll.Checked+=(s,e)=>{if(!updatingScope)checks["mirrorAll"].IsChecked=true;};checks["mirrorAll"].Checked+=(s,e)=>RefreshScope();checks["mirrorAll"].Unchecked+=(s,e)=>RefreshScope();Localize(()=>RefreshScope());
      text["includePrefixes"].TextChanged+=(s,e)=>previewResult.Text="";text["includePrefixes"].AllowDrop=true;text["includePrefixes"].PreviewDragOver+=(s,e)=>{if(e.Data.GetDataPresent(DataFormats.FileDrop)){e.Effects=DragDropEffects.Copy;e.Handled=true;}};text["includePrefixes"].PreviewDrop+=(s,e)=>{if(e.Data.GetDataPresent(DataFormats.FileDrop)){e.Handled=true;try{AddScopePaths((string[])e.Data.GetData(DataFormats.FileDrop));}catch(Exception error){Error(error.Message);}}};
      var preview=Action(p,"预览选中范围",async()=>{var result=await Run("preview",Options());previewResult.Text=L.T("此范围包含 ")+Value(result,"notes")+L.T(" 篇笔记。这里只做预览，还没有上传。");UiMotion.FadeIn(previewResult);});p.Children.Remove(preview);preview.Margin=new Thickness(0,0,0,12);scopeTools.Children.Add(preview);Result(p,previewResult);
      Heading(p,"同步方式");Check(p,"syncOnChange","修改笔记后自动上传",true);Check(p,"syncAttachments","同步笔记引用的图片和已允许的 PDF");Number(p,"maxAttachmentMiB","单个附件上限（MiB）",8,1,8);DependsOn("maxAttachmentMiB","syncAttachments");
      Check(p,"bidirectionalEnabled","也下载镜像中的更新（双向同步）");
      var syncAdvanced=Details(p,"定时同步与更多选项");Check(syncAdvanced,"autoSyncEnabled","定时同步");Number(syncAdvanced,"autoSyncIntervalMinutes","同步间隔（分钟）",15,1,1440);DependsOn("autoSyncIntervalMinutes","autoSyncEnabled");Number(syncAdvanced,"debounceMs","修改后等待时间（毫秒）",1200,250,10000);DependsOn("debounceMs","syncOnChange");Hint(syncAdvanced,"默认只把本机内容上传到镜像。开启双向同步后，也会下载镜像中的更新；发生冲突时，较旧版本保存在 AI Bridge Conflicts 文件夹中。");Hint(syncAdvanced,"插件设置和冲突副本不会上传。启用附件同步后，只上传所选笔记引用的附件。");
      p.Children.Add(deploymentFields);var naming=Details(deploymentFields,"镜像名称与 Cloudflare 子域名");Input(naming,"label","部署名称（小写字母、数字、连字符）","context-anywhere");Hint(naming,"名称末尾会自动加上一段随机字符，用来区分不同镜像。");Input(naming,"workersSubdomain","首次开通 Workers 时的子域名（可留空）");
      p=Page(3,"部署镜像","先创建镜像，再将连接设置导入 Obsidian。导入后会自动检查连接并开始同步。");
      Result(p,deployResult);p.Children.Add(deploymentActions);
      selectLocalVault=Action(p,"选择本机知识库以连接 Obsidian",()=>{ShowStep(0);return Task.FromResult(0);});
      selectLocalVault.Visibility=Visibility.Collapsed;
      deployButton=Action(deploymentActions,"部署镜像",async()=>{var input=Options();input["label"]=text["label"].Text;input["workersSubdomain"]=text["workersSubdomain"].Text;input["accountId"]=SelectedAccount();await Run("deploy",input);deployResult.Text=DeploymentSummary();});
      Primary(deployButton);credentialSection.Content=credentialActions;credentialSection.Margin=new Thickness(0,20,0,8);Localize(()=>credentialSection.Header=L.T("读取密码、上传凭据与恢复"));Action(credentialActions,"复制上传凭据",async()=>await CopySecret("write"));BuildReadKeys();
      backupShortcut=Action(credentialActions,"保存恢复记录",async()=>{if(Bool(state,"authenticated")&&SelectedAccount()==Value(state,"accountId"))await BackupRecovery();else{ShowStep(1);status.Text=L.T("登录原部署所属的 Cloudflare 账号后，保存本机部署的恢复记录。");}});
      Heading(p,"连接 Obsidian");importButton=Action(p,"导入 Obsidian",async()=>{await Run("obsidian.import",null);status.Text=L.T("已打开所选知识库，正在导入连接设置。");});
      Primary(importButton);Hint(p,"请保持 Obsidian 打开，稍后点击“检查导入结果”。");
      verifyImportButton=Action(p,"检查导入结果",async()=>{var result=await Run("obsidian.verify",null);importResult.Text=Bool(result,"imported")?L.T("连接设置已导入。\n")+(Value(result,"lastSyncAt","0")!="0"?L.T("插件已有同步记录。"):L.T("请在 Obsidian 点击云上传图标完成首次同步。")):L.T("尚未检测到这次导入。请确认所选知识库已打开、AI Bridge 已启用，再点击“导入 Obsidian”。");if(Value(result,"syncError")!="")importResult.Text+=L.T("\n同步错误：")+Value(result,"syncError");});Result(p,importResult);
      p.Children.Add(credentialSection);var maintenance=new StackPanel();Hint(maintenance,"只有需要更新镜像程序时才使用此项。连接 Obsidian 或 AI 不需要重新部署。");
      Action(maintenance,"更新现有部署",async()=>{if(!Bool(state,"authenticated")||SelectedAccount()!=Value(state,"accountId")){ShowStep(1);status.Text=L.T("登录原部署所属的 Cloudflare 账号，再返回此处更新。");return;}var input=Options();input["label"]=Value(state,"label");input["workersSubdomain"]=Value(state,"workersSubdomain");input["accountId"]=Value(state,"accountId");await Run("deploy",input);});
      deploymentMaintenance.Content=maintenance;deploymentMaintenance.Margin=new Thickness(0,24,0,8);Localize(()=>deploymentMaintenance.Header=L.T("更新现有部署（可选）"));p.Children.Add(deploymentMaintenance);
      p=Page(4,"连接你的 AI","按下面的步骤添加连接。登录和授权在你常用的浏览器中完成。");p.Children.Add(Label("选择要接入的 AI"));SetClientChoices(0);aiClient.Margin=new Thickness(0,0,0,20);Localize(()=>AutomationProperties.SetName(aiClient,L.T("选择要接入的 AI")));p.Children.Add(aiClient);
      connectionSteps.Margin=new Thickness(0,0,0,16);p.Children.Add(connectionSteps);
      connectionTitle.FontSize=20;connectionTitle.FontWeight=FontWeights.SemiBold;connectionTitle.TextWrapping=TextWrapping.Wrap;connectionTitle.Margin=new Thickness(0,0,0,10);p.Children.Add(connectionTitle);connectionHint.TextWrapping=TextWrapping.Wrap;connectionHint.SetResourceReference(TextBlock.ForegroundProperty,"Muted");connectionHint.Margin=new Thickness(0,0,0,16);p.Children.Add(connectionHint);p.Children.Add(connectionFields);
      text.Add("mcpUrl",new TextBox{IsReadOnly=true,Margin=new Thickness(0,0,0,16)});text.Add("appName",new TextBox{Text="Context Anywhere",Margin=new Thickness(0,0,0,16)});
      connectionReadKey.SelectedValuePath="Tag";connectionReadKey.Margin=new Thickness(0,0,0,8);
      connectionKeyFields.Children.Add(Label("选择读取密码"));connectionKeyFields.Children.Add(connectionReadKey);
      Localize(()=>AutomationProperties.SetName(connectionReadKey,L.T("选择读取密码")));
      connectionReadKey.SelectionChanged+=(s,e)=>{if(!renderingReadKeys&&SelectedReadKey(connectionReadKey)!=""){connectionKeyChoices[aiClient.SelectedIndex]=SelectedReadKey(connectionReadKey);RefreshEnabled();}};
      Result(connectionKeyFields,connectionKeySyncStatus);
      connectionPrimary.HorizontalAlignment=HorizontalAlignment.Left;connectionPrimary.Margin=new Thickness(0,0,0,10);connectionPrimary.SetResourceReference(Control.BackgroundProperty,"Primary");connectionPrimary.Foreground=Brushes.White;connectionPrimary.Click+=async(s,e)=>{try{await AdvanceConnection();}catch(Exception error){Error(error.Message);}};actions.Add(connectionPrimary);p.Children.Add(connectionPrimary);
      p.Children.Add(connectionKeyActions);
      var refreshKeys=Action(connectionKeyActions,"刷新云端读取密码",RefreshReadKeysFromCloud);refreshKeys.Margin=new Thickness(0,0,8,10);
      var manageKeys=Action(connectionKeyActions,"管理读取密码",()=>{ShowStep(3);credentialSection.IsExpanded=true;credentialSection.BringIntoView();return Task.FromResult(0);});manageKeys.Margin=new Thickness(0,0,8,10);
      connectionBack.Content=L.T("返回上一项");connectionBack.HorizontalAlignment=HorizontalAlignment.Left;connectionBack.Click+=(s,e)=>{if(connectionStep>0)connectionStep=aiClient.SelectedIndex!=0&&connectionStep==3?1:connectionStep-1;RenderConnection();};p.Children.Add(connectionBack);aiClient.SelectionChanged+=(s,e)=>{if(!localizing){connectionStep=0;RebuildReadKeyPickers();RenderConnection();}};
      var extra=new StackPanel();Input(extra,"manual","连接说明","",90).IsReadOnly=true;Action(extra,"复制连接说明",()=>Copy(text["manual"].Text,L.T("连接说明已复制。")));Input(extra,"json","JSON 配置","",110).IsReadOnly=true;Action(extra,"复制 JSON",()=>Copy(text["json"].Text,L.T("JSON 已复制。")));Input(extra,"toml","Codex 配置","",75).IsReadOnly=true;Action(extra,"复制 Codex 配置",()=>Copy(text["toml"].Text,L.T("Codex 配置已复制。")));Action(extra,"保存连接说明（不含密码）",async()=>{var dialog=new SaveFileDialog{Filter=L.T("文本文件|*.txt"),FileName="Context-Anywhere-connection.txt"};if(dialog.ShowDialog(this)==true)await Run("export",Args("path",dialog.FileName));});var extraSection=new Expander{Content=extra,Margin=new Thickness(0,24,0,8)};Localize(()=>extraSection.Header=L.T("更多客户端配置"));p.Children.Add(extraSection);RenderConnection();
    }
    async Task Copy(string value,string message){
      if(String.IsNullOrEmpty(value))throw new Exception(L.T("连接信息尚未准备好，请稍后再试。"));
      if(busy)throw new Exception(L.T("当前操作还在进行，请等待完成。"));
      busy=true;RefreshEnabled();
      try{
        bool copied=false;
        for(int attempt=0;attempt<8;attempt++){
          try{writeClipboard(value);copied=true;break;}
          catch(COMException error){if(error.ErrorCode!=unchecked((int)0x800401D0))throw;}
          if(attempt<7)await Task.Delay(50);
        }
        if(!copied)throw new Exception(L.T("剪贴板正被其他程序占用，请再点一次复制。"));
        status.SetResourceReference(TextBlock.ForegroundProperty,"Accent");status.ToolTip=null;status.Text=message;
      }finally{busy=false;RefreshEnabled();}
    }
    void SetClientChoices(int selected){
      aiClient.Items.Clear();
      aiClient.Items.Add("ChatGPT");
      aiClient.Items.Add("Gemini");
      aiClient.Items.Add(L.T("其他 AI"));
      aiClient.SelectedIndex=selected;
    }
    bool GeminiSelected { get { return object.Equals(aiClient.SelectedItem,"Gemini"); } }
    bool ChoosingConnectionPassword { get { return connectionStep<3&&connectionStep>=(aiClient.SelectedIndex==0?2:1); } }
    async Task AdvanceConnection(){
      if(connectionStep==0){
        await Copy(text["mcpUrl"].Text,L.T("MCP 地址已复制。"));
        string browserAction=GeminiSelected?"gemini.open":aiClient.SelectedIndex==0?"chatgpt.open":null;
        connectionStep=1;RenderConnection();
        // Browser/online checks must not hide the remaining local connection fields.
        if(browserAction!=null)try{await Run(browserAction,null);}catch(Exception error){Error(L.T("地址已复制，后续信息仍可继续复制。")+error.Message);}
      }
      else if(connectionStep==1 && aiClient.SelectedIndex==0){
        await Copy(text["appName"].Text,L.T("名称已复制。"));connectionStep=2;
      }
      else if(connectionStep<3){
        string kind=SelectedReadKey(connectionReadKey);
        await CopySecret(kind);connectionKeyChoices[aiClient.SelectedIndex]=kind;
        connectionStep=3;
      }
      else{connectionStep=0;}RenderConnection();
    }
    void RenderConnection(){
      bool gpt=aiClient.SelectedIndex==0;connectionFields.Children.Clear();connectionBack.Visibility=connectionStep==0?Visibility.Collapsed:Visibility.Visible;
      connectionKeyActions.Visibility=ChoosingConnectionPassword?Visibility.Visible:Visibility.Collapsed;
      connectionSteps.Children.Clear();
      var labels=gpt?new[]{L.T("1 · MCP 地址"),L.T("2 · 名称"),L.T("3 · 授权密码")}:new[]{L.T("1 · MCP 地址"),L.T("2 · 授权密码")};
      for(int i=0;i<labels.Length;i++){
        int selectedStep=i;
        var button=new Button{Content=labels[i],Padding=new Thickness(10,7,10,7),Margin=new Thickness(0,0,8,8)};
        ButtonMotion(button);
        AutomationProperties.SetName(button,labels[i]);
        if(connectionStep==i){button.SetResourceReference(Control.BackgroundProperty,"Primary");button.Foreground=Brushes.White;}
        button.Click+=(s,e)=>{connectionStep=selectedStep;RenderConnection();};connectionSteps.Children.Add(button);
      }
      if(connectionStep==0){
        connectionTitle.Text=L.T("1 · 复制 MCP 地址");
        if(GeminiSelected){
          connectionHint.Text=L.T("在 Gemini 网页版的 Connected Apps 中添加 Custom app，粘贴 MCP 地址并点击 Next。Client ID 和 Client secret 留空。");
          connectionPrimary.Content=L.T("复制 MCP 地址并打开 Gemini");
        }else{
          connectionHint.Text=gpt?L.T("打开 ChatGPT 后，在插件页选择“添加”→“添加自定义 MCP 服务器”，把地址粘贴到服务器 URL 栏。未登录时，先登录你的账号。"):L.T("在 AI 客户端添加远程 MCP，把下方地址粘贴到服务器 URL 栏。");
          connectionPrimary.Content=gpt?L.T("复制 MCP 地址并打开 ChatGPT"):L.T("复制 MCP 地址");
        }
        connectionFields.Children.Add(text["mcpUrl"]);
      }
      else if(connectionStep==1&&gpt){connectionTitle.Text=L.T("2 · 复制名称");connectionHint.Text=L.T("将名称粘贴到创建页面的名称栏。身份验证选择 OAuth，然后点击创建。");connectionFields.Children.Add(text["appName"]);connectionPrimary.Content=L.T("复制名称，下一项");}
      else if(connectionStep<3){
        connectionTitle.Text=(gpt?"3":"2")+L.T(" · 复制授权密码");
        connectionHint.Text=L.T("选一把镜像读取密码，复制后粘贴到 OAuth 授权页。");
        if(gpt)connectionHint.Text+=" "+L.T("如果出现“继续连接”，先点它进入授权页。");
        else if(!GeminiSelected)connectionHint.Text+=" "+L.T("客户端的认证方式选择 OAuth。");
        connectionFields.Children.Add(connectionKeyFields);
        connectionPrimary.Content=L.T("复制授权密码");
      }
      else{connectionTitle.Text=L.T("回到 AI 完成连接");connectionHint.Text=gpt?L.T("在浏览器完成授权和插件安装，然后在聊天中输入 @ 选择插件，试着读取一篇笔记。"):L.T("在客户端完成 OAuth 授权，再尝试读取一篇笔记。");connectionPrimary.Content=L.T("重新复制连接信息");}
      if(step==4){scroll.ScrollToTop();UiMotion.FadeIn(connectionTitle);UiMotion.FadeIn(connectionHint);UiMotion.FadeIn(connectionFields);}
      RefreshEnabled();
    }
    Dictionary<string,object> Options(){
      if(String.IsNullOrWhiteSpace(text["deviceName"].Text)){FocusField(text["deviceName"]);throw new Exception(L.T("请填写设备名称。"));}
      bool all=checks["mirrorAll"].IsChecked==true;
      if(!all&&String.IsNullOrWhiteSpace(text["includePrefixes"].Text)){FocusField(text["includePrefixes"]);throw new Exception(L.T("填写要同步的路径，或选择同步全部笔记。"));}
      var input=Args("deviceName",text["deviceName"].Text,"includePrefixes",all?"":text["includePrefixes"].Text);
      foreach(var pair in checks)input[pair.Key]=pair.Value.IsChecked==true;
      foreach(var pair in ranges){double value;
        string option=pair.Key=="maxAttachmentMiB"?"syncAttachments":pair.Key=="autoSyncIntervalMinutes"?"autoSyncEnabled":"syncOnChange";
        if(checks[option].IsChecked!=true){input[pair.Key]=pair.Key=="maxAttachmentMiB"?8.0:pair.Key=="autoSyncIntervalMinutes"?15.0:1200.0;continue;}
        if(!Double.TryParse(text[pair.Key].Text,NumberStyles.Float,CultureInfo.InvariantCulture,out value)||Double.IsNaN(value)||Double.IsInfinity(value)||value<pair.Value[0]||value>pair.Value[1]||(pair.Key!="maxAttachmentMiB"&&value!=Math.Truncate(value))){
          FocusField(text[pair.Key]);throw new Exception(L.T("请填写有效的数值：")+AutomationProperties.GetName(text[pair.Key])+" ("+pair.Value[0]+"–"+pair.Value[1]+")");
        }input[pair.Key]=value;
      }return input;
    }
    string SelectedAccount(){return accounts.SelectedIndex>=0&&accounts.SelectedIndex<accountList.Count?Value(accountList[accounts.SelectedIndex],"id"):"";}
    void Update(Dictionary<string,object> latest){
      if(latest==null)return;
      bool wasAuthenticated=Bool(state,"authenticated"),couldManage=CanManageReadKeys();
      bool changedDeployment=Value(state,"workerUrl")!=Value(latest,"workerUrl");
      if(changedDeployment){connectionKeyChoices.Clear();keyRefreshFailed=false;managedReadKey.SelectedIndex=-1;}
      var selected=SelectedAccount();state=latest;
      if(!Bool(state,"authenticated")||!wasAuthenticated){discoveryAttempt="";recoveryError="";}
      if(selected=="")selected=Value(state,"accountId");
      updatingAccounts=true;
      try{
        accounts.Items.Clear();accountList.Clear();object raw;
        if(state.TryGetValue("accounts",out raw)&&raw is IEnumerable)foreach(var item in (IEnumerable)raw){var account=item as Dictionary<string,object>;if(account!=null){accountList.Add(account);accounts.Items.Add(Value(account,"name"));}}
        for(int i=0;i<accountList.Count;i++)if(Value(accountList[i],"id")==selected)accounts.SelectedIndex=i;
        if(accounts.SelectedIndex<0&&accountList.Count==1)accounts.SelectedIndex=0;
      }finally{updatingAccounts=false;}
      if(Bool(state,"deployed"))deployResult.Text=DeploymentSummary();
      checks["replaceMissingVault"].Visibility=Bool(state,"missingVault")?Visibility.Visible:Visibility.Collapsed;
      RenderVaultShortcut();
      selectLocalVault.Visibility=Bool(state,"deployed")&&(Object(state,"settings")==null||Bool(state,"missingVault"))?Visibility.Visible:Visibility.Collapsed;
      RebuildReadKeyPickers();RenderRecovery();
      if(step>=3&&(changedDeployment||!couldManage&&CanManageReadKeys()))keyRefreshRequested=true;
      RefreshEnabled();
    }
    void RenderVaultShortcut(){string label=L.T(Bool(state,"deployed")?"查看部署和凭据":"从 Cloudflare 找回已有部署");((TextBlock)cloudRecovery.Content).Text=label;AutomationProperties.SetName(cloudRecovery,label);}
    bool CanContinueAccount(){
      if(Bool(state,"deployed"))return true;
      return Bool(state,"authenticated")&&SelectedAccount()!=""&&Bool(state,"recoveryChecked")&&Value(state,"recoveryAccountId")==SelectedAccount()&&(Value(state,"recoveryChoice")=="new"||(Object(state,"names")!=null&&SelectedAccount()==Value(state,"accountId")));
    }
    void RefreshEnabled(){
      bool enabled=ready&&!busy;language.IsEnabled=enabled;foreach(var control in actions)control.IsEnabled=enabled;
      bool retry=startBackend&&started&&!ready&&!initializing;retryBackend.Visibility=retry?Visibility.Visible:Visibility.Collapsed;retryBackend.IsEnabled=retry&&!busy;back.Visibility=retry?Visibility.Hidden:Visibility.Visible;
      // Keep scrolling available during a request; lock only editable controls and actions.
      foreach(var control in text.Values)control.IsEnabled=enabled;foreach(var control in checks.Values)control.IsEnabled=enabled;
      scopeCustom.IsEnabled=scopeAll.IsEnabled=enabled;
      accounts.IsEnabled=deployments.IsEnabled=aiClient.IsEnabled=enabled;connectionBack.IsEnabled=enabled;foreach(Button button in connectionSteps.Children)button.IsEnabled=enabled;
      for(int i=0;i<stepButtons.Count;i++)stepButtons[i].IsEnabled=enabled&&i<=step;
      back.IsEnabled=enabled&&step>0;next.IsEnabled=enabled&&(step!=1||CanContinueAccount())&&(step!=3||Bool(state,"deployed"));
      if(deployButton!=null)deployButton.IsEnabled=enabled&&!Bool(state,"deployed");
      if(importButton!=null)importButton.IsEnabled=enabled&&Bool(state,"deployed")&&Object(state,"settings")!=null&&!Bool(state,"missingVault");
      if(verifyImportButton!=null)verifyImportButton.IsEnabled=importButton.IsEnabled;
      cfToken.IsEnabled=enabled&&!Bool(state,"authenticated");if(tokenButton!=null)tokenButton.IsEnabled=cfToken.IsEnabled;tokenArea.Opacity=Bool(state,"authenticated")?0.55:1;
      tokenSection.Visibility=Bool(state,"authenticated")?Visibility.Collapsed:Visibility.Visible;
      authResult.Text=Bool(state,"authenticated")?L.T("Cloudflare 已连接。选择账号后会自动查找部署。"):Value(state,"loginError",L.T("完成浏览器授权后，这里会自动更新连接结果。"));
      if(restoreDeployment!=null)restoreDeployment.IsEnabled=enabled&&SelectedRecovery()!="";
      if(backupDeployment!=null)backupDeployment.IsEnabled=enabled&&Bool(state,"authenticated")&&SelectedAccount()==Value(state,"accountId");
      if(refreshRecovery!=null)refreshRecovery.IsEnabled=enabled&&Bool(state,"authenticated")&&SelectedAccount()!="";
      if(attachDeployment!=null)attachDeployment.IsEnabled=enabled&&Bool(state,"authenticated")&&SelectedAccount()!="";
      attachWrite.IsEnabled=enabled;
      if(copyReadKey!=null){
        string pending=Value(state,"pendingKeyUpdate"),managed=SelectedReadKey(managedReadKey);
        bool hasSelection=managed!="",canChange=enabled&&pending=="";
        managedReadKey.IsEnabled=connectionReadKey.IsEnabled=enabled;
        importedReadKey.IsEnabled=importReadKey.IsEnabled=renameReadKey.IsEnabled=rotateReadKey.IsEnabled=deleteReadKey.IsEnabled=canChange&&hasSelection;
        addReadKey.IsEnabled=canChange;resumeReadKey.IsEnabled=enabled&&pending!="";
        copyReadKey.IsEnabled=enabled&&hasSelection&&managed!=pending;
        if(ChoosingConnectionPassword){string chosen=SelectedReadKey(connectionReadKey);connectionPrimary.IsEnabled=enabled&&chosen!=""&&chosen!=pending;}
      }
      Activity(busy||initializing);QueueDiscovery();QueueReadKeyRefresh();
    }
    void Restore(){
      text["label"].Text=Value(state,"label","context-anywhere");text["workersSubdomain"].Text=Value(state,"workersSubdomain");text["appName"].Text="Context Anywhere "+Value(state,"id");
      var vault=Object(state,"vault");if(vault!=null){text["vault"].Text=Value(vault,"path");text["configDir"].Text=Value(vault,"configDir",".obsidian");}
      var settings=Object(state,"settings");
      if(settings!=null){
        text["deviceName"].Text=Value(settings,"deviceName","Windows");object prefixes;
        if(settings.TryGetValue("includePrefixes",out prefixes)&&prefixes is IEnumerable&&!(prefixes is string)){var values=new List<string>();foreach(var item in (IEnumerable)prefixes)values.Add(Convert.ToString(item));text["includePrefixes"].Text=String.Join(Environment.NewLine,values);checks["mirrorAll"].IsChecked=values.Count==0;}
        foreach(var pair in checks)if(settings.ContainsKey(pair.Key))pair.Value.IsChecked=Bool(settings,pair.Key);
        foreach(var pair in ranges)if(settings.ContainsKey(pair.Key))text[pair.Key].Text=Convert.ToDouble(settings[pair.Key]).ToString(CultureInfo.InvariantCulture);
      }
      if(Bool(state,"deployed")){
        checks["cfAccountConfirmed"].IsChecked=true;checks["pluginConfirmed"].IsChecked=true;
        ShowStep(Bool(state,"missingVault")?0:settings!=null||vault==null?3:2);
        deployResult.Text=DeploymentSummary();
      }
    }
    void ShowStep(int value){
      if(value<0||value>=pages.Length||busy)return;int previous=step;bool changed=scroll.Content!=pages[value];if(scroll.Content!=null)scrollOffsets[step.ToString()]=scroll.VerticalOffset;step=value;scroll.Content=pages[step];double saved;scroll.ScrollToVerticalOffset(scrollOffsets.TryGetValue(step.ToString(),out saved)?saved:0);
      if(changed){status.Text="";status.ToolTip=null;status.SetResourceReference(TextBlock.ForegroundProperty,"Muted");}
      if(changed)AnimatePage(pages[step],step-previous);
      stepLabel.Text=L.T("步骤 ")+(step+1)+" / 5";
      for(int i=0;i<stepLabels.Count;i++){
        stepLabels[i].SetResourceReference(TextBlock.ForegroundProperty,i==step?"Accent":"Muted");stepLabels[i].FontWeight=FontWeights.Normal;stepButtons[i].SetResourceReference(Control.BackgroundProperty,i==step?"Selected":"Side");
        stepBadges[i].SetResourceReference(Border.BackgroundProperty,i==step?"Primary":"Field");var badge=(TextBlock)stepBadges[i].Child;badge.Text=(i+1).ToString();if(i==step)badge.Foreground=Brushes.White;else badge.SetResourceReference(TextBlock.ForegroundProperty,"Muted");
      }
      next.Content=L.T(step==0?"检查并继续":step==2?"确认同步范围":step==3?"接入 AI":step==4?"完成并关闭":"下一步");
      if(step==3&&!Bool(state,"deployed"))deployResult.Text=L.T("知识库：")+text["vault"].Text+L.T("\n部署名称：")+text["label"].Text+"-"+Value(state,"id");
      RenderRecovery();RefreshEnabled();
      if(changed&&step>=3)RequestReadKeyRefresh();
    }
    async Task Navigate(){try{
      if(step==0){
        if(String.IsNullOrWhiteSpace(text["vault"].Text)){FocusField(text["vault"]);throw new Exception(L.T("请选择知识库文件夹。"));}
        if(checks["cfAccountConfirmed"].IsChecked!=true){FocusField(checks["cfAccountConfirmed"]);throw new Exception(L.T("请确认 Cloudflare 账号已启用 R2。"));}
        var inspected=await Run("vault.inspect",Args("path",text["vault"].Text.Trim(),"configDir",text["configDir"].Text.Trim(),"replaceMissingVault",checks["replaceMissingVault"].IsChecked==true));recoveryFirst=false;
        checks["pluginConfirmed"].IsChecked=Bool(inspected,"enabled")&&Bool(inspected,"localImportSupported");
        if(!Bool(inspected,"localImportSupported"))throw new Exception(L.T("请更新 AI Bridge，重新打开 Obsidian 后再检查。"));
        if(!Bool(inspected,"enabled"))throw new Exception(L.T("请在这个知识库中启用 AI Bridge，然后重新检查。"));
        vaultResult.Text=Value(inspected,"name")+" · AI Bridge "+Value(inspected,"version")+" · "+L.T("插件已就绪，可以继续。");
        if(Bool(state,"deployed")){ShowStep(2);return;}
      }
      if(step==1){
        if(Bool(state,"deployed")){ShowStep(Object(state,"settings")!=null||Object(state,"vault")==null||Bool(state,"missingVault")?3:2);return;}
        if(!Bool(state,"authenticated")||SelectedAccount()=="")throw new Exception(L.T("请连接 Cloudflare 并选择账号。"));
        if(!CanContinueAccount())throw new Exception(L.T("请等待查找完成，再选择恢复已有部署或创建全新镜像。"));
        if(Object(state,"vault")==null){ShowStep(0);status.Text=L.T("请选择要接入的知识库。");return;}
      }
      if(step==2){var input=Options();await Run("preview",input);if(Bool(state,"deployed"))await Run("recovery.configure",input);}
      if(step==3){
        if(!Bool(state,"deployed"))throw new Exception(L.T("请先完成部署。"));
        var manual=await Run("manual",Args("includePassword",false));
        text["mcpUrl"].Text=Value(manual,"url");
        foreach(var key in new[]{"manual","json","toml"})text[key].Text=Value(manual,key=="manual"?"text":key);
        connectionStep=0;ShowStep(4);RenderConnection();return;
      }
      if(step==4){await Run("close",null);Close();return;}
      ShowStep(step+1);
    }catch(Exception error){Error(error.Message);}}
    void Error(string message){status.SetResourceReference(TextBlock.ForegroundProperty,"ErrorInk");status.Text=message;status.ToolTip=message;}
    async Task<Dictionary<string,object>> Run(string action,Dictionary<string,object> input){if(!ready||send==null)throw new Exception(L.T("向导正在准备，请稍后再试。"));if(busy)throw new Exception(L.T("当前操作还在进行，请等待完成。"));busy=true;RefreshEnabled();status.SetResourceReference(TextBlock.ForegroundProperty,"Muted");status.ToolTip=null;status.Text=L.T("正在处理…");try{var message=await send(action,input??Args());Update(Object(message,"state"));if(message.ContainsKey("error"))throw new Exception(Value(message,"error"));status.Text=L.T("操作完成。");return Object(message,"result")??Args();}finally{busy=false;RefreshEnabled();}}
  }
}
