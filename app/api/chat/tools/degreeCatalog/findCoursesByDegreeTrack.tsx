
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";
import { findDegreeTrack } from "../lib";
import { departmentGuardPrompt } from "../../toolPrompt";
import { departments } from "../../constants/departments";
import degreeTracks from "../../constants/department-degreetracks.json"; // Updated import

const findCoursesByDegreeTrack = {
  description: `Retrieve courses being taught in a specific degree track, optionally filtered by term and year. It should answer questions like: 'What are some good electives I can take for my X major?' or 'Which courses are available for [specified degree]? If the user does not mention the Quarter or Year, default to the quarter being ${process.env.CURRENT_QUARTER} and the year being ${process.env.CURRENT_YEAR}. This tool helps discover interesting courses offered in a degree. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  parameters: z.object({
    termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
    year: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .describe("The four-digit year"),
    department: z
      .enum(departments)
      .describe("The department of the Degree Track"),
      userDegreeTrack: z.string().describe("This is the name of the Degree Track that the user has specified."),
  }),
  execute: async ({
    department,
    termOffered,
    year,
    userDegreeTrack
  }: {
    department: string;
    termOffered?: string;
    year?: string;
    userDegreeTrack: string;
  }): Promise<string> => {
    noStore();

    console.log("firing findCoursesByDegreeTrack");

    try {
      console.log("department", department);
      // Set default term and year if not provided
      const currentTerm =
        termOffered || process.env.CURRENT_QUARTER || "Autumn";
      const currentYear =
        year || process.env.CURRENT_YEAR || new Date().getFullYear().toString();

        const degreeTrack = await findDegreeTrack(department, userDegreeTrack);
    
        console.log("Degree track", degreeTrack);

        // Check if degreeTrack is successfully extracted
        if (!degreeTrack) {
            return `Hey, I'm sorry, but I wasn't able to find the degree track you're looking for. Please provide the accurate name of the degree track, and I'd be happy to assist!`;
        }

      if (!degreeTrack) {
        // If the degree track is not found, list possible degree tracks from the JSON
        const departmentData = degreeTracks.find(
          (dept: any) => dept.name.toLowerCase() === department.toLowerCase()
        );

        if (departmentData) {
          const availableDegreeTracks = departmentData.degreeTracks.map(
            (track: any) => track
          );
          return (
            `I couldn't find the specified degree track in the ${department} department. Here are the available degree tracks for ${department}:\n\n` +
            availableDegreeTracks
              .map(
                (track: any) =>
                  `- <calltoaction>Tell me about classes I can take ${process.env.CURRENT_QUARTER} ${process.env.CURRENT_YEAR} ${track}</calltoaction>`
              )
              .join("\n") +
            `\n\n"Can you tell me which degree track you'd like me to find classes for?"`
          );
        } else {
          return `I couldn't find the department "${department}". Can you try telling me the name of the department again? I will note this down to improve in the future...`;
        }
      }

      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      // Build the query dynamically based on optional parameters
      const query = `
        MATCH (dept:Department {name: $department})
        MATCH (dept)-[:OFFERS]->(dt:DegreeTrack {name: $degreeTrack})
        MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)
        MATCH (ds)-[:REQUIRES]->(c:Course)
        ${
          termOffered || year
            ? `
        MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
        WHERE ${termOffered ? "cs.termOffered = $currentTerm" : ""}
        ${termOffered && year ? " AND " : ""}
        ${year ? "cs.year = $currentYear" : ""}
        `
            : `
        OPTIONAL MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
        `
        }
        RETURN ds.name AS degreeSection, c {
          .id,
          .name,
          .description
        },
        COLLECT(DISTINCT cs { .sectionId, .termOffered, .year }) AS courseSections
      `;

      const params: any = {
        department,
        degreeTrack: degreeTrack,
        currentTerm,
        currentYear,
      };

      const data = (await graph.query(query, params)) as any[];

      if (!data || data.length === 0) {
        return `Hmm, I couldn't find any courses for the degree track **"${degreeTrack}"**${
          termOffered ? " in " + currentTerm : ""
        }${year ? " " + currentYear : ""}. I'll make a note of this and work on improving in the future!`;
      }

      // Group courses by degree section
      const coursesBySection = data.reduce(
        (
          acc: Record<
            string,
            Array<{ course: any; courseSections: any[] }>
          >,
          record: any
        ) => {
          const degreeSection =
            record["degreeSection"] || "Unspecified Section";
          if (!acc[degreeSection]) {
            acc[degreeSection] = [];
          }
          acc[degreeSection].push({
            course: record["c"],
            courseSections: record["courseSections"],
          });
          return acc;
        },
        {}
      );

      // Prepare response
      let response = `## Courses for ${degreeTrack}`;
      if (termOffered && year) {
        response += ` (${currentTerm} ${currentYear})\n`;
      } else {
        response += ` (All Terms)\n`;
      }

      // Add a list of all degree sections before the courses
      const allDegreeSections = Object.keys(coursesBySection);

      response += `\nHere are the sections available in the degree track "${degreeTrack}":\n\n`;
      allDegreeSections.forEach((section) => {
        response += `- ${section}\n`;
      });

      response += "\n<longshowmore>\n\n";

      // List the courses for each section
      for (const [sectionName, courses] of Object.entries(coursesBySection)) {
        response += `## Degree Section Name: ${sectionName}\n\n`;
        courses.forEach(
          ({
            course,
            courseSections,
          }: {
            course: any;
            courseSections: any[];
          }) => {
            response += `- **${course.id} ${course.name}**\n`;
            response += `${
              course.description || "No description available."
            }\n\n`;
            if (courseSections && courseSections.length > 0) {
              // Include course sections if needed
            } else {
              response += `No active sections found for this course${
                termOffered && year
                  ? " in " + currentTerm + " " + currentYear
                  : ""
              }.\n\n`;
            }
          }
        );
      }

      response += "</longshowmore>";

      response += `\n\n<separator>\n</separator>\n\n`;

      return response;
    } catch (error) {
      console.error("Error in findCoursesByDegreeTrack:", error);
      return `Error finding courses by degree track: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  },
};

export { findCoursesByDegreeTrack };