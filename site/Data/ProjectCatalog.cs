namespace Portfolio.Data;

public sealed record Project(string Title, string Year, string Summary, string Repo);

// Mirrors the Projects section of resume.tex in the repo root.
public static class ProjectCatalog
{
    public static readonly Project[] All =
    [
        new("Real-Time Generative Motion Modeling on SMPL-X", "2026",
            "MSc dissertation: a Residual-FSQ tokenizer and a token-autoregressive S6/Mamba generator for bounded-memory streaming.",
            "https://github.com/CatalinButacu/GenAI-Text2Motion"),
        new("IDS/IPS Smart Firewall", "2026",
            "Collaborative intelligent firewall with a CNN threat classifier, an RL adversarial agent and a DBSCAN module that auto-generates Snort rules.",
            "https://github.com/CatalinButacu/IDS-CyberSentinel"),
        new("Hand Gesture Recognition", "2025",
            "YOLOv5n gesture detector quantised to TFLite INT8, developed and benchmarked on Android for NXP i.MX.",
            "https://github.com/TUIASI-AC-CTI/edge-computing-applications-benexus/"),
        new("Med Assist — Romanian Pharmacy AI Assistant", "2025–2026",
            "Full-stack RAG chatbot over the official Romanian ANMDM drug registry (7,555 entries) with hybrid retrieval.",
            "https://github.com/CatalinButacu/General-Medical-Assistant"),
        new("Metaheuristic Framework", "2025",
            "Python library of genetic algorithms, differential evolution and random search, benchmarked on standard test functions.",
            "https://github.com/CatalinButacu/OCS_FRAMEWORK"),
        new("fMRI Brain-Age Prediction", "2025",
            "Gender-stratified ElasticNet pipeline on ~20k fMRI features; ranked 8th nationally at the WiDS Datathon 2025 University Edition.",
            "https://github.com/CatalinButacu/WiDS-Datathon2025-University"),
    ];
}
