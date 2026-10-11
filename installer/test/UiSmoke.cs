using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using ContextAnywhereSetup;
class UiSmoke {
 static readonly BindingFlags Flags=BindingFlags.NonPublic|BindingFlags.Instance;
 static T Get<T>(object obj,string key){return (T)obj.GetType().GetField(key,Flags).GetValue(obj);}
 static void Set(object obj,string key,object value){obj.GetType().GetField(key,Flags).SetValue(obj,value);}
 static object Call(object obj,string method,params object[] args){return obj.GetType().GetMethod(method,Flags).Invoke(obj,args);}
 static void Check(bool yes,string message){if(!yes)throw new Exception(message);}
 static string Output=Environment.GetEnvironmentVariable("CA_UI_OUTPUT")??Path.Combine(Path.GetTempPath(),"ca-ui-test");
 static async Task Frame(Window w){w.UpdateLayout();await w.Dispatcher.InvokeAsync(()=>{},DispatcherPriority.ApplicationIdle);}
 static IDataObject SnapshotClipboard(){
  var source=Clipboard.GetDataObject();if(source==null)return null;
  var snapshot=new DataObject();
  foreach(var format in new[]{DataFormats.UnicodeText,DataFormats.Text,DataFormats.Rtf,DataFormats.Html,DataFormats.FileDrop,DataFormats.Bitmap}){
   try{
    if(!source.GetDataPresent(format,false))continue;
    var value=source.GetData(format,false);var bitmap=value as BitmapSource;
    if(bitmap!=null){bitmap=bitmap.Clone();bitmap.Freeze();value=bitmap;}
    if(value!=null)snapshot.SetData(format,value,false);
   }catch(System.Runtime.InteropServices.COMException){}
  }
  return snapshot.GetFormats(false).Length==0?null:snapshot;
 }
 static void RestoreClipboard(IDataObject original){
  if(original==null)return;
  for(int attempt=0;attempt<6;attempt++){
   try{Clipboard.SetDataObject(original,true);return;}
   catch(System.Runtime.InteropServices.COMException error){if(error.ErrorCode!=unchecked((int)0x800401D0)||attempt==5)throw;}
   System.Threading.Thread.Sleep(100);
  }
 }
 static void Capture(SetupWindow w,string name,double scale=1){
  var root=(FrameworkElement)w.Content;
  var bitmap=new RenderTargetBitmap((int)Math.Ceiling(root.ActualWidth*scale),(int)Math.Ceiling(root.ActualHeight*scale),96*scale,96*scale,PixelFormats.Pbgra32);
  bitmap.Render(root);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));
  using(var file=File.Create(Path.Combine(Output,name+".png")))encoder.Save(file);
  var pixels=new byte[bitmap.PixelWidth*bitmap.PixelHeight*4];bitmap.CopyPixels(pixels,bitmap.PixelWidth*4,0);
  // WPF's antialiasing can round a composed opaque edge down to alpha 254.
  for(int i=3;i<pixels.Length;i+=4)Check(pixels[i]>=254,"Transparent startup pixel: "+name);
 }
 [STAThread]static void Main(){
  Directory.CreateDirectory(Output);var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};
  app.Startup+=async(s,e)=>{try{
   var w=new SetupWindow(false);w.Show();await Frame(w);
   Check(w.Width<=SystemParameters.WorkArea.Width&&w.Height<=SystemParameters.WorkArea.Height,"Startup exceeds work area");
   var dpiScale=PresentationSource.FromVisual(w).CompositionTarget.TransformToDevice.M11;
   Get<ComboBox>(w,"theme").SelectedIndex=1;await Frame(w);Capture(w,"light-startup");
   Check(((SolidColorBrush)Get<TextBlock>(w,"logo").Foreground).Color==Color.FromRgb(23,107,145),"Light logo color");
   var cases=new[]{new Size(1040,800),new Size(1040,400),new Size(900,512),new Size(640,420),new Size(480,360)};int pagesChecked=0;
   foreach(var size in cases){w.Width=size.Width;w.Height=size.Height;await Frame(w);for(int step=0;step<5;step++){
    Call(w,"ShowStep",step);await Frame(w);var root=(FrameworkElement)w.Content;var scroll=Get<ScrollViewer>(w,"scroll");
    Check(scroll.ExtentWidth<=scroll.ViewportWidth+1,"Horizontal overflow at "+size+" page "+step+": "+scroll.ExtentWidth+" / "+scroll.ViewportWidth);
    var next=Get<Button>(w,"next");var point=next.TranslatePoint(new Point(0,0),root);
    Check(point.X>=0&&point.Y>=0&&point.X+next.ActualWidth<=root.ActualWidth+1&&point.Y+next.ActualHeight<=root.ActualHeight+1,"Navigation off-screen");
    Check(scroll.ActualHeight>=75,"No useful page height");pagesChecked++;
   }}
   Get<ComboBox>(w,"theme").SelectedIndex=2;Call(w,"ShowStep",0);await Frame(w);Capture(w,"small-dark");
   w.Width=1366/1.5;w.Height=768/1.5;await Frame(w);Capture(w,"1366x768-at-150-percent",1.5);
   w.Width=1280/2;w.Height=720/2;await Frame(w);Capture(w,"1280x720-at-200-percent",2);
   w.Width=1040;w.Height=800;Call(w,"ShowStep",4);await Frame(w);
   Check(Get<ComboBox>(w,"aiClient").SelectedIndex==0,"ChatGPT default");
   Check(Get<Button>(w,"connectionPrimary").Content.ToString().Contains("打开 ChatGPT"),"Default copy/open action");
   var fields=Get<Dictionary<string,TextBox>>(w,"text");fields["mcpUrl"].Text="https://fixture.workers.dev/mcp";fields["appName"].Text="Fixture Notes";Set(w,"password","fixture-read-password");
   await Frame(w);Capture(w,"chatgpt-step-one");
   var primary=Get<Button>(w,"connectionPrimary");primary.ApplyTemplate();
   Check(((Border)primary.Template.FindName("box",primary)).CornerRadius.TopLeft==8,"Rounded button missing");
   fields["mcpUrl"].ApplyTemplate();Check(((Border)fields["mcpUrl"].Template.FindName("box",fields["mcpUrl"])).CornerRadius.TopLeft==8,"Rounded input missing");
   foreach(var item in Get<StackPanel[]>(w,"pages")[4].Children)if(item is Expander){((Expander)item).IsExpanded=true;await Frame(w);Check(fields["json"].IsVisible,"Extra config unavailable");((Expander)item).IsExpanded=false;}
   fields["includePrefixes"].Text="Inbox\nProjects";
   var options=(Dictionary<string,object>)Call(w,"Options");Check((string)options["includePrefixes"]=="Inbox\nProjects"&&(double)options["maxAttachmentMiB"]==8&&(bool)options["syncOnChange"],"Sync settings changed in UI");
   var original=SnapshotClipboard();
   try {
    // The password entry must be visible and reachable before opening a browser.
    var navigation=Get<WrapPanel>(w,"connectionSteps");
    Check(navigation.Children.Count==3&&((Button)navigation.Children[2]).Content.ToString().Contains("授权密码"),"Password navigation missing on the first step");
    // This window deliberately has no RPC backend: a failed browser-open must not trap the flow.
    await(Task)Call(w,"AdvanceConnection");
    Check(Get<int>(w,"connectionStep")==1&&Clipboard.GetText()==fields["mcpUrl"].Text,"Browser failure trapped the address step");
    Check(Get<TextBlock>(w,"status").Text.Contains("后续信息仍可继续复制"),"Browser failure guidance missing");
    navigation=Get<WrapPanel>(w,"connectionSteps");
    ((Button)navigation.Children[2]).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    await Frame(w);Check(Get<PasswordBox>(w,"readPassword").IsVisible,"Password field not reachable after browser failure");
    Capture(w,"password-after-browser-failure");
    await(Task)Call(w,"AdvanceConnection");Check(Clipboard.GetText()=="fixture-read-password","Password copy after browser failure");
    Get<ComboBox>(w,"aiClient").SelectedIndex=1;Check(Get<Button>(w,"connectionPrimary").Content.ToString()=="复制 MCP 地址","Other AI label");
    Check(Get<WrapPanel>(w,"connectionSteps").Children.Count==2,"Other AI password navigation missing");
    await(Task)Call(w,"AdvanceConnection");Check(Clipboard.GetText()==fields["mcpUrl"].Text,"Other AI address copy");
    await(Task)Call(w,"AdvanceConnection");Check(Clipboard.GetText()=="fixture-read-password","Other AI password copy");
    Get<ComboBox>(w,"aiClient").SelectedIndex=0;Set(w,"connectionStep",1);Call(w,"RenderConnection");
    await(Task)Call(w,"AdvanceConnection");Check(Clipboard.GetText()=="Fixture Notes","ChatGPT name copy");
    await(Task)Call(w,"AdvanceConnection");Check(Clipboard.GetText()=="fixture-read-password","ChatGPT password copy");
   } finally {RestoreClipboard(original);}
   Check(Get<TextBlock>(w,"connectionTitle").Text=="回到 AI 完成连接","No false connected claim");
   Call(w,"ShowStep",1);var state=new Dictionary<string,object>{{"authenticated",true},{"accounts",new object[]{new Dictionary<string,object>{{"id","test"},{"name","Test Account"}}}}};
   Call(w,"Update",state);Check(!Get<PasswordBox>(w,"cfToken").IsEnabled&&!Get<Button>(w,"tokenButton").IsEnabled,"Token disabled after OAuth");
   var timer=Stopwatch.StartNew();for(int i=0;i<80;i++){w.Width=600+i*4;w.Height=500+(i%15);w.UpdateLayout();}timer.Stop();
   Check(timer.ElapsedMilliseconds<4000,"Resize layout stalls: "+timer.ElapsedMilliseconds);w.Close();
   // Exercise the real backend after the first fully rendered frame, using an isolated receipt directory.
   var live=new SetupWindow();live.Show();await Frame(live);Capture(live,"real-startup-first-frame");
   for(int i=0;i<100&&!Get<bool>(live,"ready");i++)await Task.Delay(100);
   Check(Get<bool>(live,"ready"),"Real backend failed: "+Get<TextBlock>(live,"status").Text);await Frame(live);Capture(live,"real-startup-ready");live.Close();
   File.WriteAllText(Path.Combine(Output,"ui-result.json"),"{\"passed\":true,\"viewportPageChecks\":"+pagesChecked+",\"resizeCycles\":80,\"resizeMilliseconds\":"+timer.ElapsedMilliseconds+",\"nativeDpiScale\":"+dpiScale.ToString(System.Globalization.CultureInfo.InvariantCulture)+",\"opaqueFirstFrame\":true,\"realBackendReady\":true,\"copyFlow\":true,\"lightLogo\":true}");app.Shutdown(0);
  }catch(Exception error){File.WriteAllText(Path.Combine(Output,"ui-error.txt"),error.ToString());app.Shutdown(1);}};
  app.Run();
 }
}
