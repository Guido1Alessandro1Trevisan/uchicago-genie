import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departmentGuardPrompt } from "../../toolPrompt";

import { departments } from "../../constants/departments";

import courses from "../../constants/department-courses.json";
import { findCourse, findInstructor } from "../lib";



const findCourseFeedbackCourseDifficultyTool = {
  description: `Assesses the overall difficulty of the course from the students' perspective.
  Provides summaries and student comments on difficulty levels and course suitability. Includes the weighted average of hours per week committed outside of sessions. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  
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

    console.log("firing findCourseFeedbackCourseDifficultyTool")

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
        WHERE ($courseId IS NOT NULL AND c.id = $courseId) OR ($courseId IS NULL AND c.name = $courseName)
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

      let params;
      if (courseId !== null && courseId !== "") {
        params = {
          department,
          courseId: courseId,
          courseName: null,
          instructor: instructor || null
        };
      } else {
        params = {
          department,
          courseId: null,
          courseName: courseName || null,
          instructor: instructor || null
        };
      }

      const data = await graph.query(query, params);

      if (!data || data.length === 0) {
        return `Hmm, I couldn’t find any feedback data for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
      }

      // Initialize data structures
      const allAISummaries: { summary: string; term: string; year: string; instructor: string }[] = [];
      const allQuotes: { quote: string; term: string; year: string; instructor: string }[] = [];
      const hoursPerSection: number[] = [];

      data.forEach((section: any) => {
        if (!section.feedback) {
          console.warn(`Skipping section with missing feedback: ${JSON.stringify(section)}`);
          return;
        }

        let feedback;
        try {
          feedback = JSON.parse(section.feedback);
        } catch (err) {
          console.error(`Error parsing feedback JSON for section ${section.sectionId}: ${err}`);
          return;
        }

        const courseDifficulty = feedback.courseDifficulty;
        const studentEngagement = feedback.studentEngagement;

        if (courseDifficulty) {
          // Collect AI summaries
          if (courseDifficulty.aiSummary) {
            allAISummaries.push({
              summary: courseDifficulty.aiSummary,
              term: section.termOffered || "Unknown Term",
              year: section.year || "Unknown Year",
              instructor: section.instructor || "Unknown Instructor"
            });
          }

          // Collect student quotes
          if (courseDifficulty.studentQuotes && Array.isArray(courseDifficulty.studentQuotes)) {
            courseDifficulty.studentQuotes.forEach((quote: string) => {
              allQuotes.push({
                quote,
                term: section.termOffered || "Unknown Term",
                year: section.year || "Unknown Year",
                instructor: section.instructor || "Unknown Instructor"
              });
            });
          }

          // Calculate weighted average for hoursPerWeekOutsideOfSession
          const hoursDistribution = studentEngagement?.hoursPerWeekOutsideOfSession?.distribution || {};
          let weightedHours = 0;
          let totalPercentage = 0;
          for (const range in hoursDistribution) {
            const percentageStr = hoursDistribution[range];
            if (percentageStr && parseFloat(percentageStr.replace('%', '')) > 0) {
              const percentage = parseFloat(percentageStr.replace('%', '')) / 100;
              const representativeValue = estimateRepresentativeValue(range);
              weightedHours += representativeValue * percentage;
              totalPercentage += percentage;
            }
          }
          if (totalPercentage > 0) {
            weightedHours = weightedHours / totalPercentage;
            hoursPerSection.push(weightedHours);
          }
        }
      });
      
      if (allAISummaries.length === 0 && allQuotes.length === 0 && hoursPerSection.length === 0) {
        return `Hmm, I couldn’t find any course difficulty feedback for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
    }
    

      // Calculate overall averages
      const averageHoursPerWeek = hoursPerSection.length > 0 ? (hoursPerSection.reduce((a, b) => a + b, 0) / hoursPerSection.length).toFixed(2) : "N/A";

      // Remove duplicates
      const uniqueQuotes = Array.from(new Set(allQuotes.map(q => JSON.stringify(q)))).map(q => JSON.parse(q));
      const uniqueAISummaries = Array.from(new Set(allAISummaries.slice(0, 10).map(s => JSON.stringify(s)))).map(s => JSON.parse(s));

      // Start building the response
      let response = `## Course Difficulty for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''}\n\n`;

      if (averageHoursPerWeek !== "N/A") {
        const maxAverageHoursPerWeek = Math.round(parseFloat(averageHoursPerWeek)) + 10;
        const chartData1 = {
          values: [parseFloat(averageHoursPerWeek)],
          labels: ["Weekly Hours"],
          max: maxAverageHoursPerWeek
        };

        console.log(maxAverageHoursPerWeek);

        response += `<barchart data='${JSON.stringify(chartData1)}' ></barchart>\n\n`;
          
      } else {
        response += `### Weighted Average Hours per Week Outside of Session: **No data available**\n\n`;
      }

      // Include AI Summaries with course name, term, and instructor after each summary
      if (uniqueAISummaries.length > 0) {
        response += "### AI Summaries:\n\n";
        response += "<longshowmore>\n\n";

        uniqueAISummaries.forEach(({ summary, term, year, instructor }) => {
          response += `- "${summary}" ${courseName || courseId}, ${term} ${year} (Instructor: ${instructor})\n\n`;
        });

        response += "\n</longshowmore>\n\n";
      }

      // Include Student Quotes with term, year, and instructor after each quote
      if (uniqueQuotes.length > 0) {
        response += "### Student Quotes:\n\n";
        response += "<longshowmore>\n\n";

        uniqueQuotes.slice(0, 25).forEach(({ quote, term, year, instructor }) => {
          response += `- "${quote}" ${courseName || courseId}, ${term} ${year} (Instructor: ${instructor})\n\n`;
        });

        response += "\n</longshowmore>\n\n";
      }

      // Add a separator
      response += "\n\n<separator> \n </separator>\n\n";

      // Add call-to-actions to trigger other tools
      response += "### Want to Learn More?\n\n";

      // Include course and instructor in the call-to-actions if present
      const courseMention = courseName || courseId;

      response += `<calltoaction> "Can I have the overall course feedback on **${courseMention}**?" </calltoaction>\n`;


      return response;

    } catch (error) {
      console.error("Error in Course Difficulty Tool:", error);
      if (error instanceof Error) {
        return `Error fetching course difficulty: ${error.message}`;
      }
      return "An unexpected error occurred while fetching course difficulty.";
    }
  }
};

