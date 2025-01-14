import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";

const userFriendlyText: any = {
  "non_science_majors": "Not majors in the Physical or Biological Sciences, Economics, Psychology, or Public Policy Studies",
  "science_majors": "Majors in the Physical or Biological Sciences, Economics, Psychology, or Public Policy Studies",
  "Non-Bio_Major_Requirements": "Non-Bio Major Requirements",
  "Bio_Major_Requirements": "Bio Major Requirements"
}

const findSpecificCoreSectionDetails = {
  description: `Provides detailed information about a specific Core Curriculum section, including the courses required for that section. Make sure that this tool is used only if the user mentions that the section is in the "Core Curriculum" or Core. Also, ensure that if the user asks about biology classes, usually with the BIOS prefix, you ask them whether they are core classes or not. 
`,
  parameters: z.object({
    sectionName: z
      .enum([
        "Humanities",
        "Civilization Studies",
        "Arts",
        "Physical Sciences",
        "Biological Sciences",
        "Mathematical Sciences",
        "Sciences Elective",
        "Social Sciences",
      ])
      .describe("The name of the core section"),
  }),
  execute: async ({
    sectionName,
  }: {
    sectionName: string;
  }): Promise<string> => {
    noStore();
    console.log("Executing findSpecificCoreSectionDetails");

    const degreeTrack = "Core Curriculum";

    try {
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      const query = `
MATCH (dt:DegreeTrack { name: $degreeTrack })-[:HAS_SECTION]->(ds:DegreeSection { name: $sectionName })

// Aggregate sequences for the degree section
OPTIONAL MATCH (ds)-[:SECTION_SEQUENCE]->(seq:Sequence)
WITH ds, collect(DISTINCT seq { .name, .description }) AS sequences

// Collect courses directly connected to the degree section
OPTIONAL MATCH (ds)-[:REQUIRES]->(secCourse:Course)
WITH ds,
     sequences,
     collect(DISTINCT secCourse { .name, .id, .description }) AS sectionCourses

// Collect subsections
OPTIONAL MATCH (ds)-[:HAS_SUBSECTION]->(dss:DegreeSubSection)
WITH ds, sequences, sectionCourses, collect(DISTINCT dss) AS subsections

// For each subsection, collect its sequences and courses using pattern comprehensions
WITH ds, sequences, sectionCourses,
[ss IN subsections |
    ss {
        .name,
        .description,
        sequences: [(ss)-[:SUBSECTION_SEQUENCE]->(subSeq:Sequence) | subSeq { .name, .description }],
        courses: [(ss)-[:SUBSECTION_COURSE]->(subC:Course) | subC { .name, .id, .description }]
    }
] AS subsectionData

RETURN ds {
    .name,
    .description,
    sequences: sequences,
    courses: sectionCourses,
    subsections: subsectionData
}
      `;

      const data = await graph.query(query, {
        degreeTrack,
        sectionName,
      });

      if (!data || data.length === 0) {
        return `Hmm, I couldn’t find any information for the section '${sectionName}' in the Core Curriculum. Please check the section name and try again. I’ll make a note of this and work on improving in the future!`;
      }
    

      const section = data[0].ds;

      let response = `## ${section.name}\n`;

      if (section.description) {
        response += `${section.description}\n\n`;
      } else {
        response += `No description available for this section.\n\n`;
      }

      // Define sections to display sequences for
      const sectionsWithSequences = [
        "Mathematical Sciences",
        "Humanities",
        "Civilization Studies",
        "Social Sciences",
      ];

      // Show sequences if the section is in sectionsWithSequences
      if (
        sectionsWithSequences.includes(section.name) &&
        section.sequences &&
        section.sequences.length > 0
      ) {
        response += "\n<showmore>\n\n";
        response += `## Sequences:\n`;
        section.sequences.forEach((sequence: any) => {
          response += `- **${sequence.name}**\n`;
        });
        response += "\n</showmore>\n\n";
      }

      // Show courses directly connected to the section
      if (section.courses && section.courses.length > 0) {
        response += "\n<longshowmore>\n\n";
        response += `## Courses:\n`;
        section.courses.forEach((course: any) => {
          response += `- **${course.id} ${course.name}**: ${
            course.description || "No description available"
          }\n`;
        });
        response += "\n</longshowmore>\n\n";
      }

      // Display subsections if any
      if (section.subsections && section.subsections.length > 0) {
        
        section.subsections.forEach((subsection: any, index: any) => {

          let subSectionText
          if (userFriendlyText[subsection.name] === undefined) {
            subSectionText =  subsection.name
     
          } else {
            subSectionText = userFriendlyText[subsection.name]
          }

          response += `## ${index + 1}. Subsection: ${subSectionText}\n`;
          if (subsection.description) {
            response += `${subsection.description}\n\n`;
          }

          // Show sequences in subsections if section is in sectionsWithSequences
          if (
            sectionsWithSequences.includes(section.name) &&
            subsection.sequences &&
            subsection.sequences.length > 0
          ) {
            response += "\n<showmore>\n\n";
            response += `### Sequences:\n`;
            subsection.sequences.forEach((subSeq: any) => {
              response += `- **${subSeq.name}**\n`;
            });
            response += "\n</showmore>\n\n";
          }

          // Show courses in subsections
          if (subsection.courses && subsection.courses.length > 0) {
            response += "\n<longshowmore>\n\n";
            response += `# Courses:\n`;
            subsection.courses.forEach((course: any) => {
              response += `- **${course.id} ${course.name}**: ${
                course.description || "No description available"
              }\n`;
            });
            response += "\n</longshowmore>\n\n";
          }
        });
      }

      // Add follow-up questions
      response += "### Want to Learn More?\n\n";

      // Select a random sequence from the section's sequences if available
      if (section.sequences && section.sequences.length > 0) {
        const randomSequence1 = section.sequences[Math.floor(Math.random() * section.sequences.length)];
        response += `<calltoaction> "Tell me more about the **${randomSequence1.name}** sequence" </calltoaction>\n`;

        // Ensure the second random sequence is different from the first
        if (section.sequences.length > 1) {
          let randomSequence2;
          do {
            randomSequence2 = section.sequences[Math.floor(Math.random() * section.sequences.length)];
          } while (randomSequence2.name === randomSequence1.name);

          response += `<calltoaction> "Tell me more about the **${randomSequence2.name}** sequence" </calltoaction>\n`;
        }
      }

      return response;
    } catch (error) {
      console.error("Error in findSpecificCoreSectionDetails:", error);
      return `Error finding details for section '${sectionName}': ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  },
};

export { findSpecificCoreSectionDetails };