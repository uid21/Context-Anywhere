using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Input;
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
 static async Task<string> ReadClipboardText(){
  for(int attempt=0;;attempt++){
   try{return Clipboard.GetText();}
   catch(System.Runtime.InteropServices.COMException error){if(error.ErrorCode!=unchecked((int)0x800401D0)||attempt>=9)throw;}
   await Task.Delay(50);
  }
 }
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
 static async Task RestoreClipboard(IDataObject original){
  if(original==null)return;
  for(int attempt=0;attempt<20;attempt++){
   try{Clipboard.SetDataObject(original,true);return;}
   catch(System.Runtime.InteropServices.COMException error){if(error.ErrorCode!=unchecked((int)0x800401D0)||attempt==19)throw;}
   // Yield the STA dispatcher so clipboard owners can finish delayed rendering.
   await Task.Delay(100);
  }
 }
 static void Capture(SetupWindow w,string name,double scale=1){
  var root=(FrameworkElement)w.Content;
  var bitmap=new RenderTargetBitmap((int)Math.Ceiling(root.ActualWidth*scale),(int)Math.Ceiling(root.ActualHeight*scale),96*scale,96*scale,PixelFormats.Pbgra32);
  bitmap.Render(root);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));
  using(var file=File.Create(Path.Combine(Output,L.Language+"-"+name+".png")))encoder.Save(file);
  var pixels=new byte[bitmap.PixelWidth*bitmap.PixelHeight*4];bitmap.CopyPixels(pixels,bitmap.PixelWidth*4,0);
  // WPF's antialiasing can round a composed opaque edge down to alpha 254.
  for(int i=3;i<pixels.Length;i+=4)Check(pixels[i]>=254,"Transparent startup pixel: "+name);
 }
 static void CheckEnglish(DependencyObject node){
  var label=node as TextBlock;
  if(label!=null&&label.IsVisible&&label.Text!="简体中文")Check(!Regex.IsMatch(label.Text,"[\u3400-\u9fff]"),"Untranslated English UI: "+label.Text);
  for(int i=0;i<VisualTreeHelper.GetChildrenCount(node);i++)CheckEnglish(VisualTreeHelper.GetChild(node,i));
 }
 static Dictionary<string,object> Data(params object[] values){var result=new Dictionary<string,object>();for(int i=0;i<values.Length;i+=2)result.Add((string)values[i],values[i+1]);return result;}
 static async Task RecoveryFlows(){
  var w=new SetupWindow(false);w.Show();await Frame(w);Call(w,"ShowStep",1);
  var fields=Get<Dictionary<string,TextBox>>(w,"text");fields["deviceName"].Text="This laptop";fields["includePrefixes"].Text="New device notes";
  var calls=new List<string>();bool failDiscovery=false,failBackup=false;
  var accountData=new object[]{Data("id","account-a","name","My account"),Data("id","account-b","name","Second account"),Data("id","account-empty","name","New account")};
  var fixture=Data("authenticated",true,"accounts",accountData,"accountId","account-a","id","fixture","vault",Data("path",Path.GetTempPath(),"configDir",".obsidian","enabled",true,"localImportSupported",true));
  var recordA=Data("key","deployment-a","label","My notes","workerUrl","https://notes-a.workers.dev","updatedAt","2026-11-05T00:00:00Z");
  var recordB=Data("key","deployment-b","label","Project notes","workerUrl","https://notes-b.workers.dev","updatedAt","2026-11-04T00:00:00Z");
  Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>> send=(action,input)=>{
   calls.Add(action);var result=Data();var response=Data();
   if(action=="recovery.list"){
    var account=(string)input["accountId"];fixture["recoveryAccountId"]=account;fixture["recoveryChecked"]=!failDiscovery;
    fixture["recoveries"]=failDiscovery||account=="account-empty"?new object[0]:account=="account-a"?new object[]{recordA}:new object[]{recordA,recordB};
    fixture["recoveryChoice"]=account=="account-empty"?"new":"";
    if(failDiscovery)response["error"]="Temporary account lookup issue";
   }else if(action=="recovery.new"){fixture["recoveryChoice"]="new";}
   else if(action=="recovery.restore"){
    Check((string)input["key"]=="deployment-a","Recovery sent the wrong selected deployment");
    fixture["accountId"]=input["accountId"];fixture["deployed"]=true;fixture["recovered"]=true;fixture["recoverySaved"]=true;fixture["recoveryChoice"]="restore";fixture["workerUrl"]="https://notes-a.workers.dev";fixture.Remove("settings");
   }else if(action=="preview"){result["notes"]=1;}
   else if(action=="recovery.configure"){
    Check((string)input["deviceName"]=="This laptop"&&(string)input["includePrefixes"]=="New device notes"&&(bool)input["pluginConfirmed"],"Recovery lost this device's scope or plugin confirmation");
    fixture["settings"]=Data("deviceName",input["deviceName"],"includePrefixes",new object[]{"New device notes"});
   }else if(action=="secret.get"){result["value"]=(string)input["kind"]=="write"?"fixture-upload-secret":"fixture-read-secret";}
   else if(action=="recovery.backup"){
    fixture["recoverySaved"]=!failBackup;fixture["recoveryWarning"]=failBackup?"Temporary recovery save issue":"";
    result["saved"]=!failBackup;result["warning"]=fixture["recoveryWarning"];
   }else throw new Exception("Unexpected recovery UI command: "+action);
   response["state"]=new Dictionary<string,object>(fixture);response["result"]=result;
   return Task.FromResult(response);
  };
  Set(w,"send",send);Call(w,"Update",new Dictionary<string,object>(fixture));await Frame(w);
  Check(calls.FindAll(x=>x=="recovery.list").Count==1,"Login did not discover exactly once");
  Check(Get<ComboBox>(w,"deployments").SelectedIndex==0&&Get<Button>(w,"restoreDeployment").IsEnabled,"Single deployment was not selected");
  Check(!Get<Button>(w,"next").IsEnabled&&Get<int>(w,"step")==1,"Existing deployment was silently selected as new");
  Call(w,"Update",new Dictionary<string,object>(fixture));await Frame(w);
  Check(calls.FindAll(x=>x=="recovery.list").Count==1,"Unchanged state repeated discovery");
  await Task.Delay(220);Capture(w,"recovery-found");if(L.Language=="en")CheckEnglish((DependencyObject)w.Content);
  Get<Button>(w,"newDeployment").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));await Frame(w);
  Check(Get<int>(w,"step")==2&&calls.Contains("recovery.new"),"Explicit new-deployment choice did not advance");
  Call(w,"ShowStep",1);Get<ComboBox>(w,"accounts").SelectedIndex=1;await Frame(w);
  Check(Get<ComboBox>(w,"deployments").Items.Count==2&&Get<ComboBox>(w,"deployments").SelectedIndex==-1&&!Get<Button>(w,"restoreDeployment").IsEnabled,"Multiple deployments require a deliberate selection");
  Get<ComboBox>(w,"deployments").SelectedIndex=1;Call(w,"Update",new Dictionary<string,object>(fixture));
  int languageIndex=Get<ComboBox>(w,"language").SelectedIndex;Get<ComboBox>(w,"language").SelectedIndex=1-languageIndex;await Frame(w);
  Check(Get<ComboBox>(w,"deployments").SelectedIndex==1&&Get<ComboBox>(w,"accounts").SelectedIndex==1&&fields["includePrefixes"].Text=="New device notes","Language change lost recovery selection or local scope");
  if(L.Language=="en")CheckEnglish((DependencyObject)w.Content);Get<ComboBox>(w,"language").SelectedIndex=languageIndex;await Frame(w);
  failDiscovery=true;Get<ComboBox>(w,"accounts").SelectedIndex=0;await Frame(w);
  Check(!Get<Button>(w,"next").IsEnabled&&Get<Button>(w,"refreshRecovery").IsEnabled&&fields["includePrefixes"].Text=="New device notes","Lookup failure lost inputs or retry");
  int failedCalls=calls.Count;Call(w,"RefreshEnabled");await Frame(w);Check(calls.Count==failedCalls,"Failed lookup retried in a loop");
  Get<ComboBox>(w,"language").SelectedIndex=1-languageIndex;await Frame(w);
  Check(Get<TextBlock>(w,"recoveryResult").Text==L.T("查找尚未完成，可以点击“重新查找”再试。"),"Language change made a stopped lookup appear busy");
  Get<ComboBox>(w,"language").SelectedIndex=languageIndex;await Frame(w);
  failDiscovery=false;await(Task)Call(w,"DiscoverRecoveries",true);await Frame(w);
  Get<Button>(w,"restoreDeployment").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));await Frame(w);
  Check(Get<int>(w,"step")==2&&fields["includePrefixes"].Text=="New device notes","Restore did not keep the new device scope");
  Check(Get<StackPanel>(w,"deploymentFields").Visibility==Visibility.Collapsed&&Get<StackPanel>(w,"deploymentActions").Visibility==Visibility.Collapsed&&Get<Expander>(w,"deploymentMaintenance").Visibility==Visibility.Collapsed,"Recovered flow still offers deployment");
  await(Task)Call(w,"Navigate");Check(Get<int>(w,"step")==3&&calls.Contains("recovery.configure")&&!calls.Contains("deploy"),"Restored scope did not save without redeploying");
  await Task.Delay(220);Capture(w,"recovery-import");if(L.Language=="en")CheckEnglish((DependencyObject)w.Content);
  var original=SnapshotClipboard();Exception copyFailure=null;
  try{
   await(Task)Call(w,"CopySecret","write");Check((await ReadClipboardText())=="fixture-upload-secret","Upload credential was not copied");
   await(Task)Call(w,"CopySecret","read");Check((await ReadClipboardText())=="fixture-read-secret","Read password was not copied");
   Check(!Get<TextBlock>(w,"status").Text.Contains("fixture-")&&!Get<TextBlock>(w,"deployResult").Text.Contains("fixture-"),"Copy action displayed a secret");
  }catch(Exception error){copyFailure=error;}
  await RestoreClipboard(original);if(copyFailure!=null)throw copyFailure;
  fixture["authenticated"]=false;fixture["accounts"]=new object[0];Call(w,"Update",new Dictionary<string,object>(fixture));Call(w,"Restore");
  Check(Get<int>(w,"step")==3&&Get<Button>(w,"next").IsEnabled,"Saved recovery required a fresh login");
  fixture["recovered"]=false;fixture["recoverySaved"]=false;Call(w,"Update",new Dictionary<string,object>(fixture));Call(w,"Restore");
  Check(Get<int>(w,"step")==3&&Get<Button>(w,"backupShortcut").Visibility==Visibility.Visible&&Get<Expander>(w,"deploymentMaintenance").Visibility==Visibility.Visible,"Legacy local deployment lost import or backup path");
  Call(w,"ShowStep",2);await(Task)Call(w,"Navigate");Check(Get<int>(w,"step")==3,"Local scope required Cloudflare sign-in");
  fixture["authenticated"]=true;fixture["accounts"]=accountData;Call(w,"Update",new Dictionary<string,object>(fixture));await Frame(w);
  failBackup=true;await(Task)Call(w,"BackupRecovery");
  Check(Get<int>(w,"step")==3&&Get<Button>(w,"next").IsEnabled&&Get<Button>(w,"backupShortcut").Visibility==Visibility.Visible&&Get<StackPanel>(w,"credentialActions").Visibility==Visibility.Visible,"Backup warning blocked a healthy mirror");
  await Task.Delay(220);Capture(w,"recovery-save-retry");if(L.Language=="en")CheckEnglish((DependencyObject)w.Content);
  failBackup=false;await(Task)Call(w,"BackupRecovery");Check(Get<Button>(w,"backupShortcut").Visibility==Visibility.Collapsed,"Successful backup left a stale retry action");
  fixture.Remove("deployed");fixture.Remove("settings");fixture.Remove("recovered");fixture.Remove("recoverySaved");fixture["accountId"]="account-empty";
  Call(w,"Update",new Dictionary<string,object>(fixture));Call(w,"ShowStep",1);Get<ComboBox>(w,"accounts").SelectedIndex=2;await Frame(w);
  Check(Get<Button>(w,"next").IsEnabled&&Get<Button>(w,"restoreDeployment").Visibility==Visibility.Collapsed,"Empty account did not retain the new-deployment flow");
  await(Task)Call(w,"Navigate");Check(Get<int>(w,"step")==2&&Get<StackPanel>(w,"deploymentFields").Visibility==Visibility.Visible,"Empty account did not open new-deployment settings");
  Check(!calls.Contains("deploy"),"Recovery UI unexpectedly deployed resources");
  Set(w,"busy",true);Call(w,"RefreshEnabled");Check(Get<bool>(w,"activityRunning")&&!Get<Button>(w,"next").IsEnabled,"Busy operation has no visible feedback or input gate");Set(w,"busy",false);Call(w,"RefreshEnabled");
  w.Close();
 }
 static async Task UsabilityFlows(){
  var w=new SetupWindow(false);w.Show();await Frame(w);Get<ComboBox>(w,"theme").SelectedIndex=1;
  var fields=Get<Dictionary<string,TextBox>>(w,"text");var checks=Get<Dictionary<string,CheckBox>>(w,"checks");
  await(Task)Call(w,"Navigate");Check(Get<int>(w,"step")==0&&fields["vault"].IsKeyboardFocused,"Empty vault did not receive focus");
  fields["vault"].Text=Path.GetTempPath();checks["cfAccountConfirmed"].IsChecked=true;
  bool pluginEnabled=false;string inspectedConfig="";int inspections=0;
  Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>> send=(action,input)=>{
   Check(action=="vault.inspect","Unexpected automatic command: "+action);inspections++;inspectedConfig=(string)input["configDir"];
   var vault=Data("path",input["path"],"configDir",inspectedConfig,"name","Test vault","version","0.4.2","enabled",pluginEnabled,"localImportSupported",true);
   return Task.FromResult(Data("state",Data("vault",vault),"result",vault));
  };
  Set(w,"send",send);await(Task)Call(w,"Navigate");
  Check(Get<int>(w,"step")==0&&checks["pluginConfirmed"].IsChecked==false,"Disabled plugin was allowed to continue");
  pluginEnabled=true;fields["configDir"].Text=".custom-config";await(Task)Call(w,"Navigate");
  Check(Get<int>(w,"step")==1&&inspections==2&&inspectedConfig==".custom-config"&&checks["pluginConfirmed"].IsChecked==true,"Check-and-continue did not validate the current config directory");
  Call(w,"ShowStep",0);fields["configDir"].Text=".obsidian";await(Task)Call(w,"Navigate");
  Check(inspections==3&&inspectedConfig==".obsidian","Changed config directory reused a stale inspection");
  Call(w,"ShowStep",2);fields["includePrefixes"].Text="Projects\nInbox/Ideas.md";
  checks["mirrorAll"].IsChecked=true;await Frame(w);await Task.Delay(240);
  var options=(Dictionary<string,object>)Call(w,"Options");
  Check(!fields["includePrefixes"].IsVisible&&(string)options["includePrefixes"]==""&&fields["includePrefixes"].Text=="Projects\nInbox/Ideas.md","All-notes selection did not collapse and preserve the custom draft");
  Get<RadioButton>(w,"scopeCustom").IsChecked=true;await Task.Delay(240);await Frame(w);
  Check(fields["includePrefixes"].IsEnabled&&fields["includePrefixes"].IsVisible&&fields["includePrefixes"].Focus()&&((string)((Dictionary<string,object>)Call(w,"Options"))["includePrefixes"]).StartsWith("Projects"),"Custom scope was not editable after switching back");
  foreach(var pair in new[]{new[]{"syncAttachments","maxAttachmentMiB"},new[]{"autoSyncEnabled","autoSyncIntervalMinutes"},new[]{"syncOnChange","debounceMs"}}){
   checks[pair[0]].IsChecked=true;fields[pair[1]].Text="";checks[pair[0]].IsChecked=false;options=(Dictionary<string,object>)Call(w,"Options");await Task.Delay(240);
   Check(checks[pair[0]].IsChecked==false&&!(bool)options[pair[0]]&&!fields[pair[1]].IsVisible,"Hidden invalid input re-enabled a disabled sync option");
  }
  fields["maxAttachmentMiB"].Text="8";fields["autoSyncIntervalMinutes"].Text="15";fields["debounceMs"].Text="1200";checks["syncOnChange"].IsChecked=true;
  checks["autoSyncEnabled"].IsChecked=true;fields["autoSyncIntervalMinutes"].Text="1.5";
  try{Call(w,"Options");throw new Exception("Fractional schedule accepted");}catch(TargetInvocationException error){Check(error.InnerException.Message.StartsWith(L.T("请填写有效的数值：")),"Invalid schedule error");}
  await Frame(w);Check(fields["autoSyncIntervalMinutes"].IsVisible&&fields["autoSyncIntervalMinutes"].IsKeyboardFocused,"Invalid advanced field was not expanded and focused");
  fields["autoSyncIntervalMinutes"].Text="15";checks["autoSyncEnabled"].IsChecked=false;
  foreach(var item in Get<StackPanel[]>(w,"pages")[2].Children)if(item is Expander)((Expander)item).IsExpanded=false;
  w.Width=1040;w.Height=800;Get<Button>(w,"next").Focus();await Frame(w);Get<ScrollViewer>(w,"scroll").ScrollToTop();await Frame(w);await Task.Delay(200);Capture(w,"sync-preferences");
  w.Width=640;w.Height=420;await Frame(w);var scroll=Get<ScrollViewer>(w,"scroll");scroll.ScrollToVerticalOffset(120);await Frame(w);double offset=scroll.VerticalOffset;
  Call(w,"ShowStep",1);await Frame(w);Call(w,"ShowStep",2);await Frame(w);Check(Math.Abs(scroll.VerticalOffset-offset)<2,"Returning to a page lost its scroll position");
  var pending=new TaskCompletionSource<Dictionary<string,object>>();Set(w,"send",new Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>>((action,input)=>pending.Task));
  var request=(Task)Call(w,"Run","preview",Data());
  Check(scroll.IsEnabled&&!fields["deviceName"].IsEnabled&&!Get<Button>(w,"next").IsEnabled&&!Get<ComboBox>(w,"language").IsEnabled,"Busy UI should allow scrolling and lock edits");
  pending.SetResult(Data("result",Data("notes",2)));await request;
  Check(fields["deviceName"].IsEnabled&&Get<Button>(w,"next").IsEnabled,"Inputs did not unlock after request");
  Call(w,"ShowStep",4);Get<ComboBox>(w,"aiClient").SelectedIndex=1;Set(w,"connectionStep",3);Call(w,"RenderConnection");Get<Button>(w,"connectionBack").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
  Check(Get<int>(w,"connectionStep")==1,"Other AI returned to a duplicate password step");
  w.Close();
 }
 static void Wheel(SmoothScrollViewer scroll,DependencyObject source,int delta){
  var wheel=new MouseWheelEventArgs(Mouse.PrimaryDevice,Environment.TickCount,delta){RoutedEvent=Mouse.PreviewMouseWheelEvent,Source=source};
  typeof(SmoothScrollViewer).GetMethod("OnPreviewMouseWheel",Flags).Invoke(scroll,new object[]{wheel});
 }
 static async Task MotionFlows(){
  var w=new SetupWindow(false);w.Show();await Frame(w);Get<ComboBox>(w,"theme").SelectedIndex=1;
  var pages=Get<StackPanel[]>(w,"pages");var fields=Get<Dictionary<string,TextBox>>(w,"text");var checks=Get<Dictionary<string,CheckBox>>(w,"checks");
  Expander advanced=null;foreach(var element in pages[0].Children)if(element is Expander){advanced=(Expander)element;break;}
  advanced.IsExpanded=true;var detail=(FrameworkElement)advanced.Template.FindName("details",advanced);
  if(SystemParameters.ClientAreaAnimation)Check(detail.HasAnimatedProperties,"Expander did not animate");
  await Frame(w);
  await Task.Delay(240);Check(detail.IsVisible&&detail.ActualHeight>20&&Double.IsNaN(detail.Height),"Expansion failed to restore natural height");
  advanced.IsExpanded=false;await Task.Delay(35);advanced.IsExpanded=true;await Task.Delay(35);advanced.IsExpanded=false;await Task.Delay(240);
  Check(detail.Visibility==Visibility.Collapsed&&Double.IsNaN(detail.Height),"Rapid expander reversal left content or fixed height behind");
  Call(w,"ShowStep",2);await Frame(w);await Task.Delay(220);
  var scope=Get<StackPanel>(w,"scopePaths");Get<RadioButton>(w,"scopeAll").IsChecked=true;await Task.Delay(35);Get<RadioButton>(w,"scopeCustom").IsChecked=true;await Task.Delay(240);await Frame(w);
  Check(scope.IsVisible&&scope.IsHitTestVisible&&Double.IsNaN(scope.Height)&&fields["includePrefixes"].IsEnabled,"Scope reversal left the editor locked");
  var editor=fields["includePrefixes"];var point=editor.TranslatePoint(new Point(editor.ActualWidth/2,editor.ActualHeight/2),w);DependencyObject hit=w.InputHitTest(point) as DependencyObject;bool hitEditor=false;
  for(var node=hit;node!=null;node=UiMotion.Parent(node))if(node==editor)hitEditor=true;
  Check(hitEditor&&editor.Focus()&&editor.IsKeyboardFocused,"Scope editor cannot be clicked or focused");
  await Task.Delay(160);Check(((FrameworkElement)editor.Template.FindName("MotionFocus",editor)).Opacity>0.9,"Focus transition did not finish");
  var fixture=Path.Combine(Output,"scope-picker-fixture");Directory.CreateDirectory(Path.Combine(fixture,"Projects"));File.WriteAllText(Path.Combine(fixture,"note.md"),"fixture");
  Call(w,"Update",Data("vault",Data("path",fixture)));editor.Text="";
  Call(w,"AddScopePaths",new object[]{new[]{Path.Combine(fixture,"Projects"),Path.Combine(fixture,"note.md"),Path.Combine(fixture,"note.md")}});
  Check(editor.Text=="Projects"+Environment.NewLine+"note.md","Path assistance did not produce unique vault-relative paths");
  string draft=editor.Text;try{Call(w,"AddScopePaths",new object[]{new[]{Path.GetTempPath()}});throw new Exception("Outside path accepted");}catch(TargetInvocationException){Check(editor.Text==draft,"Rejected outside path changed the draft");}
  var scroll=(SmoothScrollViewer)Get<ScrollViewer>(w,"scroll");w.Width=640;w.Height=420;Get<Button>(w,"next").Focus();await Frame(w);scroll.ScrollToTop();await Frame(w);
  int wheelUpdates=0;bool intermediate=false;double wheelEnd=0;
  ScrollChangedEventHandler observeWheel=(sender,args)=>{if(args.OriginalSource==scroll&&Math.Abs(args.VerticalChange)>0.01){wheelUpdates++;if(scroll.VerticalOffset>0&&scroll.VerticalOffset<wheelEnd-0.1)intermediate=true;}};
  scroll.ScrollChanged+=observeWheel;Wheel(scroll,scroll,-120);wheelEnd=Get<double>(scroll,"wheelTarget");if(SystemParameters.ClientAreaAnimation)Check(Get<bool>(scroll,"scrolling"),"Wheel did not start a transition");
  await Task.Delay(250);await Frame(w);scroll.ScrollChanged-=observeWheel;double first=scroll.VerticalOffset;Check(first>0,"Wheel did not move");
  if(SystemParameters.ClientAreaAnimation&&wheelUpdates>1)Check(intermediate,"Wheel snapped despite rendering multiple frames");
  Wheel(scroll,scroll,-120);await Frame(w);Wheel(scroll,scroll,-120);await Frame(w);double forward=SystemParameters.ClientAreaAnimation?Get<double>(scroll,"wheelTarget"):scroll.VerticalOffset;await Task.Delay(45);Wheel(scroll,scroll,120);await Frame(w);Check((SystemParameters.ClientAreaAnimation?Get<double>(scroll,"wheelTarget"):scroll.VerticalOffset)<forward,"Reverse wheel kept moving toward the old target");await Task.Delay(240);
  var lines=new List<string>();for(int i=0;i<45;i++)lines.Add("Folder "+i);editor.Text=String.Join(Environment.NewLine,lines);editor.BringIntoView();await Frame(w);await Task.Delay(60);var inner=(ScrollViewer)editor.Template.FindName("PART_ContentHost",editor);inner.ScrollToTop();await Frame(w);double outerBefore=scroll.VerticalOffset;
  Wheel(scroll,editor,-120);await Task.Delay(240);await Frame(w);Check(inner.VerticalOffset>0&&Math.Abs(scroll.VerticalOffset-outerBefore)<1,"Nested editor wheel changed offsets: inner="+inner.VerticalOffset+", outer="+scroll.VerticalOffset+", before="+outerBefore+", innerTarget="+(Get<ScrollViewer>(scroll,"wheelViewer")==inner));
  inner.ScrollToEnd();await Frame(w);Wheel(scroll,editor,-120);await Task.Delay(240);await Frame(w);Check(scroll.VerticalOffset>0,"Nested editor boundary did not hand off to the page");
  Wheel(scroll,scroll,-120);Call(w,"ShowStep",1);await Frame(w);Check(!Get<bool>(scroll,"scrolling"),"Page change left wheel animation running");
  double stopped=scroll.VerticalOffset;await Task.Delay(240);await Frame(w);Check(Math.Abs(scroll.VerticalOffset-stopped)<1,"Old wheel animation moved the new page");
  w.Close();
 }
 [STAThread]static void Main(){
  Directory.CreateDirectory(Output);var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};
  app.Startup+=async(s,e)=>{try{
   if(Environment.GetEnvironmentVariable("CA_UI_TEST_FILTER")=="motion"){
    foreach(var locale in new[]{"zh-CN","en"}){L.Select(locale,false);await MotionFlows();}
    File.WriteAllText(Path.Combine(Output,"ui-result.json"),"{\"passed\":true,\"motionFlows\":true,\"languages\":[\"zh-CN\",\"en\"]}");app.Shutdown(0);return;
   }
   int pagesChecked=0;long resizeMilliseconds=0,maxResizeMilliseconds=0;double dpiScale=1;
   foreach(var locale in new[]{"zh-CN","en"}){
   L.Select(locale,false);
   var w=new SetupWindow(false);w.Show();await Frame(w);
   Check(w.Width<=SystemParameters.WorkArea.Width&&w.Height<=SystemParameters.WorkArea.Height,"Startup exceeds work area");
   dpiScale=PresentationSource.FromVisual(w).CompositionTarget.TransformToDevice.M11;
   Get<ComboBox>(w,"theme").SelectedIndex=1;await Frame(w);Capture(w,"light-startup");
   Check(w.Icon!=null&&w.Icon.Width>=48,"App icon missing or too small");
   Check(((SolidColorBrush)Get<TextBlock>(w,"logo").Foreground).Color==((SolidColorBrush)w.Resources["Ink"]).Color,"Brand contrast");
   var cases=new[]{new Size(1040,800),new Size(1040,400),new Size(900,512),new Size(640,420),new Size(480,360)};
   foreach(var size in cases){w.Width=size.Width;w.Height=size.Height;await Frame(w);for(int step=0;step<5;step++){
    Call(w,"ShowStep",step);await Frame(w);var root=(FrameworkElement)w.Content;var scroll=Get<ScrollViewer>(w,"scroll");
    Check(scroll.ExtentWidth<=scroll.ViewportWidth+1,"Horizontal overflow at "+size+" page "+step+": "+scroll.ExtentWidth+" / "+scroll.ViewportWidth);
    var next=Get<Button>(w,"next");var point=next.TranslatePoint(new Point(0,0),root);
    Check(point.X>=0&&point.Y>=0&&point.X+next.ActualWidth<=root.ActualWidth+1&&point.Y+next.ActualHeight<=root.ActualHeight+1,"Navigation off-screen");
    Check(scroll.ActualHeight>=75,"No useful page height");if(locale=="en")CheckEnglish(root);pagesChecked++;
   }}
   Get<ComboBox>(w,"theme").SelectedIndex=2;Call(w,"ShowStep",0);await Frame(w);Capture(w,"small-dark");
   w.Width=1366/1.5;w.Height=768/1.5;await Frame(w);Capture(w,"1366x768-at-150-percent",1.5);
   w.Width=1280/2;w.Height=720/2;await Frame(w);Capture(w,"1280x720-at-200-percent",2);
   w.Width=1040;w.Height=800;Call(w,"ShowStep",4);await Frame(w);
   Check(Get<ComboBox>(w,"aiClient").SelectedIndex==0,"ChatGPT default");
   Check(Get<Button>(w,"connectionPrimary").Content.ToString().Contains("ChatGPT"),"Default copy/open action");
   var fields=Get<Dictionary<string,TextBox>>(w,"text");fields["mcpUrl"].Text="https://fixture.workers.dev/mcp";fields["appName"].Text="Fixture Notes";Set(w,"password","fixture-read-password");
   await Frame(w);Capture(w,"chatgpt-step-one");
   var primary=Get<Button>(w,"connectionPrimary");primary.ApplyTemplate();
   Check(primary.Template.FindName("MotionFocus",primary)!=null,"Button focus feedback missing");
   fields["mcpUrl"].ApplyTemplate();Check(fields["mcpUrl"].Template.FindName("MotionFocus",fields["mcpUrl"])!=null,"Input focus feedback missing");
   foreach(var item in Get<StackPanel[]>(w,"pages")[4].Children)if(item is Expander){((Expander)item).IsExpanded=true;await Frame(w);Check(fields["json"].IsVisible,"Extra config unavailable");((Expander)item).IsExpanded=false;}
   fields["includePrefixes"].Text="Inbox\nProjects";
   var options=(Dictionary<string,object>)Call(w,"Options");Check((string)options["includePrefixes"]=="Inbox\nProjects"&&(double)options["maxAttachmentMiB"]==8&&(bool)options["syncOnChange"],"Sync settings changed in UI");
   var original=SnapshotClipboard();
   Exception copyFailure=null;
   try {
    // The password entry must be visible and reachable before opening a browser.
    var navigation=Get<WrapPanel>(w,"connectionSteps");
    Check(navigation.Children.Count==3&&((Button)navigation.Children[2]).Content.ToString()==L.T("3 · 授权密码"),"Password navigation missing on the first step");
    // This window deliberately has no RPC backend: a failed browser-open must not trap the flow.
    await(Task)Call(w,"AdvanceConnection");
    Check(Get<int>(w,"connectionStep")==1&&(await ReadClipboardText())==fields["mcpUrl"].Text,"Browser failure trapped the address step");
    Check(Get<TextBlock>(w,"status").Text.StartsWith(L.T("地址已复制，后续信息仍可继续复制。")),"Browser failure guidance missing");
    navigation=Get<WrapPanel>(w,"connectionSteps");
    ((Button)navigation.Children[2]).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    await Frame(w);Check(Get<PasswordBox>(w,"readPassword").IsVisible,"Password field not reachable after browser failure");
    Capture(w,"password-after-browser-failure");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="fixture-read-password","Password copy after browser failure");
    Get<ComboBox>(w,"aiClient").SelectedIndex=1;Check(Get<Button>(w,"connectionPrimary").Content.ToString()==L.T("复制 MCP 地址"),"Other AI label");
    Check(Get<WrapPanel>(w,"connectionSteps").Children.Count==2,"Other AI password navigation missing");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())==fields["mcpUrl"].Text,"Other AI address copy");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="fixture-read-password","Other AI password copy");
    Get<ComboBox>(w,"aiClient").SelectedIndex=0;Set(w,"connectionStep",1);Call(w,"RenderConnection");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="Fixture Notes","ChatGPT name copy");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="fixture-read-password","ChatGPT password copy");
   } catch(Exception copyError){copyFailure=copyError;}
   // .NET Framework's compiler does not support await inside finally.
   try {await RestoreClipboard(original);}
   catch(Exception restoreError){if(copyFailure!=null)throw new AggregateException(copyFailure,restoreError);throw;}
   if(copyFailure!=null)System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(copyFailure).Throw();
   Check(Get<TextBlock>(w,"connectionTitle").Text==L.T("回到 AI 完成连接"),"No false connected claim");
   Call(w,"ShowStep",1);var state=new Dictionary<string,object>{{"authenticated",true},{"accounts",new object[]{new Dictionary<string,object>{{"id","test"},{"name","Test Account"}}}}};
   Call(w,"Update",state);Check(!Get<PasswordBox>(w,"cfToken").IsEnabled&&!Get<Button>(w,"tokenButton").IsEnabled,"Token disabled after OAuth");
   // Switching must update the current page while preserving user-entered state.
   fields["deviceName"].Text="My laptop";fields["includePrefixes"].Text="Inbox\nProjects";
   Get<Dictionary<string,CheckBox>>(w,"checks")["bidirectionalEnabled"].IsChecked=true;
   Get<PasswordBox>(w,"cfToken").Password="fixture-token";
   Set(w,"connectionStep",2);Call(w,"ShowStep",4);Call(w,"RenderConnection");
   int themeBefore=Get<ComboBox>(w,"theme").SelectedIndex;
   Get<ComboBox>(w,"language").SelectedIndex=locale=="en"?0:1;await Frame(w);
   Check(fields["deviceName"].Text=="My laptop"&&fields["includePrefixes"].Text=="Inbox\nProjects","Language switch lost input");
   Check(Get<PasswordBox>(w,"cfToken").Password=="fixture-token"&&Get<string>(w,"password")=="fixture-read-password","Language switch lost credentials");
   Check(Get<int>(w,"step")==4&&Get<int>(w,"connectionStep")==2&&Get<ComboBox>(w,"theme").SelectedIndex==themeBefore,"Language switch changed navigation/theme");
   Check(Get<ComboBox>(w,"accounts").SelectedIndex==0&&Get<Dictionary<string,CheckBox>>(w,"checks")["bidirectionalEnabled"].IsChecked==true,"Language switch lost account/settings");
   for(int page=0;page<5;page++){Call(w,"ShowStep",page);await Frame(w);if(L.Language=="en")CheckEnglish((DependencyObject)w.Content);}
   Get<ComboBox>(w,"language").SelectedIndex=locale=="en"?1:0;await Frame(w);
   Set(w,"busy",true);Call(w,"RefreshEnabled");Check(!Get<ComboBox>(w,"language").IsEnabled,"Language switch enabled during operation");Set(w,"busy",false);Call(w,"RefreshEnabled");
   Get<Dictionary<string,CheckBox>>(w,"checks")["syncAttachments"].IsChecked=true;fields["maxAttachmentMiB"].Text="invalid";
   try {Call(w,"Options");throw new Exception("Invalid numeric input accepted");}catch(TargetInvocationException error){Check(error.InnerException.Message.StartsWith(L.T("请填写有效的数值：")),"Validation message language");}
   fields["maxAttachmentMiB"].Text="8";
   Call(w,"Error",String.Join(" ",new string[]{L.T("当前操作还在进行，请等待完成。"),L.T("当前操作还在进行，请等待完成。"),L.T("当前操作还在进行，请等待完成。"),L.T("当前操作还在进行，请等待完成。")}));
   w.Width=480;w.Height=360;await Frame(w);Capture(w,"long-error-small");
   Check(Get<ScrollViewer>(w,"scroll").ActualHeight>=75,"Long error hides page");
   var timer=Stopwatch.StartNew();for(int i=0;i<80;i++){
    var frame=Stopwatch.StartNew();w.Width=600+i*4;w.Height=500+(i%15);w.UpdateLayout();frame.Stop();
    maxResizeMilliseconds=Math.Max(maxResizeMilliseconds,frame.ElapsedMilliseconds);
    // Bound a visible stall, not the throughput of 80 frames on shared CI CPUs.
    Check(frame.ElapsedMilliseconds<500,"Single resize layout stalls: "+frame.ElapsedMilliseconds);
   }timer.Stop();resizeMilliseconds+=timer.ElapsedMilliseconds;w.Close();
   await RecoveryFlows();
   await UsabilityFlows();
   await MotionFlows();
   // Exercise the real backend after the first fully rendered frame, using an isolated receipt directory.
   var live=new SetupWindow();live.Show();await Frame(live);Capture(live,"real-startup-first-frame");
   for(int i=0;i<100&&!Get<bool>(live,"ready");i++)await Task.Delay(100);
   Check(Get<bool>(live,"ready"),"Real backend failed: "+Get<TextBlock>(live,"status").Text);await Frame(live);Capture(live,"real-startup-ready");if(locale=="en")CheckEnglish((DependencyObject)live.Content);live.Close();
   }
   File.WriteAllText(Path.Combine(Output,"ui-result.json"),"{\"passed\":true,\"viewportPageChecks\":"+pagesChecked+",\"languages\":[\"zh-CN\",\"en\"],\"liveLanguageSwitch\":true,\"resizeCycles\":160,\"resizeMilliseconds\":"+resizeMilliseconds+",\"maxResizeMilliseconds\":"+maxResizeMilliseconds+",\"nativeDpiScale\":"+dpiScale.ToString(System.Globalization.CultureInfo.InvariantCulture)+",\"opaqueFirstFrame\":true,\"realBackendReady\":true,\"copyFlow\":true,\"appIcon\":true,\"usabilityFlows\":true,\"motionFlows\":true,\"recoveryUiFlows\":true,\"recoveryWarningRetry\":true}");app.Shutdown(0);
  }catch(Exception error){File.WriteAllText(Path.Combine(Output,"ui-error.txt"),error.ToString());app.Shutdown(1);}};
  app.Run();
 }
}
