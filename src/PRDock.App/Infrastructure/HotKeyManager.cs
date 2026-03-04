using System.Runtime.InteropServices;
using System.Windows.Input;
using System.Windows.Interop;

namespace PRDock.App.Infrastructure;

/// <summary>
/// Manages global hotkey registration and detection via Win32 RegisterHotKey/UnregisterHotKey.
/// </summary>
public sealed class HotKeyManager : IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const int HotkeyId = 9000;

    // Modifier flag constants
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint MOD_WIN = 0x0008;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private IntPtr _hWnd;
    private HwndSource? _hwndSource;
    private bool _registered;
    private bool _disposed;

    /// <summary>
    /// Fires when the registered hotkey is pressed.
    /// </summary>
    public event Action? HotKeyPressed;

    /// <summary>
    /// Registers a global hotkey parsed from a string such as "Ctrl+Win+Shift+G".
    /// </summary>
    /// <param name="hWnd">Window handle to associate the hotkey with.</param>
    /// <param name="hotkeyString">Hotkey descriptor, e.g. "Ctrl+Win+Shift+G".</param>
    /// <returns>True if the hotkey was successfully registered.</returns>
    public bool RegisterHotKey(IntPtr hWnd, string hotkeyString)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (_registered)
        {
            UnregisterHotKey(hWnd);
        }

        _hWnd = hWnd;

        // Attach the WndProc hook via HwndSource
        _hwndSource = HwndSource.FromHwnd(hWnd);
        _hwndSource?.AddHook(WndProc);

        var (modifiers, vk) = ParseHotkeyString(hotkeyString);

        _registered = RegisterHotKey(hWnd, HotkeyId, modifiers, vk);

        if (!_registered)
        {
            _hwndSource?.RemoveHook(WndProc);
            _hwndSource = null;
        }

        return _registered;
    }

    /// <summary>
    /// Unregisters the current hotkey and removes the message hook.
    /// </summary>
    /// <param name="hWnd">Window handle the hotkey was registered with.</param>
    public void UnregisterHotKey(IntPtr hWnd)
    {
        if (_registered)
        {
            UnregisterHotKey(hWnd, HotkeyId);
            _registered = false;
        }

        if (_hwndSource is not null)
        {
            _hwndSource.RemoveHook(WndProc);
            _hwndSource = null;
        }
    }

    /// <summary>
    /// Parses a hotkey string like "Ctrl+Win+Shift+G" into Win32 modifier flags and a virtual key code.
    /// </summary>
    /// <param name="hotkey">Hotkey descriptor string.</param>
    /// <returns>A tuple of (modifiers, virtualKeyCode).</returns>
    /// <exception cref="ArgumentException">Thrown when the hotkey string is empty or contains no key part.</exception>
    public static (uint modifiers, uint vk) ParseHotkeyString(string hotkey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(hotkey);

        var parts = hotkey.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (parts.Length == 0)
        {
            throw new ArgumentException("Hotkey string must contain at least a key.", nameof(hotkey));
        }

        uint modifiers = 0;
        string? keyPart = null;

        foreach (var part in parts)
        {
            switch (part.ToUpperInvariant())
            {
                case "CTRL":
                case "CONTROL":
                    modifiers |= MOD_CONTROL;
                    break;
                case "ALT":
                    modifiers |= MOD_ALT;
                    break;
                case "SHIFT":
                    modifiers |= MOD_SHIFT;
                    break;
                case "WIN":
                case "WINDOWS":
                    modifiers |= MOD_WIN;
                    break;
                default:
                    keyPart = part;
                    break;
            }
        }

        if (keyPart is null)
        {
            throw new ArgumentException("Hotkey string must contain a non-modifier key.", nameof(hotkey));
        }

        uint vk = ResolveVirtualKey(keyPart);

        return (modifiers, vk);
    }

    private static uint ResolveVirtualKey(string keyName)
    {
        // Try to parse as a WPF Key enum value first
        if (Enum.TryParse<Key>(keyName, ignoreCase: true, out var wpfKey))
        {
            int vk = KeyInterop.VirtualKeyFromKey(wpfKey);
            if (vk != 0)
            {
                return (uint)vk;
            }
        }

        // Fallback: single character maps to its ASCII/VK value (A-Z, 0-9)
        if (keyName.Length == 1)
        {
            char c = char.ToUpperInvariant(keyName[0]);
            if (c is >= 'A' and <= 'Z' or >= '0' and <= '9')
            {
                return c;
            }
        }

        // Fallback: function keys like F1-F24
        if (keyName.StartsWith('F') && int.TryParse(keyName.AsSpan(1), out int fNum) && fNum is >= 1 and <= 24)
        {
            // VK_F1 = 0x70
            return (uint)(0x70 + fNum - 1);
        }

        throw new ArgumentException($"Unable to resolve virtual key for '{keyName}'.");
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == HotkeyId)
        {
            HotKeyPressed?.Invoke();
            handled = true;
        }

        return IntPtr.Zero;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_registered)
        {
            UnregisterHotKey(_hWnd);
        }
    }
}
