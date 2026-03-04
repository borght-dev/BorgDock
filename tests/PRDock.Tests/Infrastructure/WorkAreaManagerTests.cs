using System.Text.Json;
using FluentAssertions;
using PRDock.App.Infrastructure;

namespace PRDock.Tests.Infrastructure;

public class RectTests
{
    [Fact]
    public void Constructor_SetsFieldsCorrectly()
    {
        var rect = new WorkAreaManager.RECT(10, 20, 1920, 1080);

        rect.Left.Should().Be(10);
        rect.Top.Should().Be(20);
        rect.Right.Should().Be(1920);
        rect.Bottom.Should().Be(1080);
    }

    [Fact]
    public void Equality_SameValues_AreEqual()
    {
        var a = new WorkAreaManager.RECT(0, 0, 1920, 1080);
        var b = new WorkAreaManager.RECT(0, 0, 1920, 1080);

        a.Should().Be(b);
        (a == b).Should().BeTrue();
        a.Equals(b).Should().BeTrue();
        a.Equals((object)b).Should().BeTrue();
    }

    [Fact]
    public void Inequality_DifferentValues_AreNotEqual()
    {
        var a = new WorkAreaManager.RECT(0, 0, 1920, 1080);
        var b = new WorkAreaManager.RECT(0, 0, 1600, 900);

        a.Should().NotBe(b);
        (a != b).Should().BeTrue();
        (a == b).Should().BeFalse();
    }

    [Fact]
    public void Equals_WithNonRectObject_ReturnsFalse()
    {
        var rect = new WorkAreaManager.RECT(0, 0, 1920, 1080);

        rect.Equals("not a rect").Should().BeFalse();
        rect.Equals(null).Should().BeFalse();
    }

    [Fact]
    public void GetHashCode_SameValues_ProduceSameHash()
    {
        var a = new WorkAreaManager.RECT(0, 0, 1920, 1080);
        var b = new WorkAreaManager.RECT(0, 0, 1920, 1080);

        a.GetHashCode().Should().Be(b.GetHashCode());
    }

    [Fact]
    public void GetHashCode_DifferentValues_ProduceDifferentHash()
    {
        var a = new WorkAreaManager.RECT(0, 0, 1920, 1080);
        var b = new WorkAreaManager.RECT(10, 20, 1600, 900);

        // Not guaranteed, but overwhelmingly likely for these values
        a.GetHashCode().Should().NotBe(b.GetHashCode());
    }

    [Fact]
    public void ToString_FormatsCorrectly()
    {
        var rect = new WorkAreaManager.RECT(10, 20, 1920, 1080);

        rect.ToString().Should().Be("RECT(Left=10, Top=20, Right=1920, Bottom=1080)");
    }
}

public class RectDtoTests
{
    [Fact]
    public void FromRect_ThenToRect_PreservesValues()
    {
        var original = new WorkAreaManager.RECT(50, 100, 1870, 980);

        var dto = RectDto.FromRect(original);
        var roundtripped = dto.ToRect();

        roundtripped.Should().Be(original);
    }

    [Fact]
    public void FromRect_SetsAllProperties()
    {
        var rect = new WorkAreaManager.RECT(10, 20, 30, 40);

        var dto = RectDto.FromRect(rect);

        dto.Left.Should().Be(10);
        dto.Top.Should().Be(20);
        dto.Right.Should().Be(30);
        dto.Bottom.Should().Be(40);
    }

    [Fact]
    public void ToRect_SetsAllFields()
    {
        var dto = new RectDto { Left = 5, Top = 15, Right = 1900, Bottom = 1060 };

        var rect = dto.ToRect();

        rect.Left.Should().Be(5);
        rect.Top.Should().Be(15);
        rect.Right.Should().Be(1900);
        rect.Bottom.Should().Be(1060);
    }
}

public class WorkAreaStateTests
{
    [Fact]
    public void JsonSerializationRoundtrip_PreservesValues()
    {
        var state = new WorkAreaState
        {
            OriginalWorkArea = new RectDto { Left = 0, Top = 0, Right = 1920, Bottom = 1040 },
            HasReserved = true
        };

        var json = JsonSerializer.Serialize(state);
        var deserialized = JsonSerializer.Deserialize<WorkAreaState>(json);

        deserialized.Should().NotBeNull();
        deserialized!.HasReserved.Should().BeTrue();
        deserialized.OriginalWorkArea.Left.Should().Be(0);
        deserialized.OriginalWorkArea.Top.Should().Be(0);
        deserialized.OriginalWorkArea.Right.Should().Be(1920);
        deserialized.OriginalWorkArea.Bottom.Should().Be(1040);
    }

    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var state = new WorkAreaState();

        state.HasReserved.Should().BeFalse();
        state.OriginalWorkArea.Should().NotBeNull();
        state.OriginalWorkArea.Left.Should().Be(0);
        state.OriginalWorkArea.Top.Should().Be(0);
        state.OriginalWorkArea.Right.Should().Be(0);
        state.OriginalWorkArea.Bottom.Should().Be(0);
    }
}

public class CreateRectTests
{
    [Fact]
    public void CreateRect_ReturnsCorrectRect()
    {
        var rect = WorkAreaManager.CreateRect(10, 20, 1920, 1080);

        rect.Left.Should().Be(10);
        rect.Top.Should().Be(20);
        rect.Right.Should().Be(1920);
        rect.Bottom.Should().Be(1080);
    }

    [Fact]
    public void CreateRect_MatchesConstructor()
    {
        var fromCreate = WorkAreaManager.CreateRect(5, 10, 15, 20);
        var fromCtor = new WorkAreaManager.RECT(5, 10, 15, 20);

        fromCreate.Should().Be(fromCtor);
    }
}
