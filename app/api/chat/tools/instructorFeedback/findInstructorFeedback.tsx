
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import departmentInstructors from "../../constants/department-instructors.json";
import { findCourse, findInstructor } from "../lib";

import { departmentGuardPrompt } from "../../toolPrompt";

const findInstructorFeedback = {
  description: `This tool analyzes an instructor's overall teaching performance across all courses, providing key feedback themes and relevant student quotes. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  parameters: z.object({
    department: z.enum(departments),
    userCourseId: z.string().describe("The course ID, e.g., MATH 20700 or ECON 107."),
    userCourseName: z.string().describe("The name of the course without numbers."),
    instructor: z.string().describe("The name of the instructor, corrected for any typos.")
  }),
  execute: async ({ department, userCourseId, userCourseName, instructor }: { department: string; userCourseId: string; userCourseName: string; instructor: string }): Promise<string> => {
    noStore();

    console.log("find Insturctor Feedback")

    // Validate and find the instructor
    if (instructor && instructor.trim() !== '') {
      const instructorResult = await findInstructor(department, instructor);
      if (instructorResult) {
        instructor = instructorResult;
      } else {
        return `Hmm, no instructor found matching the provided name in the ${department} department. I’ll make a note of this and work on improving in the future!`;
      }
    }

    let courseId: string | null = null;
    let courseName: string | null = null;

    if (userCourseId || userCourseName) {
      // Only find the course if userCourseId or userCourseName are provided
      // Provide default empty strings if undefined
      const courseResult = await findCourse(
        department,
        userCourseId ?? '',
        userCourseName ?? ''
      );

      if (!courseResult || courseResult.length === 0) {
        return `Hmm, I couldn't find any course matching the provided information in the ${department} department. I’ll note this down and work on improving in the future!`;
      }

      ({ courseId, courseName } = courseResult[0]);
    }

    if (!instructor) {
      let message = `Hey! I might not have information about that instructor in the ${department} department. Please try including the instructor's full name or verify that they are currently associated with this department. I’ll make sure to learn more about this instructor in the future.`;

      const departmentData = departmentInstructors.find((dep: any) => dep.department === department);
      let randomInstructors = ['our instructors', 'our instructors'];
      if (departmentData && departmentData.instructors.length > 1) {
        const instructorsList = departmentData.instructors;
        const shuffledInstructors = instructorsList.sort(() => 0.5 - Math.random());
        randomInstructors = shuffledInstructors.slice(0, 2).map((instr: any) => instr.instructor);
      }

      message += `
<separator>
</separator>

### Want to learn more?

<calltoaction> What is ${randomInstructors[0]}'s teaching style like? </calltoaction>
<calltoaction> How many classes has ${randomInstructors[1]} taught? </calltoaction>
`;

      return message;
    }

    try {
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      // Build the WHERE clause with available parameters
      const params: any = { department, instructor };
      let whereClause = "cs.instructor = $instructor AND cs.feedback IS NOT NULL";

      if (courseId) {
        whereClause += " AND c.id = $courseId";
        params.courseId = courseId;
      } else if (courseName) {
        whereClause += " AND c.name = $courseName";
        params.courseName = courseName;
      }

      const query = `
        MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
        MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
        WHERE ${whereClause}
        RETURN 
          cs.sectionId as sectionId,
          c.name as courseName,
          c.id as courseId,
          cs.termOffered as term,
          cs.year as year,
          cs.feedback as feedback
      `;

      const data = await graph.query(query, params);

      if (!data || data.length === 0) {
        let message = `Hmm, I couldn’t find any feedback for instructor ${instructor}`;

        if (courseId) {
          message += ` in course ID ${courseId}`;
        } else if (courseName) {
          message += ` in course "${courseName}"`;
        }

        message += ` in the **${department} department**. I’ll make a note of this and work on improving in the future!`;

        message += `

- Is the instructor's name spelled correctly?
- Is the instructor part of the specified department?
- Are there any recent changes to the instructor's courses?

<separator>
</separator>

### Want to learn more?

<calltoaction> What is ${instructor}'s teaching style like? </calltoaction>
`;

        return message;
      }

      // Process data to generate response
      let response = "## Teaching Effectiveness Summary\n\n";

      // Mention the course if specified
      if (courseId || courseName) {
        const courseDisplayName = courseId || courseName;
        response += `**This feedback is specific to the course "${courseDisplayName}".**\n\n`;
      }

      // Get the first available AI summary
      const feedbackData = JSON.parse(data[0].feedback);
      if (feedbackData.teachingEffectiveness?.aiSummary) {
        response += `${feedbackData.teachingEffectiveness.aiSummary}\n\n`;
      }

      // Include metrics if available
      const aggregatedMetrics: { [key: string]: { total: number; count: number } } = {};
      const allQuotes: { quote: string; courseName: string; term: string; year: string }[] = [];
      const taughtCourses = new Set<string>();

      data.forEach((section) => {
        if (!section.feedback) return;
        const feedback = JSON.parse(section.feedback);
        taughtCourses.add(`${section.courseName} (${section.courseId})`);

        const metrics = feedback.teachingEffectiveness?.instructorMetrics;
        if (metrics) {
          Object.entries(metrics).forEach(([key, value]: [string, any]) => {
            if (!aggregatedMetrics[key]) {
              aggregatedMetrics[key] = { total: 0, count: 0 };
            }
            aggregatedMetrics[key].total += value.mean;
            aggregatedMetrics[key].count++;
          });
        }

        if (feedback.teachingEffectiveness?.studentQuotes) {
          feedback.teachingEffectiveness.studentQuotes.slice(0,26).forEach((quote: string) => {
            allQuotes.push({
              quote,
              courseName: section.courseName,
              term: section.term,
              year: section.year,
            });
          });
        }
      });

      if (Object.keys(aggregatedMetrics).length > 0) {
        response += "## Key Metrics\n\n";

        const metricsToDisplay = ['enhancedUnderstanding', 'availableAndHelpful', 'overallContribution'];
        const metrics = Object.entries(aggregatedMetrics)
          .filter(([key]) => metricsToDisplay.includes(key))
          .map(([key, value]) => ({
            name: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            value: parseFloat((value.total / value.count).toFixed(2))
          }));

        const chartData = {
          values: metrics.map(m => m.value),
          labels: metrics.map(m => m.name),
          max: "5"
        };

        response += `<barchart data='${JSON.stringify(chartData)}'></barchart>\n\n`;
      }

      // Include student quotes with citations
      if (allQuotes.length > 0) {
        response += "## Student Feedback Highlights\n\n<showmore>\n\n";
        allQuotes.slice(0, 26).forEach(({ quote, courseName, term, year }) => {
          response += `- "${quote}" **${courseName}, ${term} ${year}**\n`;
        });
        response += "\n</showmore>\n\n";
      }

      response += "\n\n<separator>\n</separator>\n\n### Want to Learn More?\n\n";

      const coursesArray = Array.from(taughtCourses);

      if (coursesArray.length > 0) {
        const randomCourse = coursesArray[Math.floor(Math.random() * coursesArray.length)];
        response += `<calltoaction> Can I learn more about ${instructor}'s teaching in **${randomCourse}** in the ${department} department? </calltoaction>\n`;
      }

      response += `<calltoaction> Can I have **more student quotes** about ${instructor}'s teaching style in the ${department} department? </calltoaction>\n`;

      return response;
      
    } catch (error) {
      console.error("Error in findInstructorFeedback:", error);

      let message = `Error finding instructor feedback: ${error instanceof Error ? error.message : 'Unknown error'}.`;

      message += `

<separator>
</separator>

### Want to learn more?

<calltoaction> What is ${instructor}'s teaching style like? </calltoaction>
`;

      return message;
    }
  },
};

export { findInstructorFeedback };