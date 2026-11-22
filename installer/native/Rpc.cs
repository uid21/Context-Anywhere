using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
namespace ContextAnywhereSetup {
  class Rpc : IDisposable {
    readonly Process process;
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Dictionary<int, TaskCompletionSource<Dictionary<string, object>>> pending = new Dictionary<int, TaskCompletionSource<Dictionary<string, object>>>();
    int sequence;
    Exception disconnected;
    public event Action Disconnected;
    public string Language {get;set;}
    public event Action<string> Progress;
    public event Action<Dictionary<string, object>> StateChanged;
    public Rpc() {
      Language=L.Language;
      var root = AppDomain.CurrentDomain.BaseDirectory;
      var start = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "\"" + Path.Combine(root, "app", "bridge.mjs") + "\"");
      start.WorkingDirectory = root; start.UseShellExecute = false; start.CreateNoWindow = true;
      start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      start.StandardOutputEncoding = Encoding.UTF8; start.StandardErrorEncoding = Encoding.UTF8;
      start.EnvironmentVariables["CA_SETUP_ROOT"] = root;
      start.EnvironmentVariables["CA_SETUP_LANGUAGE"] = Language;
      process = new Process(); process.StartInfo = start; process.EnableRaisingEvents = true;
      process.OutputDataReceived += (sender, eventArgs) => {
        if (eventArgs.Data==null){Fail(new Exception(L.T("后台连接已断开，请重新连接。")));return;}
        if (eventArgs.Data.Length==0)return;
        try {
          var message = json.Deserialize<Dictionary<string, object>>(eventArgs.Data);
          if (message.ContainsKey("event")) { var changed=StateChanged; if(changed!=null && message.ContainsKey("state")) changed((Dictionary<string,object>)message["state"]); return; }
          if (message.ContainsKey("progress")) { var progress = Progress; if (progress != null) progress(Convert.ToString(message["progress"])); return; }
          var id = Convert.ToInt32(message["id"]); TaskCompletionSource<Dictionary<string, object>> completion;
          lock (pending) { if (!pending.TryGetValue(id, out completion)) return; pending.Remove(id); }
          completion.TrySetResult(message);
        } catch { Fail(new Exception(L.T("向导收到无法识别的后台响应，请关闭后重新打开。"))); }
      };
      // Provider/automation errors can contain secrets. The bridge reports sanitized errors on stdout.
      process.ErrorDataReceived += (sender, eventArgs) => {};
      process.Start(); process.StandardInput.NewLine = "\n"; process.BeginOutputReadLine(); process.BeginErrorReadLine();
    }
    void Fail(Exception error) {
      lock (pending) { if(disconnected!=null)return;disconnected=error;foreach (var completion in pending.Values) completion.TrySetException(error); pending.Clear(); }
      var changed=Disconnected;if(changed!=null)changed();
    }
    public Task<Dictionary<string, object>> Call(string action, Dictionary<string, object> input) {
      var id = ++sequence; var completion = new TaskCompletionSource<Dictionary<string, object>>();
      lock (pending) {if(disconnected!=null){completion.TrySetException(disconnected);return completion.Task;}pending.Add(id, completion);}
      try { process.StandardInput.WriteLine(json.Serialize(new { id = id, action = action, input = input, language = Language })); process.StandardInput.Flush(); }
      catch { Fail(new Exception(L.T("后台连接已断开，请重新连接。"))); }
      return completion.Task;
    }
    public void Dispose() {
      try { process.StandardInput.Close(); if (!process.WaitForExit(2000)) process.Kill(); } catch {}
      process.Dispose();
    }
  }

}
