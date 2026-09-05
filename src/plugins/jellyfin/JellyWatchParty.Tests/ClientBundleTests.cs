using JellyWatchParty.Plugin.Controllers;
using Xunit;

namespace JellyWatchParty.Plugin.Tests;

public class ClientBundleTests
{
    [Fact]
    public void ServedScriptContainsOrderedModulesWithoutNetworkLoader()
    {
        var (script, etag) = JellyWatchPartyController.LoadScriptFromResource();
        Assert.DoesNotContain("/* JWP_BUNDLED_MODULES */", script);
        Assert.DoesNotContain("loadScript(", script);
        Assert.Contains("const start = () => JWP.app.init();", script);
        Assert.Contains("DOMContentLoaded", script);
        Assert.True(script.IndexOf("// Client module: state.js", StringComparison.Ordinal)
            < script.IndexOf("// Client module: app/lifecycle.js", StringComparison.Ordinal));
        Assert.Contains("Connecting to room…", script);
        Assert.Contains("Wait until the owner of the room picks a title.", script);
        Assert.StartsWith("\"", etag);
        Assert.Equal(etag, JellyWatchPartyController.LoadScriptFromResource().ETag);
    }
}
