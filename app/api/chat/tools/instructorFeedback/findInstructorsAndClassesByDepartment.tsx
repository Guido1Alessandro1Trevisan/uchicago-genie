import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";

import { departmentGuardPrompt } from "../../toolPrompt";

const findInstructorsAndClassesByDepartment = {
  description: `This tool retrieves all instructors and classes for a specified department it can also filter out based on the year and the quarter. If neither the time nor year is mentioned, use ${process.env.CURRENT_QUARTER} for the termOffered and ${process.env.CURRENT_YEAR} for the year as defaults. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,

  parameters: z.object({
    department: z.enum(departments).describe("The department to retrieve instructors from"),
    termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).describe("The term the courses are offered"),
    year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string"), // Enhanced validation
  }),

  execute: async ({
    department,
    termOffered,
    year,
  }: {
    department: string;
    termOffered: string;
    year: number;
  }): Promise<string> => {
    noStore();

    console.log("firing findInstructorsByDepartment")


    // Set default values if not provided

    console.log(`Fetching Instructors and Classes for Department: ${department}, Term: ${termOffered}, Year: ${year}`);

    try {
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      // Updated Query to fully comply with the schema
      const query = `
        MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)<-[:SECTION_OF]-(cs:CourseSection {termOffered: $termOffered, year: $year})-[:TAUGHT_BY]->(i:Instructor)
        RETURN DISTINCT i.nameSurname AS instructorName, c.name AS courseName, c.id AS courseId
        ORDER BY i.nameSurname
      `;

      const data = await graph.query(query, {
        department,
        termOffered: termOffered,
        year: year,
      });

      console.log("Query Result:", data);

      if (data.length === 0) {
        return `Hmm, I couldn't find any instructors for the ${department} department in ${termOffered} ${year}. I'll make sure to look into this and learn more about the department's instructors in the future.`;
      }
      


      // Organize instructors and their courses
      const instructorMap: { [key: string]: string[] } = {};
      data.forEach(record => {
        const { instructorName, courseName } = record;
        if (!instructorMap[instructorName]) {
          instructorMap[instructorName] = [];
        }
        instructorMap[instructorName].push(courseName);
      });


      const instructorList = Object.entries(instructorMap)
        .map(([name, courses]) => `- **${name}**: ${courses.join(", ")}`)
        .join('\n');

      // Select four instructors for CTAs
      const instructorsArray = Object.entries(instructorMap);
      const selectedCTAs: { name: string; course: string }[] = [];

      while (selectedCTAs.length < 4 && selectedCTAs.length < instructorsArray.length) {
        const randomIndex = Math.floor(Math.random() * instructorsArray.length);
        const [name, courses] = instructorsArray[randomIndex];
        const randomCourse = courses[Math.floor(Math.random() * courses.length)];

        // Avoid duplicates
        if (!selectedCTAs.find(cta => cta.name === name && cta.course === randomCourse)) {
          selectedCTAs.push({ name, course: randomCourse });
        }
      }

      // Build the response
      let response = `## Instructors in the ${department} Department for ${termOffered} ${year}\n\n`;
      
      response += "<longshowmore>\n\n";
      response += `${instructorList}\n\n`;
      response += `\n</longshowmore>\n\n`;


      response += "\n\n<separator> \n </separator>\n\n";

      response += "### Intersted in learning about specific professors?\n\n";

      selectedCTAs.forEach(cta => {
        response += `<calltoaction> "What feedback is available for **Professor ${cta.name}** in the course **${cta.course}** from the ${department} department?"</calltoaction>\n`;
      });

      return response;

    } catch (error) {
      console.error("Error in listInstructorsWithCTAs:", error);
      return `Error retrieving instructors: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

export { findInstructorsAndClassesByDepartment };
