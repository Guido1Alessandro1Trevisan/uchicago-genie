
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import { findInstructor, findCourse } from "../lib"; // Ensure these functions are correctly imported

import { departmentGuardPrompt } from "../../toolPrompt";


const findInstructorQuotes = {
  description: `This tool retrieves and displays many student quotes, if mentioned, organized by the courses that the instructor has taught. It provides detailed insights into student feedback for each course . ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,

  parameters: z.object({
    department: z.enum(departments),
    userCourseId: z
      .string()
      .describe(
        "This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"
      ),
    userCourseName: z
      .string()
      .describe(
        "This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."
      ),
          instructor: z
      .string()
      .describe(
        "This is the name of the instructor, with any typos made by the user corrected."
      ),
  }),

  execute: async ({
    department,
    userCourseId,
    userCourseName,
    instructor,
  }: {
    department: string;
    userCourseId: string;
    userCourseName: string;
    instructor: string;
  }): Promise<string> => {
    noStore();

    console.log("Executing findInstructorQuotes");

    // Validate and find the instructor
    if (instructor && instructor.trim() !== '') {
      const instructorResult = await findInstructor(department, instructor);
      if (instructorResult) {
        instructor = instructorResult;
      } else {
        return `Hmm, no instructor found matching the provided name in the ${department} department. I’ll make a note of this and work on improving in the future!`;
      }
    } else {
      return "Hmm, I couldn’t find any instructor based on the provided query. I’ll make a note of this and work on improving in the future!";
    }

    // Initialize courseId and courseName
    let courseId = null;
    let courseName = null;

    // Only attempt to find the course if userCourseId or userCourseName is provided
    if (userCourseId || userCourseName) {
      const courseResult = await findCourse(
        department,
        userCourseId ?? '',
        userCourseName ?? ''
      );

      if (courseResult && courseResult.length > 0) {
        // Assuming we pick the first result
        courseId = courseResult[0].courseId;
        courseName = courseResult[0].courseName;
      } else {
        return `Hmm, I couldn't find any course matching the provided information in the ${department} department. I’ll note this down and work on improving in the future!`;
      }
    }

    console.log("findInstructorQuotes", instructor, courseId, courseName);

    try {
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      // Define parameters
      const params: any = { department, instructor };

      // Build the query according to the database schema
      let query = `
        MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
        MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
        MATCH (cs)-[:TAUGHT_BY]->(i:Instructor {nameSurname: $instructor})
      `;

      // Build the WHERE clause based on course ID or name
      let whereClauses = ["cs.feedback IS NOT NULL"];

      if (courseId) {
        whereClauses.push("c.id = $courseId");
        params.courseId = courseId;
      } else if (courseName) {
        whereClauses.push("c.name = $courseName");
        params.courseName = courseName;
      }

      if (whereClauses.length > 0) {
        query += `WHERE ${whereClauses.join(" AND ")}\n`;
      }

      query += `
        RETURN 
          cs.id AS sectionId,
          c.name AS courseName,
          c.id AS courseId,
          cs.termOffered AS term,
          cs.year AS year,
          cs.feedback AS feedback
      `;

      console.log("Neo4j Query:", query);
      console.log("Parameters:", params);

      const data = await graph.query(query, params);

      if (!data || data.length === 0) {
        if (courseId) {
          return `Hmm, I couldn't find any feedback for instructor ${instructor} in course ID ${courseId} under the ${department} department. I'll make sure to learn more about this instructor in the future.`;
        } else if (courseName) {
          return `Hmm, I couldn't find any feedback for instructor ${instructor} in the course "${courseName}" under the ${department} department. I'll make sure to learn more about this instructor in the future.`;
        } else {
          return `Hmm, I couldn't find any feedback for instructor ${instructor} in the ${department} department. I'll make sure to learn more about this instructor in the future.`;
        }
      }

      // Process the data
      const allQuotes: { quote: string; courseName: string; term: string; year: string }[] = [];

      data.forEach((section) => {
        if (!section.feedback) return;
        const feedback = JSON.parse(section.feedback);

        if (feedback.teachingEffectiveness?.studentQuotes) {
          feedback.teachingEffectiveness.studentQuotes.forEach((quote: string) => {
            allQuotes.push({
              quote,
              courseName: section.courseName,
              term: section.term,
              year: section.year,
            });
          });
        }
      });

      if (allQuotes.length === 0) {
        if (courseId) {
          return `Hmm, I couldn’t find any student quotes for instructor ${instructor} in course ID ${courseId} within the ${department} department. I’ll make a note of this and work on improving in the future!`;
        } else if (courseName) {
          return `Hmm, I couldn’t find any student quotes for instructor ${instructor} in course "${courseName}" within the ${department} department. I’ll make a note of this and work on improving in the future!`;
        } else {
          return `Hmm, I couldn’t find any student quotes for instructor ${instructor} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
        }
      }

      // Group quotes by course and term
      const quotesByCourse: {
        [key: string]: {
          courseName: string;
          term: string;
          year: string;
          quotes: string[];
        };
      } = {};

      allQuotes.forEach(({ quote, courseName, term, year }) => {
        const key = `${courseName} (${term} ${year})`;
        if (!quotesByCourse[key]) {
          quotesByCourse[key] = {
            courseName,
            term,
            year,
            quotes: [],
          };
        }
        quotesByCourse[key].quotes.push(quote);
      });

      let response = "## Student Quotes\n\n";

      if (courseId || courseName) {
        const specificCourseName =
          courseName || (courseId ? `Course ID ${courseId}` : "");
        response += `**Showing quotes for instructor ${instructor} in ${specificCourseName}.**\n\n`;
      } else {
        response += `**Showing quotes for instructor ${instructor} across all courses in the ${department} department.**\n\n`;
      }

      response += "<longshowmore>\n\n";

      for (const courseKey in quotesByCourse) {
        const courseData = quotesByCourse[courseKey];
        response += `### ${courseData.courseName} (${courseData.term} ${courseData.year})\n\n`;
        courseData.quotes.forEach((quote) => {
          response += `- "${quote}"\n`;
        });
        response += `\n`;
      }

      response += `\n</longshowmore>\n\n`;

      response += "\n\n<separator> \n </separator>\n\n";

      // Prepare the "Want to Learn More?" section
      response += "### Want to Learn More?\n";

      // Prompt 1: Overall teacher feedback
      response += `<calltoaction>"Can I see the **overall teacher** feedback of ${instructor} in the ${department} department?" </calltoaction>\n`;

      // Prompt 2: Specific feedback on a randomly selected class
      const uniqueCourses = Array.from(new Set(allQuotes.slice(0,25).map((q) => q.courseName)));
      if (uniqueCourses.length > 0) {
        const randomIndex = Math.floor(Math.random() * uniqueCourses.length);
        const randomCourse = uniqueCourses[randomIndex];
        response += `<calltoaction>"Can I see specific feedback on **${randomCourse}** in the ${department} department?" </calltoaction>\n`;
      }

      return response;
    } catch (error) {
      console.error("Error in findInstructorQuotes:", error);
      return `Error retrieving instructor quotes: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  },
};

export { findInstructorQuotes };