// Helper function to estimate representative value from a range like "0-2 hours", "3-5 hours", or "12+ hours"
function estimateRepresentativeValue(range: string): number {
  if (range.includes('+')) {
    // For ranges like "12+ hours"
    const min = parseFloat(range.replace('+', '').trim());
    return min + 2; // Estimating a reasonable value beyond the minimum
  } else if (range.includes('-')) {
    // For ranges like "3-5 hours"
    const [minStr, maxStr] = range.split('-');
    const min = parseFloat(minStr.trim());
    const max = parseFloat(maxStr.replace(/[^\d.]/g, '').trim()); // Remove non-numeric characters
    return (min + max) / 2;
  } else {
    // Single value
    return parseFloat(range.replace(/[^\d.]/g, '').trim());
  }
}

// Helper function to find the next two courses
const findNextTwoCourses = (departmentName: string, courseCode: string): any[] => {
  const department = courses.find((dept: any) => dept.departmentName === departmentName);
  if (!department) {
    console.log("Department not found.");
    return [];
  }

  const departmentCourses = department.courses;
  const index = departmentCourses.findIndex((course: any) => course[0] === courseCode);

  if (index === -1) {
    console.log("Course not found.");
    return [];
  }

  return departmentCourses.slice(index + 1, index + 3);
};

export { findCourseFeedbackCourseDifficultyTool };