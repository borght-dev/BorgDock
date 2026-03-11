using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;
using WpfUserControl = System.Windows.Controls.UserControl;

namespace PRDock.App.Views;

public partial class SettingsFlyout : WpfUserControl
{
    public SettingsFlyout()
    {
        InitializeComponent();
        DataContextChanged += OnDataContextChanged;
        PatPasswordBox.PasswordChanged += PatPasswordBox_PasswordChanged;
    }

    private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (e.OldValue is SettingsViewModel oldVm)
        {
            oldVm.PropertyChanged -= Vm_PropertyChanged;
        }

        if (e.NewValue is SettingsViewModel newVm)
        {
            newVm.PropertyChanged += Vm_PropertyChanged;
            SyncPasswordBox(newVm);
        }
    }

    private void Vm_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(SettingsViewModel.PersonalAccessToken) && sender is SettingsViewModel vm)
        {
            SyncPasswordBox(vm);
        }
    }

    private void SyncPasswordBox(SettingsViewModel vm)
    {
        if (PatPasswordBox.Password != vm.PersonalAccessToken)
            PatPasswordBox.Password = vm.PersonalAccessToken;

        if (AdoPatPasswordBox.Password != vm.AdoPersonalAccessToken)
            AdoPatPasswordBox.Password = vm.AdoPersonalAccessToken;
    }

    private void PatPasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is not SettingsViewModel vm)
            return;

        if (vm.PersonalAccessToken != PatPasswordBox.Password)
        {
            vm.PersonalAccessToken = PatPasswordBox.Password;
        }
    }

    private void AdoPatPasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is not SettingsViewModel vm) return;
        if (vm.AdoPersonalAccessToken != AdoPatPasswordBox.Password)
            vm.AdoPersonalAccessToken = AdoPatPasswordBox.Password;
    }

    private void ManageWorktrees_Click(object sender, RoutedEventArgs e)
    {
        var window = Window.GetWindow(this);
        if (window?.DataContext is MainViewModel mainVm)
        {
            mainVm.ManageWorktreesCommand.Execute(null);
        }
    }

    private void HotkeyTextBox_GotFocus(object sender, RoutedEventArgs e)
    {
        if (DataContext is SettingsViewModel vm)
            vm.IsRecordingHotkey = true;
    }

    private void HotkeyTextBox_LostFocus(object sender, RoutedEventArgs e)
    {
        if (DataContext is SettingsViewModel vm)
            vm.IsRecordingHotkey = false;
    }

    private void HotkeyTextBox_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        e.Handled = true;

        if (DataContext is not SettingsViewModel vm || !vm.IsRecordingHotkey)
            return;

        // Resolve the actual key (handle system keys like Alt+X)
        var key = e.Key == Key.System ? e.SystemKey : e.Key;

        // Ignore lone modifier presses
        if (key is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt
            or Key.LeftShift or Key.RightShift or Key.LWin or Key.RWin)
            return;

        // Escape cancels recording
        if (key == Key.Escape)
        {
            vm.CancelHotkeyRecording();
            return;
        }

        // Build the hotkey string from current modifiers + key
        var modifiers = Keyboard.Modifiers;
        var parts = new System.Collections.Generic.List<string>();

        if (modifiers.HasFlag(ModifierKeys.Control)) parts.Add("Ctrl");
        if (modifiers.HasFlag(ModifierKeys.Alt)) parts.Add("Alt");
        if (modifiers.HasFlag(ModifierKeys.Shift)) parts.Add("Shift");
        if (modifiers.HasFlag(ModifierKeys.Windows)) parts.Add("Win");

        // Require at least one modifier
        if (parts.Count == 0)
            return;

        parts.Add(key.ToString());
        vm.ApplyRecordedHotkey(string.Join("+", parts));
    }

    private void BrowseWorktreePath_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is not SettingsViewModel vm || vm.SelectedRepository is null) return;

        var dialog = new Microsoft.Win32.OpenFolderDialog
        {
            Title = "Select worktree base path"
        };

        if (dialog.ShowDialog() == true)
        {
            vm.SelectedRepository.WorktreeBasePath = dialog.FolderName;
        }
    }
}
