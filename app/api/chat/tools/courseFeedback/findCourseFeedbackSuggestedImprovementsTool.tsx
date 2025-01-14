import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import { departmentGuardPrompt } from "../../toolPrompt";
import { findCourse, findInstructor } from "../lib";


const findCourseFeedbackSuggestedImprovementsTool = {
  description: `Compiles student suggestions for enhancing the course.Includes summaries and specific recommendations from student feedback. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
      parameters: z.object({
        department: z.enum(departments).describe(""),
        userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
        userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
        instructor: z.string().describe("This is the name of the instructor, with any typos made by the user corrected.").optional()
    }),
    execute: async ({ department, userCourseId, userCourseName, instructor }: { 
        department: string, 
        userCourseId: string,
        userCourseName: string,
        instructor: any,
    }): Promise<string> => {
    noStore();

    console.log("firing findCourseFeedbackSuggestedImprovementsTool")


    try {
      if (instructor && instructor.trim() !== '') {
        const instructorResult = await findInstructor(department, instructor);
        if (instructorResult) {
          instructor = instructorResult;
        } else {
          return `Hmm, no instructor found matching the provided name in the ${department} department. I’ll make a note of this and work on improving in the future!`;
        }
      } else {
        instructor = null; // Ensure instructor is null if not provided
      }
      
      // Now find the course
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
      const url = process.env.NEO4J_URI!;
      const username = process.env.NEO4J_USERNAME!;
      const password = process.env.NEO4J_PASSWORD!;

      if (!url || !username || !password) {
        throw new Error("Missing Neo4j credentials");
      }

      const graph = await Neo4jGraph.initialize({
        url,
        username,
        password
      });

      // Build the query
      let matchClause = `
        MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
        WHERE 
          CASE
            WHEN $courseId IS NOT NULL THEN c.id = $courseId
            ELSE c.name = $courseName
          END
        WITH c
        OPTIONAL MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
        WHERE cs.feedback IS NOT NULL
      `;

      if (instructor) {
        matchClause += `
          AND cs.instructor = $instructor
        `;
      }

      const query = `
        ${matchClause}
        RETURN 
          cs.sectionId AS sectionId,
          cs.termOffered AS termOffered,
          cs.year AS year,
          cs.instructor AS instructor,
          cs.feedback AS feedback
      `;

      const params = {
        department,
        courseId: courseId || null,
        courseName: courseName || null,
        instructor: instructor || null
      };

      const data = await graph.query(query, params);
      if (!data || data.length === 0) {
        return `Hmm, I couldn’t find any feedback data for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
    }
    

      // Initialize data structures
      const allAISummaries: { summary: string; term: string; year: string; instructor: string }[] = [];
      const allQuotes: { quote: string; term: string; year: string; instructor: string }[] = [];
      let totalSections = 0;

      data.forEach((section: any) => {
        const feedback = JSON.parse(section.feedback);
        const suggestedImprovements = feedback.suggestedImprovements;

        if (suggestedImprovements) {
          // Collect AI summaries
          allAISummaries.push({
            summary: suggestedImprovements.aiSummary,
            term: section.termOffered || "Unknown Term",
            year: section.year || "Unknown Year",
            instructor: section.instructor || "Unknown Instructor"
          });

          // Collect student quotes
          suggestedImprovements.studentQuotes.forEach((quote: string) => {
            allQuotes.push({
              quote,
              term: section.termOffered || "Unknown Term",
              year: section.year || "Unknown Year",
              instructor: section.instructor || "Unknown Instructor"
            });
          });

          totalSections++;
        }
      });

      if (totalSections === 0) {
        return `No suggested improvements feedback found for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''} in the ${department} department.`;
      }

      // Remove duplicates
      const uniqueQuotes = Array.from(new Set(allQuotes.slice(0, 25).map(q => JSON.stringify(q)))).map(q => JSON.parse(q));
      const uniqueAISummaries = Array.from(new Set(allAISummaries.slice(0, 10).map(s => JSON.stringify(s)))).map(s => JSON.parse(s));

      // Start building the response
      let response = `## Suggested Improvements for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''}\n\n`;

      // Include AI Summaries with course name, term, and instructor after each summary
      response += "### AI Summaries:\n\n";
      response += "<longshowmore>\n\n";

      uniqueAISummaries.forEach(({ summary, term, year, instructor }) => {
        response += `- "${summary}" ${courseName || courseId}, ${term} ${year} (Instructor: ${instructor})\n\n`;
      });

      response += "\n</longshowmore>\n\n";

      // Include Student Quotes with term, year, and instructor after each quote
      response += "### Student Suggestions:\n\n";
      response += "<longshowmore>\n\n";

      uniqueQuotes.forEach(({ quote, term, year, instructor }) => {
        response += `- "${quote}" ${courseName || courseId}, ${term} ${year} (Instructor: ${instructor})\n\n`;
      });

      response += "\n</longshowmore>\n\n";

      // Add a separator
      response += "\n\n<separator> \n </separator>\n\n";

      // Add call-to-actions to trigger other tools
      response += "### Want to Explore More?\n\n";

      // Include course and instructor in the call-to-actions if present
      const courseMention = courseName || courseId;
      const instructorMention = instructor ? ` taught by ${instructor}` : '';

      response += `<calltoaction> "Can I see the **Teaching Effectiveness** of **${courseMention}**${instructorMention}?" </calltoaction>\n`;
      response += `<calltoaction> "Tell me about **Student Engagement** in **${courseMention}**${instructorMention}." </calltoaction>\n`;
      response += `<calltoaction> "What are the **Learning Gains** from **${courseMention}**${instructorMention}?" </calltoaction>\n`;
      response += `<calltoaction> "How is the **Course Structure** of **${courseMention}**${instructorMention} organized?" </calltoaction>\n`;
      response += `<calltoaction> "Can you describe the **Course Difficulty** of **${courseMention}**${instructorMention}?" </calltoaction>\n`;

      return response;

    } catch (error) {
      console.error("Error in Suggested Improvements Tool:", error);
      if (error instanceof Error) {
        return `Error fetching suggested improvements: ${error.message}`;
      }
      return "An unexpected error occurred while fetching suggested improvements.";
    }
  }
};

export { findCourseFeedbackSuggestedImprovementsTool };