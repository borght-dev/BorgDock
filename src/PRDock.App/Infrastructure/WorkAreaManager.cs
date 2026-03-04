using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PRDock.App.Infrastructure;

/// <summary>
/// Manages the Windows desktop work area, allowing the application to reserve
/// screen space on the left or right edge for its sidebar panel.
/// </summary>
public sealed class WorkAreaManager : IDisposable
{
    private const uint SPI_GETWORKAREA = 0x0030;
    private const uint SPI_SETWORKAREA = 0x002F;
    private const uint SPIF_SENDCHANGE = 0x0002;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref RECT pvParam, uint fWinIni);

    private RECT _originalWorkArea;
    private bool _hasReserved;
    private bool _disposed;

    private static readonly string StateDirectory =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PRDock");

    private static readonly string StateFilePath =
        Path.Combine(StateDirectory, "workarea.json");

    /// <summary>
    /// Win32 RECT structure used by SystemParametersInfo.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT : IEquatable<RECT>
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;

        public RECT(int left, int top, int right, int bottom)
        {
            Left = left;
            Top = top;
            Right = right;
            Bottom = bottom;
        }

        public bool Equals(RECT other) =>
            Left == other.Left && Top == other.Top && Right == other.Right && Bottom == other.Bottom;

        public override bool Equals(object? obj) => obj is RECT r && Equals(r);

        public override int GetHashCode() => HashCode.Combine(Left, Top, Right, Bottom);

        public static bool operator ==(RECT left, RECT right) => left.Equals(right);
        public static bool operator !=(RECT left, RECT right) => !left.Equals(right);

        public override string ToString() => $"RECT(Left={Left}, Top={Top}, Right={Right}, Bottom={Bottom})";
    }

    public WorkAreaManager()
    {
        TryRecoverFromCrash();
    }

    /// <summary>
    /// Gets the current desktop work area.
    /// </summary>
    public static RECT GetCurrentWorkArea()
    {
        var rect = new RECT();
        SystemParametersInfo(SPI_GETWORKAREA, 0, ref rect, 0);
        return rect;
    }

    /// <summary>
    /// Reserves space on the specified edge of the desktop work area.
    /// </summary>
    /// <param name="width">Width in pixels to reserve.</param>
    /// <param name="edge">"left" or "right".</param>
    /// <exception cref="ArgumentException">Thrown if edge is not "left" or "right".</exception>
    public void ReserveSpace(double width, string edge)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (edge is not ("left" or "right"))
        {
            throw new ArgumentException("Edge must be \"left\" or \"right\".", nameof(edge));
        }

        // Capture the original work area before first modification
        if (!_hasReserved)
        {
            _originalWorkArea = GetCurrentWorkArea();
        }

        var adjusted = _originalWorkArea;
        int widthPx = (int)Math.Round(width);

        switch (edge)
        {
            case "right":
                adjusted.Right -= widthPx;
                break;
            case "left":
                adjusted.Left += widthPx;
                break;
        }

        SetWorkArea(adjusted);
        _hasReserved = true;
        SaveState();
    }

    /// <summary>
    /// Restores the work area to its original dimensions before any reservation.
    /// </summary>
    public void RestoreWorkArea()
    {
        if (!_hasReserved)
        {
            return;
        }

        SetWorkArea(_originalWorkArea);
        _hasReserved = false;
        DeleteState();
    }

    /// <summary>
    /// Persists the current reservation state to disk for crash recovery.
    /// </summary>
    public void SaveState()
    {
        var state = new WorkAreaState
        {
            OriginalWorkArea = RectDto.FromRect(_originalWorkArea),
            HasReserved = _hasReserved
        };

        Directory.CreateDirectory(StateDirectory);
        string json = JsonSerializer.Serialize(state, WorkAreaJsonContext.Default.WorkAreaState);
        File.WriteAllText(StateFilePath, json);
    }

    /// <summary>
    /// Loads persisted reservation state from disk.
    /// </summary>
    /// <returns>The loaded state, or null if no state file exists.</returns>
    public static WorkAreaState? LoadState()
    {
        if (!File.Exists(StateFilePath))
        {
            return null;
        }

        try
        {
            string json = File.ReadAllText(StateFilePath);
            return JsonSerializer.Deserialize(json, WorkAreaJsonContext.Default.WorkAreaState);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Parses a RECT from individual integer components. Useful for testing.
    /// </summary>
    public static RECT CreateRect(int left, int top, int right, int bottom) =>
        new(left, top, right, bottom);

    private void TryRecoverFromCrash()
    {
        var state = LoadState();
        if (state is not { HasReserved: true })
        {
            return;
        }

        var currentWorkArea = GetCurrentWorkArea();
        var savedOriginal = state.OriginalWorkArea.ToRect();

        // If the current work area differs from the saved original, it likely
        // means a previous instance crashed without restoring. Restore now.
        if (currentWorkArea != savedOriginal)
        {
            _originalWorkArea = savedOriginal;
            _hasReserved = true;
            RestoreWorkArea();
        }
        else
        {
            // Work area is already at the original — just clean up the stale state file.
            DeleteState();
        }
    }

    private static void SetWorkArea(RECT rect)
    {
        SystemParametersInfo(SPI_SETWORKAREA, 0, ref rect, SPIF_SENDCHANGE);
    }

    private static void DeleteState()
    {
        try
        {
            if (File.Exists(StateFilePath))
            {
                File.Delete(StateFilePath);
            }
        }
        catch (IOException)
        {
            // Best-effort cleanup; ignore failures.
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_hasReserved)
        {
            RestoreWorkArea();
        }
    }
}

/// <summary>
/// Serializable DTO for persisting work area state to disk.
/// </summary>
public sealed class WorkAreaState
{
    public RectDto OriginalWorkArea { get; set; } = new();
    public bool HasReserved { get; set; }
}

/// <summary>
/// JSON-friendly representation of a RECT, since structs with fields
/// don't serialize cleanly with System.Text.Json source generators.
/// </summary>
public sealed class RectDto
{
    public int Left { get; set; }
    public int Top { get; set; }
    public int Right { get; set; }
    public int Bottom { get; set; }

    public static RectDto FromRect(WorkAreaManager.RECT rect) => new()
    {
        Left = rect.Left,
        Top = rect.Top,
        Right = rect.Right,
        Bottom = rect.Bottom
    };

    public WorkAreaManager.RECT ToRect() => new(Left, Top, Right, Bottom);
}

[JsonSerializable(typeof(WorkAreaState))]
internal partial class WorkAreaJsonContext : JsonSerializerContext;
