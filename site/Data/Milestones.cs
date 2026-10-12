namespace Portfolio.Data;

public sealed record Milestone(int Year, string Name);

// Work and study entries for the timeline; projects are added from ProjectCatalog.
public static class Milestones
{
    public static readonly Milestone[] All =
    [
        new(2024, "MSc in Artificial Intelligence, Technical University of Iași"),
        new(2023, "Software Engineer, Gemini CAD Systems"),
        new(2023, "IT Department Coordinator, LOCAL BEST Group Iași"),
        new(2022, "Software Engineer Intern, Gemini CAD Systems"),
        new(2020, "BSc in Systems Engineering, Technical University of Iași"),
        new(2020, "IT Technician, Special Telecommunications Service"),
    ];
}
