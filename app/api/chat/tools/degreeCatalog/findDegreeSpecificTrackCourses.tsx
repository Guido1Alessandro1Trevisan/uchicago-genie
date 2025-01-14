
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";
import { departments } from "../../constants/departments";
import { findDegreeTrack } from "../lib";

const findDegreeSpecificTrackCourses = {
  description: `Retrieve detailed information about a specific degree track (major, minor, or specialization), including its description, total units required, and the list of courses grouped by their degree sections. Use this tool to answer questions like: "What are the available degree tracks for the Economics department?" or "Tell me about the BA in Economics, including its courses grouped by degree section." Do not use this tool to recommend specific courses or electives for the current quarter based on the degree track. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  parameters: z.object({
    departmentOfDegreeTrack: z.enum(departments).describe(
      "The department of the degree track"
    ),
    userQuery: z.string().describe("The user's query"),
    userDegreeTrack: z.string().describe(
      "This is the name of the Degree Track that the user has specified."
    ),
  }),
  execute: async ({
    departmentOfDegreeTrack,
    userQuery,
    userDegreeTrack,
  }: {
    departmentOfDegreeTrack: string;
    userQuery: string;
    userDegreeTrack: string;
  }): Promise<string> => {
    noStore();

    console.log("firing findDegreeSpecificTrackCourses");

    const degreeTrack = await findDegreeTrack(
      departmentOfDegreeTrack,
      userDegreeTrack
    );

    if (!degreeTrack) {
      try {
        const graph = await Neo4jGraph.initialize({
          url: process.env.NEO4J_URI!,
          username: process.env.NEO4J_USERNAME!,
          password: process.env.NEO4J_PASSWORD!,
        });

        const query = `
          MATCH (d:Department { name: $departmentOfDegreeTrack })-[:OFFERS]->(dt:DegreeTrack)
          RETURN collect(dt.name) AS degreeTracks
        `;

        const data = await graph.query(query, {
          departmentOfDegreeTrack,
        });

        if (data && data[0]?.degreeTracks?.length > 0) {
          const availableTracks = data[0].degreeTracks;
          return `The following degree tracks are offered by the ${departmentOfDegreeTrack} department:
- <calltoaction>Tell me about ${availableTracks.join(
            "</calltoaction>\n<calltoaction>Tell me about "
          )}</calltoaction>`;
        } else {
          return `Hmm, I couldn’t find any degree tracks for the ${departmentOfDegreeTrack} department. Please check the department name and try again.`;
        }
      } catch (error) {
        console.error("Error retrieving degree tracks:", error);
        return `Error retrieving degree tracks: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    }

    try {
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      const query = `
        MATCH (d:Department { name: $departmentOfDegreeTrack })-[:OFFERS]->(dt:DegreeTrack { name: $degreeTrack })
        OPTIONAL MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)
        OPTIONAL MATCH (ds)-[:REQUIRES]->(c:Course)
        WITH dt, ds, collect(DISTINCT c.name) AS courses
        ORDER BY ds.name
        WITH dt, collect({
          sectionName: ds.name,
          sectionDescription: ds.description,
          courses: courses
        }) AS sections
        RETURN {
          name: dt.name,
          type: dt.type,
          department: dt.department,
          totalUnits: dt.totalUnits,
          degreeDescription: dt.description,
          sections: sections
        } AS degree
      `;

      const params = {
        degreeTrack,
        departmentOfDegreeTrack,
      };

      const data = await graph.query(query, params);

      if (!data || data.length === 0) {
        return `Hmm, I couldn’t find any information for "${degreeTrack}". Please check the degree track name and try again.`;
      }

      const degree = data[0].degree;

      let response = `## ${degree.name} in ${degree.department}\n`;
      response += `*${degree.type}*\n\n`;

      if (degree.degreeDescription) {
        response += `${degree.degreeDescription}\n\n`;
      }

      if (degree.totalUnits) {
        response += `**Total Units Required:** ${degree.totalUnits}\n\n`;
      }

      if (
        degree.sections &&
        degree.sections.length > 0 &&
        degree.sections[0].sectionName
      ) {
        response += `### Degree Sections and Courses:\n`;
        degree.sections.forEach((section: any) => {
          response += `\n**${section.sectionName}**\n`;
          if (section.sectionDescription) {
            response += `${section.sectionDescription}\n`;
          }
          response += "\n<showmore>\n\n";

          if (section.courses && section.courses.length > 0 && section.courses[0]) {
       
            response += section.courses
              .map((course: string) => `- ${course}`)
              .join("\n");
            response += `\n`;
            

          } else {
            response += `No courses listed under this section.\n`;
          }
          response += "\n</showmore>\n\n";

        });
        response += `\n`;
      } else {
        response += `No degree sections or courses are listed for this degree track.\n\n`;
      }

      response += `\n\n<separator> \n </separator>\n\n`;

      response += `## Want to learn more?\n`;
      response += `<calltoaction> "What are the available courses for this degree track?" </calltoaction>\n`;
      response += `<calltoaction> "Can you tell me about the degree sections for this track?" </calltoaction>\n`;

      return response;
    } catch (error) {
      console.error("Error in findDegreeSpecificTrackCourses:", error);
      return `Error finding degree track information: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  },
};

export { findDegreeSpecificTrackCourses };