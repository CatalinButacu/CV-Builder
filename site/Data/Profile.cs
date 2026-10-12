namespace Portfolio.Data;

public sealed record Person(string Name, string ShortName, string Location, string Email, string LinkedIn, string GitHub, string Summary);
public sealed record Competency(string Title, string[] Items);
public sealed record Role(string Title, string Period, string[] Bullets);
public sealed record Organisation(string Name, string Location, Role[] Roles);
public sealed record Note(string Label, string Text);
public sealed record Degree(string Title, string School, string Period, Note[] Notes);
public sealed record Certification(string Name, string? Link = null);
public sealed record SkillGroup(string Group, string[] Items);

// Content mirrors resume.tex in the repo root. Update both together.
public static class Profile
{
    public static readonly Person Person = new(
        Name: "Butacu Ionel-Cătălin",
        ShortName: "Cătălin Butacu",
        Location: "Iași, Romania",
        Email: "butacu.catalin@yahoo.com",
        LinkedIn: "https://ro.linkedin.com/in/catalin-butacu",
        GitHub: "https://github.com/CatalinButacu/",
        Summary: "Software Engineer with 4 years of experience building desktop and enterprise software in C++ and Qt, with machine learning engineering experience gained through MSc study, certifications, and applied ML projects. Built computer vision, RAG, and agentic LLM applications covering model training, evaluation, inference, vector search, and edge deployment.");

    public static readonly Competency[] Competencies =
    [
        new("Software Engineering",
        [
            "C++/Qt Desktop & Enterprise Development",
            "Software Architecture & Design Patterns",
            "Production Debugging & Root Cause Analysis",
            "Code Review, CI/CD & Agile Delivery",
            "Multithreading, Performance & System Design",
        ]),
        new("Machine Learning & AI",
        [
            "ML Model Training & Evaluation",
            "NLP, Generative AI & Prompt Design",
            "Deep Learning & Computer Vision",
            "LLM Applications, RAG & Vector Search",
            "Model Deployment & Inference Serving",
        ]),
    ];

    public static readonly Organisation[] Experience =
    [
        new("Gemini CAD Systems", "Iași, RO",
        [
            new("Software Engineer", "June 2023 – Present",
            [
                "Delivered production C++/Qt UI, networking, and event-driven desktop features using signal/slot and model-view.",
                "Implemented multi-instance crash recovery with shared-memory IPC and a watchdog crash handler process.",
                "Integrated REST APIs and bidirectional cloud sync via Qt Network with JSON, auth, retry, and sync recovery.",
                "Refactored legacy C++ modules with smart pointers, clearer ownership, and unit-test-backed debt reduction.",
                "Fixed crashes, memory leaks, and regressions through root cause analysis, heap diagnostics, sanitizers, and tests.",
                "Collaborated in Agile Scrum for sprint planning, estimation, code review, demos, and retrospectives.",
            ]),
            new("Software Engineer Intern", "August 2022 – May 2023",
            [
                "Built custom Qt UI components from specs and integrated them into production views.",
                "Extended real-time canvas behavior and optimized desktop event handling for smoother repaints.",
                "Delivered work through Git workflows, merge requests, and GitLab CI/CD for stable feature branches.",
            ]),
        ]),
        new("Special Telecommunications Service (STS)", "Botoșani, RO",
        [
            new("IT Technician – Electoral Bureau", "August 2020 – September 2020",
            [
                "Kept IT infrastructure operational across local electoral bureaus during the election process.",
                "Verified and transmitted electoral data through SIMPV and SICPV systems.",
                "Provided technical support and guidance to electoral bureau staff.",
            ]),
        ]),
    ];

    public static readonly Degree[] Education =
    [
        new("Master of Science in Artificial Intelligence", "Technical University of Iași", "October 2024 – June 2026",
        [
            new("Advanced Coursework", "Machine Learning, Deep Learning, Natural Language Processing (NLP), Reinforcement Learning, Multi-Agent Systems, Cloud Computing, Big Data Techniques, Edge Computing Applications, Intelligent Cyber-Security"),
        ]),
        new("Bachelor of Science in Systems Engineering", "Technical University of Iași", "October 2020 – June 2024",
        [
            new("Core Curriculum", "Advanced Computer Programming, Data Structures & Algorithms, Real-Time Programming, Database Management Systems, Data Processing, Microprocessor-Based Systems, Embedded Systems Engineering, Control Engineering, Computer Networks, Numerical Methods, Neural Networks, Optimization Techniques, Fuzzy Logic, Knowledge-Based Systems"),
            new("Independent Coursework", "DataTalksClub Zoomcamps in Machine Learning Engineering and Data Engineering — Docker, MLflow, FastAPI, Terraform, Kubernetes, dbt, Spark, Kafka, and Airflow."),
        ]),
    ];

