namespace Portfolio.Data;

public sealed record Project(
    string Slug,
    string Title,
    string Kind,
    string Year,
    int StartYear,
    string Summary,
    string[] Stack,
    string Repo,
    string Figure,
    string FigureLabel,
    bool InProgress = false);

// Mirrors the Projects section of resume.tex in the repo root.
public static class ProjectCatalog
{
    public static readonly Project[] All =
    [
        new("text2motion", "Real-Time Generative Motion Modeling on SMPL-X", "MSc dissertation", "2026", 2026,
            "A Residual-FSQ tokenizer and a token-autoregressive S6/Mamba generator for bounded-memory streaming.",
            ["Python", "SMPL-X", "Residual-FSQ", "S6/Mamba", "GloVe"],
            "https://github.com/CatalinButacu/GenAI-Text2Motion",
            "Real-time", "text-to-motion on SMPL-X, in bounded memory", InProgress: true),
        new("smart-firewall", "IDS/IPS Smart Firewall", "Team project", "2026", 2026,
            "Collaborative intelligent firewall with a CNN threat classifier, an RL adversarial agent and a DBSCAN module that auto-generates Snort rules.",
            ["CNN", "Reinforcement Learning", "DBSCAN", "Snort", "Ubuntu Server", "Kali Linux"],
            "https://github.com/CatalinButacu/IDS-CyberSentinel",
            "3 models", "a CNN classifier, an RL adversary and a DBSCAN rule writer"),
        new("hand-gesture", "Hand Gesture Recognition", "Edge ML", "2025", 2025,
            "YOLOv5n gesture detector quantised to TFLite INT8, developed and benchmarked on Android for NXP i.MX.",
            ["YOLOv5n", "TensorFlow", "TFLite INT8", "HaGRID", "Android", "NXP i.MX"],
            "https://github.com/TUIASI-AC-CTI/edge-computing-applications-benexus/",
            "INT8", "quantised YOLOv5n, benchmarked on NXP i.MX"),
        new("med-assist", "Med Assist — Romanian Pharmacy AI Assistant", "RAG application", "2025–2026", 2025,
            "Full-stack RAG chatbot over the official Romanian ANMDM drug registry (7,555 entries) with hybrid retrieval.",
            ["React", "TypeScript", "FastAPI", "Postgres", "FAISS", "BM25", "Gemini", "Auth0", "Docker", "Terraform", "pytest"],
            "https://github.com/CatalinButacu/General-Medical-Assistant",
            "7,555", "official drug registry entries, answerable by chat"),
        new("metaheuristics", "Metaheuristic Framework", "Library", "2025", 2025,
            "Python library of genetic algorithms, differential evolution and random search, benchmarked on standard test functions.",
            ["Python", "Genetic Algorithms", "Differential Evolution", "Random Search"],
            "https://github.com/CatalinButacu/OCS_FRAMEWORK",
            "4 solvers", "benchmarked on standard test functions"),
        new("brain-age", "fMRI Brain-Age Prediction", "Competition", "2025", 2025,
            "Gender-stratified ElasticNet pipeline on ~20k fMRI features; ranked 8th nationally at the WiDS Datathon 2025 University Edition.",
            ["ElasticNet", "Spectral feature selection", "fMRI"],
            "https://github.com/CatalinButacu/WiDS-Datathon2025-University",
            "8th", "nationally, WiDS Datathon 2025"),
    ];

    public static Project? Find(string slug) => All.FirstOrDefault(project => project.Slug == slug);
}
