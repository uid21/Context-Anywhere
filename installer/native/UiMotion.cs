using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace ContextAnywhereSetup {
  // Wheel input alone is animated. Native scrollbar, keyboard and focus scrolling stay native.
  class SmoothScrollViewer : ScrollViewer {
    readonly Stopwatch wheelClock = new Stopwatch();
    double wheelStart, wheelTarget;
    ScrollViewer wheelViewer;
    bool scrolling;
    public double WheelDurationMilliseconds { get; set; }
    public SmoothScrollViewer() {
      WheelDurationMilliseconds = 180;
      Unloaded += (s,e) => CancelScroll();
      PreviewMouseDown += (s,e) => CancelScroll();
    }
    public void CancelScroll() {
      if (scrolling) CompositionTarget.Rendering -= RenderWheel;
      wheelTarget = wheelViewer == null ? VerticalOffset : wheelViewer.VerticalOffset;
      scrolling = false; wheelClock.Reset(); wheelViewer = null;
    }
    protected override void OnContentChanged(object oldContent, object newContent) {
      CancelScroll(); base.OnContentChanged(oldContent, newContent);
    }
    protected override void OnPreviewKeyDown(KeyEventArgs e) {
      CancelScroll(); base.OnPreviewKeyDown(e);
    }
    protected override void OnPreviewMouseWheel(MouseWheelEventArgs e) {
      if (e.Handled || Keyboard.Modifiers != ModifierKeys.None) { base.OnPreviewMouseWheel(e); return; }
      ScrollViewer viewer = this;
      var source = e.OriginalSource as DependencyObject;
      for (var node = source; node != null && node != this; node = UiMotion.Parent(node)) {
        var inner = node as ScrollViewer;
        var input = node as TextBox;
        if (inner == null && input != null && input.Template != null) inner = input.Template.FindName("PART_ContentHost",input) as ScrollViewer;
        if (inner != null && inner.ScrollableHeight > 0 && (e.Delta > 0 ? inner.VerticalOffset > 0.5 : inner.VerticalOffset < inner.ScrollableHeight - 0.5)) {
          // The nearest editor scrolls smoothly; once at its boundary, use its parent.
          viewer = inner; break;
        }
      }
      if (wheelViewer != null && wheelViewer != viewer) CancelScroll();
      double lines = SystemParameters.WheelScrollLines;
      if (lines == 0) { CancelScroll(); base.OnPreviewMouseWheel(e); return; }
      double delta = -e.Delta / 120.0 * (lines < 0 ? viewer.ViewportHeight : Math.Max(1, lines) * (viewer.CanContentScroll ? 1 : 22));
      if (delta == 0 || viewer.ScrollableHeight <= 0) { base.OnPreviewMouseWheel(e); return; }
      double basis = scrolling && Math.Sign(wheelTarget - viewer.VerticalOffset) == Math.Sign(delta) ? wheelTarget : viewer.VerticalOffset;
      double target = Math.Max(0, Math.Min(viewer.ScrollableHeight, basis + delta));
      if (Math.Abs(target - viewer.VerticalOffset) < 0.1) { base.OnPreviewMouseWheel(e); return; }
      e.Handled = true;
      if (!SystemParameters.ClientAreaAnimation) { CancelScroll(); viewer.ScrollToVerticalOffset(target); return; }
      wheelViewer = viewer; wheelStart = viewer.VerticalOffset; wheelTarget = target; wheelClock.Restart();
      if (!scrolling) { scrolling = true; CompositionTarget.Rendering += RenderWheel; }
    }
    void RenderWheel(object sender, EventArgs e) {
      var viewer = wheelViewer;
      if (!IsLoaded || viewer == null || !viewer.IsLoaded) { CancelScroll(); return; }
      if (!SystemParameters.ClientAreaAnimation) { double end = wheelTarget; CancelScroll(); viewer.ScrollToVerticalOffset(end); return; }
      double t = Math.Min(1, wheelClock.Elapsed.TotalMilliseconds / Math.Max(1, WheelDurationMilliseconds));
      double eased = 1 - Math.Pow(1 - t, 3);
      viewer.ScrollToVerticalOffset(Math.Max(0, Math.Min(viewer.ScrollableHeight, wheelStart + (wheelTarget - wheelStart) * eased)));
      if (t >= 1) CancelScroll();
    }
  }

  static class UiMotion {
    public static double ControlMilliseconds = 120, RevealMilliseconds = 180;
    sealed class RevealState {
      public bool Active, Show, Clip, HitTest;
      public int Generation;
      public Thickness Margin;
    }
    sealed class ControlState {
      public bool Pressed;
      public readonly Dictionary<string,double> Targets = new Dictionary<string,double>();
    }
    static readonly ConditionalWeakTable<FrameworkElement,RevealState> reveals = new ConditionalWeakTable<FrameworkElement,RevealState>();
    static readonly ConditionalWeakTable<Control,ControlState> controls = new ConditionalWeakTable<Control,ControlState>();
    internal static DependencyObject Parent(DependencyObject value) {
      if (value is Visual || value is System.Windows.Media.Media3D.Visual3D) return VisualTreeHelper.GetParent(value);
      return LogicalTreeHelper.GetParent(value);
    }
    public static void Reveal(FrameworkElement element, bool show) { Reveal(element, show, true); }
    static void Reveal(FrameworkElement element, bool show, bool animate) {
      if (element == null) return;
      RevealState state;
      if (!reveals.TryGetValue(element,out state)) {
        state = new RevealState{Margin=element.Margin,Clip=element.ClipToBounds,HitTest=element.IsHitTestVisible};
        reveals.Add(element,state);
        element.Unloaded += (s,e) => { if (state.Active) FinishReveal(element,state,state.Generation); };
      }
      if (!state.Active && (element.Visibility == Visibility.Visible) == show) return;
      double height = element.Visibility == Visibility.Visible ? element.ActualHeight : 0;
      double opacity = element.Visibility == Visibility.Visible ? element.Opacity : 0;
      Thickness margin = element.Visibility == Visibility.Visible ? element.Margin : new Thickness(state.Margin.Left,0,state.Margin.Right,0);
      int generation = ++state.Generation; state.Show = show;
      element.BeginAnimation(FrameworkElement.HeightProperty,null);
      element.BeginAnimation(UIElement.OpacityProperty,null);
      element.BeginAnimation(FrameworkElement.MarginProperty,null);
      if (!animate || !element.IsLoaded || !SystemParameters.ClientAreaAnimation) { FinishReveal(element,state,generation); return; }
      element.Visibility = Visibility.Visible; element.Height = Double.NaN; element.Margin = state.Margin;
      double width = element.ActualWidth;
      var parent = Parent(element) as FrameworkElement;
      if (width <= 0 && parent != null) width = Math.Max(0,parent.ActualWidth - state.Margin.Left - state.Margin.Right);
      element.Measure(new Size(width > 0 ? width : Double.PositiveInfinity,Double.PositiveInfinity));
      double fullHeight = Math.Max(0,element.DesiredSize.Height - state.Margin.Top - state.Margin.Bottom);
      element.Height = height; element.Opacity = opacity; element.Margin = margin;
      element.ClipToBounds = true; element.IsHitTestVisible = show && state.HitTest; state.Active = true;
      var time = TimeSpan.FromMilliseconds(RevealMilliseconds);
      var ease = new CubicEase{EasingMode=EasingMode.EaseOut};
      var size = new DoubleAnimation(height,show ? fullHeight : 0,time){EasingFunction=ease};
      size.Completed += (s,e) => FinishReveal(element,state,generation);
      element.BeginAnimation(FrameworkElement.HeightProperty,size,HandoffBehavior.SnapshotAndReplace);
      element.BeginAnimation(UIElement.OpacityProperty,new DoubleAnimation(opacity,show ? 1 : 0,time){EasingFunction=ease},HandoffBehavior.SnapshotAndReplace);
      element.BeginAnimation(FrameworkElement.MarginProperty,new ThicknessAnimation(margin,show ? state.Margin : new Thickness(state.Margin.Left,0,state.Margin.Right,0),time){EasingFunction=ease},HandoffBehavior.SnapshotAndReplace);
    }
    static void FinishReveal(FrameworkElement element, RevealState state, int generation) {
      if (generation != state.Generation) return;
      element.BeginAnimation(FrameworkElement.HeightProperty,null); element.Height = Double.NaN;
      element.BeginAnimation(UIElement.OpacityProperty,null); element.Opacity = 1;
      element.BeginAnimation(FrameworkElement.MarginProperty,null); element.Margin = state.Margin;
      element.ClipToBounds = state.Clip; element.IsHitTestVisible = state.HitTest;
      element.Visibility = state.Show ? Visibility.Visible : Visibility.Collapsed; state.Active = false;
    }
    public static void AttachTree(DependencyObject root) {
      var visited = new HashSet<DependencyObject>(); var pending = new Stack<DependencyObject>(); pending.Push(root);
      while (pending.Count > 0) {
        var node = pending.Pop(); if (node == null || !visited.Add(node)) continue;
        var control = node as Control; if (control != null) Attach(control);
        if (node is Visual || node is System.Windows.Media.Media3D.Visual3D)
          for (int i=0;i<VisualTreeHelper.GetChildrenCount(node);i++) pending.Push(VisualTreeHelper.GetChild(node,i));
        foreach (object child in LogicalTreeHelper.GetChildren(node)) { var dependency=child as DependencyObject; if(dependency!=null)pending.Push(dependency); }
      }
    }
    public static void Attach(Control control) {
      ControlState existing; if (control == null || controls.TryGetValue(control,out existing)) return;
      if (!(control is ButtonBase) && !(control is TextBox) && !(control is PasswordBox) && !(control is ComboBox) && !(control is ComboBoxItem) && !(control is Expander)) return;
      var state = new ControlState(); controls.Add(control,state);
      control.Loaded += (s,e) => Prepare(control,state);
      control.Unloaded += (s,e) => { state.Pressed=false; Update(control,state,false); };
      control.MouseEnter += (s,e) => Update(control,state,true);
      control.MouseLeave += (s,e) => Update(control,state,true);
      control.IsKeyboardFocusWithinChanged += (s,e) => Update(control,state,true);
      control.IsEnabledChanged += (s,e) => {if(!control.IsEnabled)state.Pressed=false;Update(control,state,true);};
      control.PreviewMouseLeftButtonDown += (s,e) => {state.Pressed=control.IsEnabled;Update(control,state,true);};
      control.PreviewMouseLeftButtonUp += (s,e) => {state.Pressed=false;Update(control,state,true);};
      control.LostMouseCapture += (s,e) => {state.Pressed=false;Update(control,state,true);};
      control.PreviewKeyDown += (s,e) => {if(e.Key==Key.Space||e.Key==Key.Enter){state.Pressed=true;Update(control,state,true);}};
      control.PreviewKeyUp += (s,e) => {state.Pressed=false;Update(control,state,true);};
      var toggle = control as ToggleButton;
      if(toggle!=null){toggle.Checked+=(s,e)=>Update(control,state,true);toggle.Unchecked+=(s,e)=>Update(control,state,true);toggle.Indeterminate+=(s,e)=>Update(control,state,true);}
      var item = control as ComboBoxItem;
      if(item!=null){item.Selected+=(s,e)=>Update(control,state,true);item.Unselected+=(s,e)=>Update(control,state,true);}
      var expander = control as Expander;
      if(expander!=null){expander.Expanded+=(s,e)=>{if(e.OriginalSource==control)Expand(expander,true,true);};expander.Collapsed+=(s,e)=>{if(e.OriginalSource==control)Expand(expander,false,true);};}
      var combo = control as ComboBox;
      if(combo!=null){combo.DropDownOpened+=(s,e)=>{
        Update(control,state,true);var popup=Part(control,"PART_Popup") as Popup;
        if(popup!=null&&popup.Child!=null){AttachTree(popup.Child);var content=popup.Child as FrameworkElement;if(content!=null)FadeIn(content);}
      };combo.DropDownClosed+=(s,e)=>Update(control,state,true);}
      if(control.IsLoaded)Prepare(control,state);
    }
    static FrameworkElement Part(Control control,string name) { return control.Template == null ? null : control.Template.FindName(name,control) as FrameworkElement; }
    static void Prepare(Control control,ControlState state) {
      control.ApplyTemplate();state.Targets.Clear();Update(control,state,false);
      var expander=control as Expander;if(expander!=null){Attach(Part(expander,"HeaderButton") as Control);Expand(expander,expander.IsExpanded,false);}
    }
    static void Expand(Expander expander,bool show,bool animate) {
      Reveal(Part(expander,"details"),show,animate);
      var chevron=Part(expander,"chevron");if(chevron==null)return;
      var rotation=chevron.RenderTransform as RotateTransform;if(rotation==null){rotation=new RotateTransform();chevron.RenderTransform=rotation;}
      if(rotation.IsFrozen){rotation=rotation.Clone();chevron.RenderTransform=rotation;}
      double from=rotation.Angle,to=show?90:0;rotation.BeginAnimation(RotateTransform.AngleProperty,null);rotation.Angle=to;
      if(animate&&expander.IsLoaded&&SystemParameters.ClientAreaAnimation)rotation.BeginAnimation(RotateTransform.AngleProperty,new DoubleAnimation(from,to,TimeSpan.FromMilliseconds(RevealMilliseconds)){EasingFunction=new CubicEase{EasingMode=EasingMode.EaseOut},FillBehavior=FillBehavior.Stop});
    }
    static void Update(Control control,ControlState state,bool animate) {
      var toggle=control as ToggleButton;var item=control as ComboBoxItem;var combo=control as ComboBox;
      bool selected=(toggle!=null&&toggle.IsChecked==true)||(item!=null&&item.IsSelected);
      Opacity(control,state,"MotionBody",control.IsEnabled?1:0.45,animate);
      Opacity(control,state,"MotionHover",control.IsMouseOver&&control.IsEnabled?0.08:0,animate);
      Opacity(control,state,"MotionFocus",control.IsKeyboardFocusWithin||(combo!=null&&combo.IsDropDownOpen)?1:control.IsMouseOver&&control.IsEnabled?0.5:0,animate);
      Opacity(control,state,"MotionPressed",state.Pressed&&control.IsEnabled?0.12:0,animate);
      Opacity(control,state,"MotionCheck",selected?1:0,animate);
    }
    static void Opacity(Control control,ControlState state,string name,double target,bool animate) {
      var part=Part(control,name);if(part==null)return;double old;if(state.Targets.TryGetValue(name,out old)&&old==target)return;state.Targets[name]=target;
      double from=part.Opacity;part.BeginAnimation(UIElement.OpacityProperty,null);part.Opacity=target;
      if(animate&&control.IsLoaded&&SystemParameters.ClientAreaAnimation)part.BeginAnimation(UIElement.OpacityProperty,new DoubleAnimation(from,target,TimeSpan.FromMilliseconds(ControlMilliseconds)){EasingFunction=new CubicEase{EasingMode=EasingMode.EaseOut},FillBehavior=FillBehavior.Stop});
    }
    public static void FadeIn(FrameworkElement element) {
      if(element==null)return;element.BeginAnimation(UIElement.OpacityProperty,null);element.Opacity=1;
      if(SystemParameters.ClientAreaAnimation)element.BeginAnimation(UIElement.OpacityProperty,new DoubleAnimation(0,1,TimeSpan.FromMilliseconds(ControlMilliseconds)){FillBehavior=FillBehavior.Stop});
    }
  }
}