    public static readonly Certification[] Certifications =
    [
        new("Microsoft Certified: Machine Learning Operations (MLOps) Engineer Associate (AI-300)",
            "https://learn.microsoft.com/api/credentials/share/en-us/CatalinIonelButacu-5330/3FA89EFADCA3B3DC?sharingId=C8EFA178F75A471"),
        new("Oracle Cloud Infrastructure 2025 Data Science Professional (1Z0-1110-25)",
            "https://catalog-education.oracle.com/ords/certview/sharebadge?id=277E72156AC389D08A7C467084A3CE568D1D9078A9A8301005E9BCC3E31FA903"),
        new("Oracle Cloud Infrastructure 2025 Generative AI Professional (1Z0-1127-25)",
            "https://catalog-education.oracle.com/pls/certview/sharebadge?id=36F42AE9CD423CBEDFC5C81160E753619C6EC388D2CA3FB3FDBB2700CD1BE2AB"),
        new("Oracle Cloud Infrastructure 2025 AI Vector Search Professional (1Z0-184-25)",
            "https://catalog-education.oracle.com/ords/certview/sharebadge?id=08BDD5D7DA29BEFF7F764053FD58DD5D7536402E95B847A926A53027CC0C1FCC"),
        new("Oracle Analytics Cloud 2025 Certified Professional (1Z0-1041-25)",
            "https://catalog-education.oracle.com/ords/certview/sharebadge?id=2D550AA768AD738FC822D0745D8F71CC4845A22B212DA7CE9CF27259DE5EEAAF"),
        new("DataTalks.Club LLM Zoomcamp (2026)",
            "https://certificate.datatalks.club/llm-zoomcamp/2026/1767b58963ff375717afa274b146b46a8e74965f.pdf"),
        new("Red Hat System Administration I (RH124) — Course Attendance"),
        new("Red Hat System Administration II (RH134) — Course Attendance"),
    ];

    public static readonly SkillGroup[] Skills =
    [
        new("Languages", ["Python", "C/C++", "SQL", "Bash", "TypeScript"]),
        new("DataScience", ["PyTorch", "Scikit-learn", "NumPy", "Pandas", "OpenCV"]),
        new("GenAI", ["HuggingFace", "LangChain", "LangGraph", "Mesa"]),
        new("DevOps", ["Docker", "Linux", "Git", "GH Actions", "Terraform", "Kubernetes"]),
        new("Backend", ["FastAPI", "Pydantic", "REST", "gRPC", "Node.js", "pytest"]),
        new("Pipelines", ["MLflow", "Kafka", "Airflow", "Spark", "dbt"]),
        new("Desktop", ["Qt", "MSBuild", "STL", "CMake", "SonarQube"]),
    ];

    public static readonly Organisation Volunteering = new("LOCAL BEST Group Iași", "Iași, RO",
    [
        new("IT Department Coordinator", "Sep 2023 – Aug 2024",
        [
            "Directed IT operations and maintained technical infrastructure across organisational events.",
            "Mentored volunteers and oversaw delivery of technical projects.",
            "Administered hardware, software licensing, and network resources.",
        ]),
        new("Event Coordinator | JobShop Career Event", "Nov 2022 – Apr 2023",
        [
            "Coordinated logistics and operations for a large student–industry career event.",
            "Managed scheduling, partner engagement, and on-site execution.",
            "Improved attendee experience through strategic planning and workflow optimisation.",
        ]),
        new("TOPICS Responsible | Prove It 24H Techathon", "Dec 2021 – Mar 2022",
        [
            "Defined technical requirements and coordinated hackathon logistics.",
            "Supported participants with rules, resources, and real-time assistance.",
            "Facilitated communication between organisers, industry mentors, and teams.",
        ]),
        new("IT Responsible | BEST Training Weekend", "Jan 2021 – May 2022",
        [
            "Developed and maintained the event website using HTML, CSS, and JavaScript.",
            "Collaborated with design and marketing responsible members on content, branding, and technical setup.",
        ]),
    ]);
}
