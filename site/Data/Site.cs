using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Components;

namespace Portfolio.Data;

// One page to generate: where it goes, which component it is, and its title and description.
public sealed record PageSpec(string Path, Type Component, Dictionary<string, object?> Parameters, string Title, string Description);

// Set once by Program.cs before any page is rendered.
public static class Site
{
    // The path the site is served under: "/" locally, "/CV-Builder/" on GitHub Pages.
    public static string Base { get; set; } = "/";

    // Scheme and host, without a trailing slash.
    public static string Origin { get; set; } = "";

    // Every stylesheet, joined and minified, placed inside each page.
    public static string Css { get; set; } = "";

    // js/theme.js, placed inside each page so the saved theme applies before first paint.
    public static string ThemeScript { get; set; } = "";

    // The colour palettes, in rotation order. Each has a file in wwwroot/css/palettes.
    public static readonly string[] Palettes =
    [
        "cobalt-magenta", "violet-cyan", "emerald-indigo", "tangerine-fuchsia", "crimson-amber", "teal-coral",
    ];
}

// The pages are rendered without a browser, so there is nowhere to navigate.
// NavLink still needs to know which address is being rendered to mark the current link.
public sealed class StaticNavigation : NavigationManager
{
    public StaticNavigation(string baseUri, string uri) => Initialize(baseUri, uri);

    protected override void NavigateToCore(string uri, bool forceLoad) { }
}

public static partial class Bundle
{
    // The stylesheets after the tokens and palettes, in the order they must cascade.
    private static readonly string[] Sheets =
    [
        "base.css",
        "components/backdrop.css",
        "components/helpers.css",
        "components/surface.css",
        "components/buttons.css",
        "components/badges.css",
        "components/section.css",
        "components/project-card.css",
        "components/header.css",
        "components/footer.css",
        "components/project-page.css",
        "components/about.css",
        "components/theme-menu.css",
        "components/hero.css",
        "components/text-link.css",
        "components/proof.css",
        "components/experience.css",
        "components/capabilities.css",
        "components/contact.css",
    ];

    // Joins the stylesheets in dependency order and strips what a browser does not need.
    public static string Css(string folder)
    {
        var files = new List<string> { Path.Combine(folder, "tokens.css") };
        files.AddRange(Site.Palettes.Select(name => Path.Combine(folder, "palettes", name + ".css")));
        files.AddRange(Sheets.Select(name => Path.Combine(folder, name)));

        var css = string.Join("\n", files.Select(File.ReadAllText));
        css = Comments().Replace(css, "");
        css = Whitespace().Replace(css, " ");
        css = AroundBraces().Replace(css, "$1");
        return css.Trim();
    }

    [GeneratedRegex(@"/\*.*?\*/", RegexOptions.Singleline)]
    private static partial Regex Comments();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    // Spaces around braces and semicolons are never significant. Those around
    // colons, commas and operators can be, so they are left alone.
    [GeneratedRegex(@"\s*([{};])\s*")]
    private static partial Regex AroundBraces();
}
