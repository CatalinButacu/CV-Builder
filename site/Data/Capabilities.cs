namespace Portfolio.Data;

// Proof entries are project slugs; anything else is shown as plain text.
public sealed record Capability(string Title, string Text, string[] Proof);

// The kinds of work shown on the home page, most important first.
public static class Capabilities
{
    public static readonly Capability[] All =
    [
        new("Generative AI & LLM applications",
            "RAG and agentic applications from retrieval to interface: hybrid dense and sparse search, reranking, grounding and safety layers, served behind an async API.",
            ["med-assist", "text2motion"]),
        new("Desktop & enterprise C++/Qt",
            "Production desktop software: Qt interfaces, networking, crash recovery and cloud sync inside a shipping product.",
            ["Gemini CAD Systems, 2022 to today"]),
        new("Computer vision at the edge",
            "Detection models quantised to INT8 and benchmarked on NPU and CPU hardware.",
            ["hand-gesture"]),
        new("ML & optimisation",
            "Classical ML pipelines and metaheuristic solvers, benchmarked and reproducible.",
            ["brain-age", "metaheuristics"]),
        new("ML for security",
            "Threat classification, and clustering that writes its own Snort rules.",
            ["smart-firewall"]),
    ];
}
