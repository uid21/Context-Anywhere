using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Interop;

namespace ContextAnywhereSetup {
  // The shell's Explorer-style folder dialog, including its editable address bar.
  static class FolderPicker {
    const int Cancelled = unchecked((int)0x800704C7);
    const uint PickFolders = 0x20, ForceFileSystem = 0x40, PathMustExist = 0x800;
    const uint FileSystemPath = 0x80058000;

    internal static string Select(Window owner, string title, string initialPath) {
      if (owner != null) owner.VerifyAccess();
      var dialog = CreateDialog(title, initialPath);
      IShellItem selected = null;
      IntPtr path = IntPtr.Zero;
      try {
        var window = owner == null ? IntPtr.Zero : new WindowInteropHelper(owner).EnsureHandle();
        int result = dialog.Show(window);
        if (result == Cancelled) return null;
        Marshal.ThrowExceptionForHR(result);
        Marshal.ThrowExceptionForHR(dialog.GetResult(out selected));
        Marshal.ThrowExceptionForHR(selected.GetDisplayName(FileSystemPath, out path));
        return Marshal.PtrToStringUni(path);
      } finally {
        if (path != IntPtr.Zero) Marshal.FreeCoTaskMem(path);
        Release(selected);
        Release(dialog);
      }
    }

    static IFileOpenDialog CreateDialog(string title, string initialPath) {
      if (Thread.CurrentThread.GetApartmentState() != ApartmentState.STA)
        throw new InvalidOperationException("The folder picker must run on the window's STA thread.");
      var dialog = (IFileOpenDialog)new FileOpenDialog();
      IShellItem initialFolder = null;
      try {
        uint options;
        Marshal.ThrowExceptionForHR(dialog.GetOptions(out options));
        Marshal.ThrowExceptionForHR(dialog.SetOptions(options | PickFolders | ForceFileSystem | PathMustExist));
        if (!String.IsNullOrWhiteSpace(title)) Marshal.ThrowExceptionForHR(dialog.SetTitle(title));
        if (!String.IsNullOrWhiteSpace(initialPath) && Directory.Exists(initialPath.Trim())) {
          var shellItemId = typeof(IShellItem).GUID;
          Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(Path.GetFullPath(initialPath.Trim()), IntPtr.Zero, ref shellItemId, out initialFolder));
          Marshal.ThrowExceptionForHR(dialog.SetFolder(initialFolder));
        }
        return dialog;
      } catch {
        Release(dialog);
        throw;
      } finally { Release(initialFolder); }
    }

    static void Release(object value) {
      if (value != null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    static extern int SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr bindContext, ref Guid interfaceId, out IShellItem item);

    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    class FileOpenDialog { }

    // Include the inherited IModalWindow/IFileDialog slots in native vtable order.
    [ComImport, Guid("D57C7288-D4AD-4768-BE02-9D969532D960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileOpenDialog {
      [PreserveSig] int Show(IntPtr owner);
      [PreserveSig] int SetFileTypes(uint count, IntPtr filters);
      [PreserveSig] int SetFileTypeIndex(uint index);
      [PreserveSig] int GetFileTypeIndex(out uint index);
      [PreserveSig] int Advise(IntPtr events, out uint cookie);
      [PreserveSig] int Unadvise(uint cookie);
      [PreserveSig] int SetOptions(uint options);
      [PreserveSig] int GetOptions(out uint options);
      [PreserveSig] int SetDefaultFolder(IShellItem folder);
      [PreserveSig] int SetFolder(IShellItem folder);
      [PreserveSig] int GetFolder(out IShellItem folder);
      [PreserveSig] int GetCurrentSelection(out IShellItem item);
      [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
      [PreserveSig] int GetFileName(out IntPtr name);
      [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
      [PreserveSig] int SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
      [PreserveSig] int SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
      [PreserveSig] int GetResult(out IShellItem item);
      [PreserveSig] int AddPlace(IShellItem item, uint placement);
      [PreserveSig] int SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
      [PreserveSig] int Close(int result);
      [PreserveSig] int SetClientGuid(ref Guid guid);
      [PreserveSig] int ClearClientData();
      [PreserveSig] int SetFilter(IntPtr filter);
      [PreserveSig] int GetResults(out IntPtr items);
      [PreserveSig] int GetSelectedItems(out IntPtr items);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem {
      [PreserveSig] int BindToHandler(IntPtr bindContext, ref Guid handler, ref Guid interfaceId, out IntPtr result);
      [PreserveSig] int GetParent(out IShellItem parent);
      [PreserveSig] int GetDisplayName(uint kind, out IntPtr name);
      [PreserveSig] int GetAttributes(uint mask, out uint attributes);
      [PreserveSig] int Compare(IShellItem item, uint hint, out int order);
    }
  }
}
