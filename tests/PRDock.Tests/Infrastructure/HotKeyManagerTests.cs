using FluentAssertions;
using PRDock.App.Infrastructure;

namespace PRDock.Tests.Infrastructure;

public class HotKeyManagerTests
{
    // Modifier constants (mirrors the private constants in HotKeyManager)
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint MOD_WIN = 0x0008;

    [Fact]
    public void ParseHotkeyString_CtrlWinShiftG_ReturnsCorrectModifiersAndVk()
    {
        var (modifiers, vk) = HotKeyManager.ParseHotkeyString("Ctrl+Win+Shift+G");

        modifiers.Should().Be(MOD_CONTROL | MOD_WIN | MOD_SHIFT); // 0x000E
        vk.Should().Be(0x47u); // 'G'
    }

    [Fact]
    public void ParseHotkeyString_CtrlWinShiftG_ModifiersEqual0x000E()
    {
        var (modifiers, _) = HotKeyManager.ParseHotkeyString("Ctrl+Win+Shift+G");

        modifiers.Should().Be(0x000Eu);
    }

    [Fact]
    public void ParseHotkeyString_AltF1_ReturnsCorrectModifiersAndVk()
    {
        var (modifiers, vk) = HotKeyManager.ParseHotkeyString("Alt+F1");

        modifiers.Should().Be(MOD_ALT);
        vk.Should().Be(0x70u); // VK_F1
    }

    [Fact]
    public void ParseHotkeyString_CtrlShiftA_ReturnsCorrectModifiersAndVk()
    {
        var (modifiers, vk) = HotKeyManager.ParseHotkeyString("Ctrl+Shift+A");

        modifiers.Should().Be(MOD_CONTROL | MOD_SHIFT);
        vk.Should().Be(0x41u); // 'A'
    }

    [Fact]
    public void ParseHotkeyString_SingleLetterKey_ReturnsNoModifiers()
    {
        var (modifiers, vk) = HotKeyManager.ParseHotkeyString("Z");

        modifiers.Should().Be(0u);
        vk.Should().Be(0x5Au); // 'Z'
    }

    [Fact]
    public void ParseHotkeyString_ControlAlias_Works()
    {
        var (modifiers, _) = HotKeyManager.ParseHotkeyString("Control+A");

        modifiers.Should().Be(MOD_CONTROL);
    }

    [Fact]
    public void ParseHotkeyString_WindowsAlias_Works()
    {
        var (modifiers, _) = HotKeyManager.ParseHotkeyString("Windows+A");

        modifiers.Should().Be(MOD_WIN);
    }

    [Fact]
    public void ParseHotkeyString_FunctionKeys_F1Through_ReturnCorrectVk()
    {
        var (_, vkF1) = HotKeyManager.ParseHotkeyString("F1");
        var (_, vkF12) = HotKeyManager.ParseHotkeyString("F12");

        vkF1.Should().Be(0x70u);  // VK_F1
        vkF12.Should().Be(0x7Bu); // VK_F12
    }

    [Fact]
    public void ParseHotkeyString_EmptyString_ThrowsArgumentException()
    {
        var act = () => HotKeyManager.ParseHotkeyString("");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void ParseHotkeyString_Null_ThrowsArgumentException()
    {
        var act = () => HotKeyManager.ParseHotkeyString(null!);

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void ParseHotkeyString_WhitespaceOnly_ThrowsArgumentException()
    {
        var act = () => HotKeyManager.ParseHotkeyString("   ");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void ParseHotkeyString_OnlyModifiers_ThrowsArgumentException()
    {
        var act = () => HotKeyManager.ParseHotkeyString("Ctrl+Shift");

        act.Should().Throw<ArgumentException>()
            .Which.Message.Should().Contain("non-modifier key");
    }

    [Fact]
    public void ParseHotkeyString_OnlySingleModifier_ThrowsArgumentException()
    {
        var act = () => HotKeyManager.ParseHotkeyString("Alt");

        act.Should().Throw<ArgumentException>()
            .Which.Message.Should().Contain("non-modifier key");
    }

    [Fact]
    public void ParseHotkeyString_CaseInsensitive_Works()
    {
        var (modifiers1, vk1) = HotKeyManager.ParseHotkeyString("ctrl+shift+g");
        var (modifiers2, vk2) = HotKeyManager.ParseHotkeyString("CTRL+SHIFT+G");

        modifiers1.Should().Be(modifiers2);
        vk1.Should().Be(vk2);
    }

    [Fact]
    public void ParseHotkeyString_AllModifiers_ReturnsAllFlags()
    {
        var (modifiers, _) = HotKeyManager.ParseHotkeyString("Ctrl+Alt+Shift+Win+A");

        modifiers.Should().Be(MOD_CONTROL | MOD_ALT | MOD_SHIFT | MOD_WIN);
    }

    [Fact]
    public void ParseHotkeyString_DigitKey_ReturnsNonZeroVk()
    {
        var (modifiers, vk) = HotKeyManager.ParseHotkeyString("Ctrl+1");

        modifiers.Should().Be(MOD_CONTROL);
        // '1' is resolved through WPF Key enum (D1), so just verify it produces a valid key
        vk.Should().BeGreaterThan(0u);
    }
}
