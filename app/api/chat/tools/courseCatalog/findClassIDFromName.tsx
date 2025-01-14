
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { departmentGuardPrompt } from "../../toolPrompt";
import { findCourse } from "../lib";
import { departments } from "../../constants/departments";

const findCourseIdOrNameTool = {
  description: `Finds the course information (ID, name, and description) given a course name or course ID. Retrieves data from the Neo4j database.${departmentGuardPrompt} Also make sure that if the user asks about biology classes usally with the BIOS prefix that you ask them if they are core classes or not. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  parameters: z.object({
    department: z.enum(departments).describe("The department name provided by the user"),
    userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
    userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
  }),
  execute: async ({
    department,
    userCourseId,
    userCourseName,
  }: {
    department: string,
    userCourseId: string,
    userCourseName: string,
  }): Promise<string> => {
    noStore();

    console.log("Executing findCourseIdOrNameTool");

    try {
      // Use fetchCourseName to parse the user's query
      const courseResult = await findCourse(department, userCourseId, userCourseName);
        
      let courseId = null;
      let courseName = null;

      if (courseResult && courseResult.length > 0) {
        // Assuming we pick the first result
        courseId = courseResult[0].courseId;
        courseName = courseResult[0].courseName;
      } else {
        return `Hmm, I couldn't find any course matching the provided information in the ${department} department. I’ll note this down and work on improving in the future!`;
      }
      
      if (!courseId && !courseName) {
        return "Hmm, I couldn’t extract a valid course ID or course name from your query. Please try again, and I’ll make a note of this to improve in the future!";
    }
    

      // Normalize courseId and courseName for comparison
      const normalizedCourseId = courseId ? courseId.trim() : null;
      const normalizedCourseName = courseName ? courseName.trim() : null;

      // Initialize Neo4j Graph
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      // Define the Cypher query
      let query = `
MATCH (d:Department { name: $department })-[:OFFERS]->(c:Course)
WHERE `;

      if (normalizedCourseId && normalizedCourseName) {
        query += `(c.id = $normalizedCourseId OR c.name = $normalizedCourseName)`;
      } else if (normalizedCourseId) {
        query += `c.id = $normalizedCourseId`;
      } else if (normalizedCourseName) {
        query += `c.name = $normalizedCourseName`;
      } else {
        return "No valid course ID or course name provided.";
      }

      query += `
RETURN c {
  .id,
  .name,
  .description,
  department: d.name
} AS course
      `;

      // Execute the query
      const data = await graph.query(query, {
        department,
        normalizedCourseId,
        normalizedCourseName,
      });

      if (!data || data.length === 0) {
          return `Hmm, I couldn’t find any course matching your query in the ${department} department. I’ll make a note of this and work on improving in the future!`;
      }


      // Build the response
      const course = data[0].course;

      let response = `**Course ID:** ${course.id}\n`;
      response += `**Course Name:** ${course.name}\n`;
      response += `**Department:** ${course.department}\n`;
      response += `**Description:** ${course.description || "No description available."}`;

      return response;
    } catch (error) {
      console.error("Error in findCourseIdOrNameTool:", error);
      return `Error finding course information: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  },
};

export { findCourseIdOrNameTool };
