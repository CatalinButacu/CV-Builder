// Static site generator: renders the Razor pages in Pages/ to plain HTML files,
// which GitHub Pages serves as they are. The browser downloads finished pages
// and no .NET runtime, which is what keeps the site fast.
//
//   dotnet run                                  build into dist/
//   dotnet run -- --base /CV-Builder/ --site https://example.github.io --out ../publish
//
// Run it from the site/ folder.

using System.Text;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Portfolio;
using Portfolio.Data;
using Portfolio.Pages;

string? Arg(string name)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}

var root = Directory.GetCurrentDirectory();
if (!File.Exists(Path.Combine(root, "Portfolio.csproj")))
{
    Console.Error.WriteLine($"Portfolio.csproj not found in {root}. Run this from the site/ folder.");
    return 1;
}

var assets = Path.Combine(root, "wwwroot");
var outDir = Path.GetFullPath(Arg("--out") ?? "dist");
Site.Base = "/" + (Arg("--base") ?? "/").Trim('/') + "/";
if (Site.Base == "//") Site.Base = "/";
Site.Origin = (Arg("--site") ?? "https://catalinbutacu.github.io").TrimEnd('/');
Site.Css = Bundle.Css(Path.Combine(assets, "css"));
Site.ThemeScript = File.ReadAllText(Path.Combine(assets, "js", "theme.js"));

const string Name = "Cătălin Butacu";
var pages = new List<PageSpec>
{
    new("", typeof(Home), [], $"{Name} · ML & Software Engineer", Profile.Person.Summary),
    new("projects/", typeof(Projects), [], $"Projects · {Name}",
        "Machine learning, generative AI, computer vision, security and optimisation projects, each with public source code."),
    new("about/", typeof(About), [], $"About · {Name}",
        "Professional experience, tech stack, education, certifications and volunteering."),
    new("404.html", typeof(NotFound), [], $"Page not found · {Name}", "That page does not exist."),
};
foreach (var project in ProjectCatalog.All)
{
    pages.Add(new($"projects/{project.Slug}/", typeof(ProjectPage), new() { ["Slug"] = project.Slug },
        $"{project.Title} · {Name}", project.Summary));
}

// Only wipe the output when it is clearly a build folder of this project.
if (Directory.Exists(outDir) && Path.GetFileName(outDir) is "dist" or "publish")
    Directory.Delete(outDir, recursive: true);
Directory.CreateDirectory(outDir);

foreach (var page in pages)
{
    // Each page gets its own renderer, so NavLink sees that page's address and marks the right link.
    // There is no web host here, so the renderer gets a small container of its own.
#pragma warning disable ASP0000
    var services = new ServiceCollection()
        .AddLogging()
        .AddSingleton<NavigationManager>(new StaticNavigation(Site.Origin + Site.Base, Site.Origin + Site.Base + page.Path))
        .BuildServiceProvider();
#pragma warning restore ASP0000
    await using var renderer = new HtmlRenderer(services, services.GetRequiredService<ILoggerFactory>());
    var html = await renderer.Dispatcher.InvokeAsync(async () =>
    {
        var parameters = ParameterView.FromDictionary(new Dictionary<string, object?> { ["Spec"] = page });
        return (await renderer.RenderComponentAsync<Root>(parameters)).ToHtmlString();
    });

    var file = Path.Combine(outDir, page.Path.EndsWith('/') || page.Path == "" ? page.Path + "index.html" : page.Path);
    Directory.CreateDirectory(Path.GetDirectoryName(file)!);
    File.WriteAllText(file, html, new UTF8Encoding(false));
    Console.WriteLine($"  {Path.GetRelativePath(outDir, file),-44} {html.Length / 1024.0,6:F1} KB");
}

// Static files: fonts, images, the background script. The stylesheets and the
// theme script are already inside every page.
foreach (var source in Directory.EnumerateFiles(assets, "*", SearchOption.AllDirectories))
{
    var relative = Path.GetRelativePath(assets, source).Replace('\\', '/');
    if (relative.StartsWith("css/") || relative == "js/theme.js") continue;
    var target = Path.Combine(outDir, relative);
    Directory.CreateDirectory(Path.GetDirectoryName(target)!);
    File.Copy(source, target, overwrite: true);
}

// For search engines.
var listed = pages.Where(p => p.Path != "404.html").Select(p => $"  <url><loc>{Site.Origin}{Site.Base}{p.Path}</loc></url>");
File.WriteAllText(Path.Combine(outDir, "sitemap.xml"),
    $"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{string.Join("\n", listed)}\n</urlset>\n");
File.WriteAllText(Path.Combine(outDir, "robots.txt"), $"User-agent: *\nAllow: /\n\nSitemap: {Site.Origin}{Site.Base}sitemap.xml\n");

Console.WriteLine($"Built {pages.Count} pages into {outDir}");
return 0;
