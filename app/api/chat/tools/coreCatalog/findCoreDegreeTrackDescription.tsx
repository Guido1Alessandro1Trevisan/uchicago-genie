import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";

const findCoreDegreeSectionsSummary = {
  description: `Retrieves general descriptions of each section in the 'Core Curriculum' degree track without listing the courses. If the user mentions a specific section of the Core Curriculum do not run this tool. `,
  parameters: z.object({
    userQuery: z.string().describe("The user's query"),
  }),
  execute: async ({
    userQuery,
  }: {
    userQuery: string;
  }): Promise<string> => {
    noStore();
    console.log("Executing findCoreDegreeSectionsSummary");

    const degreeTrack = "Core Curriculum";

    try {
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      const query = `
MATCH (dt:DegreeTrack { name: $degreeTrack })
OPTIONAL MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)
WHERE ds IS NOT NULL

// Collect degree sections with their descriptions
WITH dt, collect(DISTINCT ds {
  .name,
  .description
}) AS degreeSections

RETURN dt {
  .name,
  .type,
  .department,
  .totalUnits,
  degreeDescription: dt.description
}, degreeSections
      `;

      const data = await graph.query(query, {
        degreeTrack,
      });

      if (!data || data.length === 0) {
        return `Hmm, I couldn’t find any information for the Core Curriculum. Please check the degree track name and try again. I’ll make a note of this and work on improving in the future!`;
    }
    
      const degree = data[0].dt;
      const degreeSections = data[0].degreeSections;

      let response = `## ${degree.name}\n`;

      if (degree.degreeDescription) {
        response += `${degree.degreeDescription}\n\n`;
      }

      if (degree.totalUnits) {
        response += `**Total Units Required:** ${degree.totalUnits}\n\n`;
      }

      response += "\n\n<spaceseparator> \n </spaceseparator>\n\n";

      // Add descriptions for each degree section
      if (degreeSections && degreeSections.length > 0) {
        response += `# Degree Sections:\n\n`;
        degreeSections.forEach((section: any, index: any) => {
          response += "\n<longshowmore>\n\n";
          response += `- ## ${index + 1} ${section.name}\n`;
          if (section.description) {
            response += `${section.description}\n\n`;
          } else {
            response += `No description available for this section.\n\n`;
          }
          response += "</longshowmore>\n\n";
          response += `<calltoaction>\n Tell me more about ${section.name} in the core </calltoaction>\n\n`;
        });
      } else {
        response += `No degree sections found for this degree track.\n\n`;
      }

      return response;
    } catch (error) {
      console.error("Error in findCoreDegreeSectionsSummary:", error);
      return `Error finding core degree sections summary: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  },
};


export { findCoreDegreeSectionsSummary }