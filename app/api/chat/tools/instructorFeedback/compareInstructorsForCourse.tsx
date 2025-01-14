
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import { findCourse } from "../lib";
import { departmentGuardPrompt } from "../../toolPrompt";



const compareInstructorsForCourse = {
  description: `Provides comparative data about all instructors teaching a specific course in a specified term and year. If the term or year is not specified, defaults to ${process.env.CURRENT_QUARTER || 'Autumn'} and ${process.env.CURRENT_YEAR || '2023'}. The tool combines feedback metrics, student quotes, and schedule information for each instructor. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers. Use till tool when students ask for an easiest section for a specific class, "Easiest math 152 sequences.`,
  parameters: z.object({
    department: z.enum(departments),
    userCourseId: z.string().describe("The course ID consists of four capital letters followed by three to five digits (e.g., MATH 20700 or ECON 107). Users may omit the department, which is acceptable—just input the numbers (e.g., 107 or 204). If the department code is missing, use only the three- to five-digit number. Avoid using two-digit department codes like CS"),
    userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
    termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
    year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string").optional(),
  }),
  execute: async ({
    department,
    userCourseId, 
    userCourseName,
    year,
    termOffered,
  }: {
    department: string;
    userCourseId: string;
    userCourseName: string;
    year: string;
    termOffered: string;
  }): Promise<string> => {
    noStore();

    console.log("Executing compareInstructorsForCourse");

    try {
      // Set default term and year if not provided
      const currentTerm = termOffered || process.env.CURRENT_QUARTER || 'Autumn';
      const currentYear = year || process.env.CURRENT_YEAR || '2023';

      // Validate currentTerm and currentYear
      if (!currentTerm || !currentYear) {
        return `The term and year must be specified or set as environment variables.`;
      }

      if (!userCourseId && !userCourseName) {
        return `Please provide either a course ID or a course name.`;
      }

      console.log('department:', department);
      console.log('userCourseId:', userCourseId);
      console.log('userCourseName:', userCourseName);
      console.log('currentYear:', currentYear);
      console.log('currentTerm:', currentTerm);

      // Ensure userCourseId and userCourseName are strings
      const safeUserCourseId = userCourseId ?? '';
      const safeUserCourseName = userCourseName ?? '';

      const courseResult = await findCourse(department, safeUserCourseId, safeUserCourseName);

      let courseId = null;
      let courseName = null;

      if (courseResult && courseResult.length > 0) {
        // Assuming we pick the first result
        courseId = courseResult[0].courseId;
        courseName = courseResult[0].courseName;
      } else {
        return `Hmm, I couldn't find any course matching the provided information in the ${department} department. I’ll note this down and work on improving in the future!`;
      }

      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      const query = `
        MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
        WHERE 
          ($courseId <> '' AND c.id = $courseId) OR 
          ($courseName <> '' AND c.name = $courseName)
        MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
        WHERE 
          cs.year = $currentYear 
          AND cs.termOffered = $currentTerm
        // Find instructors teaching those sections
        MATCH (cs)-[:TAUGHT_BY]->(i:Instructor)
        MATCH (cs)-[:HAS_SCHEDULE]->(s:Schedule)
        // Collect historical feedback data for each instructor
        OPTIONAL MATCH (i)<-[:TAUGHT_BY]-(cs_all:CourseSection)
        WHERE cs_all.feedback IS NOT NULL
        // Collect feedback, term, and year
        WITH i, cs, s, collect(DISTINCT {
          feedback: cs_all.feedback,
          termOffered: cs_all.termOffered,
          year: cs_all.year
        }) as historicalFeedbacks
        // Collect schedules
        RETURN 
          i.nameSurname as instructor,
          cs.sectionId as sectionId,
          collect(DISTINCT {
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            location: s.location
          }) as schedules,
          historicalFeedbacks
        ORDER BY i.nameSurname, cs.sectionId
      `;

      const data = await graph.query(query, {
        department,
        courseId,
        courseName,
        currentYear,
        currentTerm,
      }) as any[];

      if (!data || data.length === 0) {
        return `Hmm, I couldn’t find any sections for ${courseId || courseName} in ${currentTerm} ${currentYear}. I’ll make a note of this and work on improving in the future!`;
      }

      // Aggregate data by instructor
      const instructors: any = {};

      data.forEach((record) => {
        const instructor = record.instructor;
        if (!instructors[instructor]) {
          instructors[instructor] = {
            instructor,
            sectionsTaught: 0,
            aggregatedMetrics: {},
            studentQuotes: [],
            schedules: [],
          };
        }

        // Increment sections taught
        instructors[instructor].sectionsTaught += 1;

        // Collect schedules
        instructors[instructor].schedules.push(...record.schedules);

        // Process historical feedback
        if (record.historicalFeedbacks) {
          record.historicalFeedbacks.forEach((feedbackEntry: any) => {
            if (!feedbackEntry.feedback) return;
            let feedback;
            try {
              feedback = JSON.parse(feedbackEntry.feedback);
            } catch (e) {
              console.error('Failed to parse feedback JSON:', feedbackEntry.feedback);
              return;
            }

            // Aggregate metrics
            const metrics = feedback.teachingEffectiveness?.instructorMetrics;
            if (metrics) {
              Object.entries(metrics).forEach(([key, value]: [string, any]) => {
                if (value.mean !== undefined && value.mean !== null) {
                  if (!instructors[instructor].aggregatedMetrics[key]) {
                    instructors[instructor].aggregatedMetrics[key] = {
                      total: 0,
                      count: 0,
                    };
                  }
                  const metricData = instructors[instructor].aggregatedMetrics[key] as { total: number; count: number };
                  metricData.total += value.mean;
                  metricData.count += 1;
                }
              });
            }

            // Collect student quotes
            if (feedback.teachingEffectiveness?.studentQuotes) {
              feedback.teachingEffectiveness.studentQuotes.slice(0,10).forEach((quote: string) => {
                instructors[instructor].studentQuotes.push({
                  quote,
                  term: feedbackEntry.termOffered || 'Unknown Term',
                  year: feedbackEntry.year || 'Unknown Year',
                });
              });
            }
          });
        }
      });

      // Calculate average metrics for each instructor
      Object.values(instructors).forEach((instructorData: any) => {
        const metricsKeys = Object.keys(instructorData.aggregatedMetrics);
        const averageMetrics: { [key: string]: number } = {};
        metricsKeys.forEach((key) => {
          const metricData = instructorData.aggregatedMetrics[key] as { total: number; count: number };
          averageMetrics[key] = parseFloat(
            (metricData.total / metricData.count).toFixed(2)
          );
        });
        instructorData.aggregatedMetrics = averageMetrics;
      });

      // Prepare response
      let response = `# Professor Data for ${courseName || courseId} in ${currentTerm} ${currentYear}\n\n`;

      response += `<fallback>Here is the data from the professors teaching ${courseName || courseId} to help you choose the best fit for you!</fallback>\n\n`;

      Object.values(instructors).forEach((instructorData: any, index) => {
        response += `## ${index + 1}. Instructor: ${instructorData.instructor}\n\n`;

        response += `### Teaching Effectiveness Metrics\n`;
        const metricsToDisplay = [
          'enhancedUnderstanding',
          'availableAndHelpful',
          'overallContribution',
        ];

        const metrics = Object.entries(instructorData.aggregatedMetrics)
          .filter(([key]) => metricsToDisplay.includes(key))
          .map(([key, value]) => ({
            name: key
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (str) => str.toUpperCase()),
            value: value as number,
          }));

        if (metrics.length > 0) {
          const chartData = {
            values: metrics.map((m) => m.value),
            labels: metrics.map((m) => m.name),
            max: "5",
          };

          response += `<barchart data='${JSON.stringify(chartData)}' ></barchart>\n\n`;
        } else {
          response += `No teaching effectiveness metrics available.\n\n`;
        }

        response += `\n### Student Feedback Highlights\n`;
        if (instructorData.studentQuotes.length > 0) {
          response += "<showmore>\n\n";
          // Select up to 3 random quotes
          const quotesToShow = instructorData.studentQuotes
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);
          quotesToShow.forEach(({ quote, term, year }: any) => {
            response += `- "${quote}" **${term} ${year}**\n`;
          });
          response += `\n</showmore>\n\n`;
        } else {
          response += `Hmm, no student feedback available.\n\nI’ll make a note of this and work on improving in the future!\n\n`;
        }

        response += `\n\n<separator>\n</separator>\n\n`;
      });

      response += "### Making a Decision\n";
      response += `I hope this information helps you choose the instructor that best fits your needs. If you have more questions, feel free to ask!\n\n`;

      // Add call-to-action examples
      response += "### Want to Learn More?\n";
      response += `<calltoaction>"Can I see more student quotes for one of these instructors?"</calltoaction>\n`;
      response += `<calltoaction>"What are the prerequisites for ${courseId || courseName}?"</calltoaction>\n`;
      response += `<calltoaction>"Are there any differences in the syllabi for these sections?"</calltoaction>\n`;

      return response;
    } catch (error) {
      console.error("Error in compareInstructorsForCourse:", error);
      return `Error comparing instructors: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
    }
  },
};

export { compareInstructorsForCourse };