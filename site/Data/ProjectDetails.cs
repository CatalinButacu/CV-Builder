namespace Portfolio.Data;

public sealed record ProjectSection(string Heading, string[] Points);

public sealed record ProjectDetail(string Intro, ProjectSection[] Sections);

// Long-form write-ups for the project pages, keyed by Project.Slug.
// Mirrors the Projects section of resume.tex in the repo root.
public static class ProjectDetails
{
    private static readonly Dictionary<string, ProjectDetail> BySlug = new()
    {
        ["text2motion"] = new(
            "A real-time generative human motion modeling pipeline on SMPL-X, built as my MSc dissertation.",
            [
                new("Core contributions",
                [
                    "A Residual-FSQ tokenizer that outperforms MoMask.",
                    "A token-autoregressive S6/Mamba generator for bounded-memory streaming.",
                ]),
                new("How it is built",
                [
                    "Modular Python training and inference stack.",
                    "Differentiable soft-decode losses.",
                    "GloVe text encoding.",
                    "Live SMPL-X visualization.",
                ]),
            ]),
        ["smart-firewall"] = new(
            "A collaborative intelligent firewall system featuring a CNN threat classifier and an RL adversarial agent, deployed on Ubuntu Server and Kali Linux.",
            [
                new("My contribution",
                [
                    "System architecture.",
                    "Snort rule configuration.",
                    "A DBSCAN clustering module that analyzes runtime payloads to auto-generate rules, reducing ML inference load.",
                ]),
            ]),
        ["hand-gesture"] = new(
            "A YOLOv5n object-detection pipeline for hand gesture recognition, trained on the HaGRID dataset.",
            [
                new("Edge deployment",
                [
                    "TensorFlow workflow optimised for NPU/CPU deployment via TFLite INT8 quantisation.",
                    "Developed and benchmarked on Android OS for NXP i.MX.",
                ]),
                new("Reducing false positives",
                [
                    "CLAHE contrast preprocessing.",
                    "Temporal smoothing across frames.",
                ]),
            ]),
        ["med-assist"] = new(
            "A full-stack RAG chatbot over the Romanian official ANMDM drug registry, covering 7,555 entries.",
            [
                new("Hybrid retrieval feeding Google Gemini",
                [
                    "FAISS dense embeddings.",
                    "BM25 sparse search.",
                    "A cross-encoder reranker.",
                ]),
                new("Grounding and safety",
                [
                    "Prompt templates, evaluation checks and a tool-routing safety layer that ground recommendations in verified data.",
                ]),
                new("Stack",
                [
                    "React + TypeScript frontend.",
                    "Async FastAPI + Pydantic service over Postgres.",
                    "Auth0 JWT authentication.",
                    "Docker, with Terraform-managed cloud infrastructure.",
                    "pytest with mocked LLM and database layers.",
                ]),
            ]),
        ["metaheuristics"] = new(
            "A Python library of metaheuristic optimisation solvers.",
            [
                new("Solvers",
                [
                    "Canonical Genetic Algorithm.",
                    "Real-Valued Genetic Algorithm.",
                    "Differential Evolution.",
                    "Random Search.",
                ]),
                new("Benchmarking",
                [
                    "Each solver is benchmarked on standard mathematical test functions.",
                    "Automated CSV reporting and convergence visualisation.",
                ]),
            ]),
        ["brain-age"] = new(
            "A competition ML pipeline predicting biological brain age from roughly 20k fMRI neuroimaging connectivity features.",
            [
                new("Approach",
                [
                    "Gender-stratified ElasticNet model.",
                    "Spectral feature selection.",
                ]),
                new("Result",
                [
                    "Ranked 8th nationally at the WiDS Datathon 2025 University Edition.",
                ]),
            ]),
    };

    public static ProjectDetail? For(string slug) => BySlug.GetValueOrDefault(slug);
}
