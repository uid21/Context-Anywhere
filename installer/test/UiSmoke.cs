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
  // At fractional Windows scaling, rounding up allocates a transparent strip
  // outside the visual. Check opacity over all pixels covered by the window.
  var bitmap=new RenderTargetBitmap((int)Math.Floor(root.ActualWidth*scale),(int)Math.Floor(root.ActualHeight*scale),96*scale,96*scale,PixelFormats.Pbgra32);
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
    Check((string)input["key"]=="deployment-a"&&input.Count==2,"Recovery must send the selected deployment and account only");
    fixture["accountId"]=input["accountId"];fixture["deployed"]=true;fixture["recovered"]=true;fixture["recoverySaved"]=true;fixture["recoveryChoice"]="restore";fixture["workerUrl"]="https://notes-a.workers.dev";fixture.Remove("settings");
   }else if(action=="preview"){result["notes"]=1;}
   else if(action=="recovery.configure"){
    Check((string)input["deviceName"]=="This laptop"&&(string)input["includePrefixes"]=="New device notes"&&(bool)input["pluginConfirmed"],"Recovery lost this device's scope or plugin confirmation");
    fixture["settings"]=Data("deviceName",input["deviceName"],"includePrefixes",new object[]{"New device notes"});
   }else if(action=="secret.refresh"){result["refreshed"]=true;}
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
  Call(w,"ShowStep",4);Get<ComboBox>(w,"aiClient").SelectedItem=L.T("其他 AI");Set(w,"connectionStep",3);Call(w,"RenderConnection");Get<Button>(w,"connectionBack").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
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
 static async Task AvailabilityFlows(){
  var previous=Environment.GetEnvironmentVariable("CA_SETUP_DATA_DIR");
  var directory=Path.Combine(Output,"unreadable-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
  var receipt=Path.Combine(directory,"deployment.dpapi");File.WriteAllText(receipt,"synthetic unreadable fixture");
  Environment.SetEnvironmentVariable("CA_SETUP_DATA_DIR",directory);
  var w=new SetupWindow{ShowActivated=false,ShowInTaskbar=false,WindowStartupLocation=WindowStartupLocation.Manual,Left=-32000,Top=-32000};
  try{
   w.Show();await Frame(w);
   for(int i=0;i<100&&!Get<bool>(w,"ready");i++)await Task.Delay(100);
   Check(Get<bool>(w,"ready")&&(bool)Get<Dictionary<string,object>>(w,"state")["localRecordUnreadable"],"Invalid DPAPI record prevented startup");
   var backend=Get<Rpc>(w,"rpc");Get<Process>(backend,"process").Kill();
   var retry=Get<Button>(w,"retryBackend");for(int i=0;i<100&&retry.Visibility!=Visibility.Visible;i++)await Task.Delay(50);
   Check(retry.IsEnabled&&retry.Visibility==Visibility.Visible,"Background exit did not expose retry");
   retry.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
   for(int i=0;i<100&&!Get<bool>(w,"ready");i++)await Task.Delay(100);
   Check(Get<bool>(w,"ready")&&Get<Rpc>(w,"rpc")!=backend,"Retry did not start a working backend");
   Check(File.ReadAllText(receipt)=="synthetic unreadable fixture","Opening the wizard changed the unreadable receipt");
   Get<Button>(w,"cloudRecovery").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Check(Get<int>(w,"step")==1,"Recovery required a vault");
   var state=Data("authenticated",true,"accounts",new object[]{Data("id","one","name","Example")},"recoveryChecked",true,"recoveryAccountId","one","recoveries",new object[]{Data("key","fixture","label","example")},"localRecordUnreadable",true);
   bool fail=true;Set(w,"send",new Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>>((action,input)=>{
    if(action=="secret.refresh")return Task.FromResult(Data("state",state,"result",Data("refreshed",true)));
    Check(action=="recovery.restore"&&input.Count==2&&(string)input["accountId"]=="one"&&(string)input["key"]=="fixture","Restore asked for read passwords");
    if(fail)return Task.FromResult(Data("state",state,"error","Fixture lookup failed"));
    state["deployed"]=state["recovered"]=state["recoverySaved"]=true;return Task.FromResult(Data("state",state,"result",Data("restored",true)));
   }));
   Call(w,"Update",state);var restore=Get<Button>(w,"restoreDeployment");restore.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));await Frame(w);
   Check(restore.IsEnabled&&Get<int>(w,"step")==1&&Get<ComboBox>(w,"deployments").SelectedIndex==0,"Failed restore lost the retry");
   fail=false;restore.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));await Frame(w);
   Check(Get<int>(w,"step")==3&&Get<Expander>(w,"credentialSection").IsExpanded&&Get<Button>(w,"selectLocalVault").IsVisible,"Vault-free recovery did not expose credentials and local vault selection");
   Get<Button>(w,"selectLocalVault").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Check(Get<int>(w,"step")==0,"Could not select the local vault after finding credentials");
  }finally{w.Close();Environment.SetEnvironmentVariable("CA_SETUP_DATA_DIR",previous);Directory.Delete(directory,true);}
 }
 static SetupWindow TestWindow(Action<string> clipboard=null){
  return new SetupWindow(false,clipboard){ShowActivated=false,ShowInTaskbar=false,WindowStartupLocation=WindowStartupLocation.Manual,Left=-32000,Top=-32000};
 }
 static async Task Click(SetupWindow w,Button button){
  var label=button.Content as TextBlock;Check(button.IsEnabled&&button.IsVisible,"Clicked unavailable button: "+(label==null?button.Content:label.Text));
  button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));await Frame(w);
 }
 static string KeyLabel(ComboBox picker,int index){return ((TextBlock)((ComboBoxItem)picker.Items[index]).Content).Text;}
 static void ExpandAncestors(FrameworkElement control){
  DependencyObject parent=control;
  while(parent!=null){var section=parent as Expander;if(section!=null)section.IsExpanded=true;parent=LogicalTreeHelper.GetParent(parent);}
 }
 static async Task ReadKeyFlows(){
  var copied=new List<string>();var w=TestWindow(copied.Add);w.Show();await Frame(w);
  try{
   var primary=Data("kind","read","name","");var created=Data("kind","read8197","slot",8197,"name","Personal AI");var dashboard=Data("kind","read9247","slot",9247,"name","");
   var keys=new List<object>{primary};var cachedKeys=keys.ToArray();
   var fixture=Data("deployed",true,"authenticated",true,"accounts",new object[]{Data("id","one","name","Fixture")},"accountId","one","workerUrl","https://fixture.workers.dev","recoveryChecked",true,"recoveryAccountId","one");
   bool failRefresh=false,failCopy=false;int refreshes=0;var commands=new List<string>();
   Set(w,"send",new Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>>((action,input)=>{
    commands.Add(action);var result=Data();string error="";
    if(action=="secret.refresh"){
     refreshes++;
     if(failRefresh)error="Fixture Cloudflare unavailable";
     else{cachedKeys=keys.ToArray();result["refreshed"]=true;}
    }else if(action=="manual"){
     Check(input.ContainsKey("includePassword")&&!(bool)input["includePassword"],"AI page requested a password before the user chose one");result["url"]="https://fixture.workers.dev/mcp";
    }else if(action=="secret.add"){
     Check(input.Count==1&&(string)input["name"]=="Personal AI","Adding a password asked for an old value or slot");
     fixture["pendingKeyUpdate"]="read8197";fixture["pendingKeyAction"]="add";error="Fixture update interrupted";
    }else if(action=="secret.resume"){
     Check(input.Count==0,"Pending addition needs no slot or password re-entry");keys.Add(created);cachedKeys=keys.ToArray();
     fixture.Remove("pendingKeyUpdate");fixture.Remove("pendingKeyAction");result["kind"]="read8197";
    }else if(action=="secret.rename"){
     Check((string)input["kind"]=="read8197"&&(string)input["name"]=="Work assistant","Rename sent the wrong key or label");created["name"]=input["name"];
    }else if(action=="secret.import"){
     Check((string)input["kind"]=="read8197"&&(string)input["value"]=="fixture-current-value","Import requested the wrong password");
    }else if(action=="secret.get"){
     string selected=(string)input["kind"];commands.Add("get:"+selected);
     if(failCopy)error="Fixture password check failed";
     else result["value"]="fixture-value-"+selected;
    }else if(action!="chatgpt.open"&&action!="gemini.open")throw new Exception("Unexpected read-key command: "+action);
    var state=new Dictionary<string,object>(fixture){{"readKeys",cachedKeys}};
    return Task.FromResult(error==""?Data("state",state,"result",result):Data("state",state,"error",error));
   }));
   Call(w,"Update",new Dictionary<string,object>(fixture){{"readKeys",cachedKeys}});
   Call(w,"ShowStep",3);Get<Expander>(w,"credentialSection").IsExpanded=true;await Frame(w);
   var managed=Get<ComboBox>(w,"managedReadKey");var picker=Get<ComboBox>(w,"connectionReadKey");var client=Get<ComboBox>(w,"aiClient");
   Check(refreshes==1&&managed.Items.Count==1&&KeyLabel(managed,0)==L.T("默认读取密码"),"Fresh deployment should show exactly one read password");
   Get<Expander>(w,"addKeySection").IsExpanded=true;Get<TextBox>(w,"newKeyName").Text="Personal AI";
   var add=Get<Button>(w,"addReadKey");var resume=Get<Button>(w,"resumeReadKey");
   await Click(w,add);
   Check(managed.Items.Count==1&&!add.IsEnabled&&resume.IsVisible&&Get<Button>(w,"copyReadKey").IsEnabled,"Interrupted add blocked the old password or lost retry");
   await Click(w,resume);
   Check(managed.Items.Count==2&&KeyLabel(managed,1)=="Personal AI"&&(string)managed.SelectedValue=="read8197"&&resume.Visibility==Visibility.Collapsed,"New password was not named and available after retry");
   var name=Get<TextBox>(w,"managedKeyName");ExpandAncestors(name);name.Text="Work assistant";await Frame(w);await Click(w,Get<Button>(w,"renameReadKey"));
   Check(KeyLabel(managed,1)=="Work assistant","Rename did not update the list");
   var imported=Get<PasswordBox>(w,"importedReadKey");ExpandAncestors(imported);imported.Password="fixture-current-value";await Frame(w);await Click(w,Get<Button>(w,"importReadKey"));
   Check(Get<PasswordBox>(w,"importedReadKey").Password=="","Password import left its plaintext input in the form");
   await Click(w,Get<Button>(w,"copyReadKey"));Check(copied[copied.Count-1]=="fixture-value-read8197","Manager did not copy the selected key");
   await(Task)Call(w,"CopySecret","write");Check(copied[copied.Count-1]=="fixture-value-write","Read key management changed upload credential copying");
   keys.Add(dashboard);await Click(w,Get<Button>(w,"next"));
   Check(refreshes==2&&Get<int>(w,"step")==4&&picker.Items.Count==3&&KeyLabel(picker,2)=="MIRROR_READ_KEY_9247","AI page failed to auto-discover a Dashboard password");
   var steps=Get<WrapPanel>(w,"connectionSteps");var copy=Get<Button>(w,"connectionPrimary");
   await Click(w,(Button)steps.Children[2]);Check(!copy.IsEnabled&&picker.SelectedIndex==-1,"Multiple passwords should start with a deliberate choice");
   picker.SelectedValue="read9247";await Click(w,copy);Check(copied[copied.Count-1]=="fixture-value-read9247","ChatGPT could not choose the password added in Dashboard");
   client.SelectedItem="Gemini";await Click(w,copy);
   Check(commands.Contains("gemini.open")&&picker.IsVisible&&picker.SelectedIndex==-1,"Gemini picked a password based on its service name or index");
   picker.SelectedValue="read";await Click(w,copy);Check(copied[copied.Count-1]=="fixture-value-read","Gemini could not choose the original password");
   client.SelectedItem=L.T("其他 AI");await Click(w,(Button)steps.Children[1]);picker.SelectedValue="read8197";
   await Click(w,copy);Check(copied[copied.Count-1]=="fixture-value-read8197","Other AI could not use its own password");
   client.SelectedIndex=0;await Click(w,(Button)steps.Children[2]);
   Check((string)picker.SelectedValue=="read9247","Switching AI services lost the user's independent choice");
   var language=Get<ComboBox>(w,"language");int oldLanguage=language.SelectedIndex;language.SelectedIndex=1-oldLanguage;await Frame(w);
   Check((string)picker.SelectedValue=="read9247"&&KeyLabel(picker,2)=="MIRROR_READ_KEY_9247","Language switching lost key labels or selection");
   language.SelectedIndex=oldLanguage;await Frame(w);
   w.Width=480;w.Height=360;await Frame(w);
   var scroll=Get<ScrollViewer>(w,"scroll");Check(scroll.ExtentWidth<=scroll.ViewportWidth+1&&picker.IsVisible&&copy.IsVisible,"Password selection overflows on a small window");
   failRefresh=true;Call(w,"RequestReadKeyRefresh");await Frame(w);
   Check(picker.Items.Count==3&&Get<TextBlock>(w,"connectionKeySyncStatus").Text==L.T("未能刷新云端读取密码。列表为本机缓存，可重试。"),"Failed refresh advertised the cache as current or discarded it");
   int before=copied.Count;failCopy=true;await Click(w,copy);
   Check(copied.Count==before&&Get<int>(w,"connectionStep")==2,"Failed live secret lookup copied a stale value or claimed success");
   failRefresh=failCopy=false;keys.Remove(dashboard);Call(w,"RequestReadKeyRefresh");await Frame(w);
   Check(picker.Items.Count==2&&picker.SelectedIndex==-1&&!copy.IsEnabled,"A removed key silently fell back to another password");
   fixture["authenticated"]=false;fixture["accounts"]=new object[0];Call(w,"Update",new Dictionary<string,object>(fixture){{"readKeys",cachedKeys}});
   Check(Get<TextBlock>(w,"connectionKeySyncStatus").Text==L.T("当前显示本机保存的读取密码。登录原部署所属的 Cloudflare 账号可刷新云端列表。"),"Offline mode did not describe its local cache");
   picker.SelectedValue="read8197";await Click(w,copy);Check(copied[copied.Count-1]=="fixture-value-read8197","Offline copy did not use the selected locally saved password");
   Check(!Get<TextBlock>(w,"status").Text.Contains("fixture-value-"),"Copy displayed a plaintext credential");
   if(L.Language=="en")CheckEnglish((DependencyObject)w.Content);
  }finally{w.Close();}
 }
 static async Task AttachFlow(){
  var w=TestWindow();w.Show();await Frame(w);
  try{
   Call(w,"ShowStep",1);var state=Data("authenticated",true,"accounts",new object[]{Data("id","one","name","Fixture")},"recoveryChecked",true,"recoveryAccountId","one");
   bool fail=true;Set(w,"send",new Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>>((action,input)=>{
    if(action=="secret.refresh")return Task.FromResult(Data("state",state,"result",Data("refreshed",true)));
    Check(action=="recovery.attach"&&input.Count==3&&(string)input["worker"]=="existing-worker"&&(string)input["write"]=="fixture-upload-value"&&(string)input["accountId"]=="one","Manual attach used the wrong deployment credentials");
    if(fail)return Task.FromResult(Data("state",state,"error","Fixture verification failed"));
    state["deployed"]=state["recovered"]=state["recoverySaved"]=true;state["accountId"]="one";
    return Task.FromResult(Data("state",state,"result",Data("restored",true)));
   }));
   Call(w,"Update",state);Get<Expander>(w,"attachDeploymentSection").IsExpanded=true;
   var worker=Get<TextBox>(w,"attachWorker");var write=Get<PasswordBox>(w,"attachWrite");var connect=Get<Button>(w,"attachDeployment");
   worker.Text="existing-worker";write.Password="fixture-upload-value";await Frame(w);await Click(w,connect);
   Check(Get<int>(w,"step")==1&&worker.Text=="existing-worker"&&write.Password=="fixture-upload-value","A failed attach discarded the form or changed pages");
   fail=false;await Click(w,connect);
   Check(Get<int>(w,"step")==3&&write.Password==""&&worker.Text==""&&Get<Expander>(w,"credentialSection").IsExpanded,"Manual attach did not continue into recovered deployment");
  }finally{w.Close();}
 }
 [STAThread]static void Main(){
  Directory.CreateDirectory(Output);var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};
  app.Startup+=async(s,e)=>{try{
   if(Environment.GetEnvironmentVariable("CA_UI_TEST_FILTER")=="availability"){
    await AvailabilityFlows();File.WriteAllText(Path.Combine(Output,"ui-result.json"),"{\"passed\":true,\"availability\":true}");app.Shutdown(0);return;
   }
   if(Environment.GetEnvironmentVariable("CA_UI_TEST_FILTER")=="motion"){
    foreach(var locale in new[]{"zh-CN","en"}){L.Select(locale,false);await MotionFlows();}
    File.WriteAllText(Path.Combine(Output,"ui-result.json"),"{\"passed\":true,\"motionFlows\":true,\"languages\":[\"zh-CN\",\"en\"]}");app.Shutdown(0);return;
   }
   if(Environment.GetEnvironmentVariable("CA_UI_TEST_FILTER")=="read-keys"){
    foreach(var locale in new[]{"zh-CN","en"}){L.Select(locale,false);await ReadKeyFlows();await AttachFlow();}
    File.WriteAllText(Path.Combine(Output,"ui-result.json"),"{\"passed\":true,\"readKeyFlows\":true,\"manualAttach\":true,\"languages\":[\"zh-CN\",\"en\"]}");app.Shutdown(0);return;
   }
   await AvailabilityFlows();
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
   var fields=Get<Dictionary<string,TextBox>>(w,"text");fields["mcpUrl"].Text="https://fixture.workers.dev/mcp";fields["appName"].Text="Fixture Notes";
   var readFixture=Data("deployed",true,"readKeys",new object[]{Data("kind","read","name","")});Call(w,"Update",readFixture);
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
    await Frame(w);Check(Get<ComboBox>(w,"connectionReadKey").IsVisible,"Password list not reachable after browser failure");
    Set(w,"send",new Func<string,Dictionary<string,object>,Task<Dictionary<string,object>>>((action,input)=>{
      if(action=="gemini.open")return Task.FromResult(Data("state",readFixture,"result",Data()));
      Check(action=="secret.get"&&(string)input["kind"]=="read","Single deployed password was not selected");
      return Task.FromResult(Data("state",readFixture,"result",Data("value","fixture-read-password")));
    }));
    Capture(w,"password-after-browser-failure");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="fixture-read-password","Password copy after browser failure");
    Get<ComboBox>(w,"aiClient").SelectedItem=L.T("其他 AI");Check(Get<Button>(w,"connectionPrimary").Content.ToString()==L.T("复制 MCP 地址"),"Other AI label");
    Check(Get<WrapPanel>(w,"connectionSteps").Children.Count==2,"Other AI password navigation missing");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())==fields["mcpUrl"].Text,"Other AI address copy");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="fixture-read-password","Other AI password copy");
    var clientPicker=Get<ComboBox>(w,"aiClient");
    clientPicker.SelectedItem="Gemini";
    Check(primary.Content.ToString()==L.T("复制 MCP 地址并打开 Gemini"),"Gemini address action");
    await(Task)Call(w,"AdvanceConnection");
    Check((await ReadClipboardText())==fields["mcpUrl"].Text,"Gemini did not receive the MCP URL");
    await(Task)Call(w,"AdvanceConnection");
    Check((await ReadClipboardText())=="fixture-read-password","Existing single-key deployment could not authorize Gemini");
    Get<ComboBox>(w,"aiClient").SelectedIndex=0;Set(w,"connectionStep",1);Call(w,"RenderConnection");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="Fixture Notes","ChatGPT name copy");
    await(Task)Call(w,"AdvanceConnection");Check((await ReadClipboardText())=="fixture-read-password","ChatGPT password copy");
    Set(w,"send",null);
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
   Check(Get<PasswordBox>(w,"cfToken").Password=="fixture-token","Language switch lost typed credentials");
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
   await ReadKeyFlows();await AttachFlow();
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
