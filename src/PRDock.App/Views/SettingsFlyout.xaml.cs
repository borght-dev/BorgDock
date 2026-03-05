using System.Windows;
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
        {
            PatPasswordBox.Password = vm.PersonalAccessToken;
        }
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

    private void ManageWorktrees_Click(object sender, RoutedEventArgs e)
    {
        var window = Window.GetWindow(this);
        if (window?.DataContext is MainViewModel mainVm)
        {
            mainVm.ManageWorktreesCommand.Execute(null);
        }
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
