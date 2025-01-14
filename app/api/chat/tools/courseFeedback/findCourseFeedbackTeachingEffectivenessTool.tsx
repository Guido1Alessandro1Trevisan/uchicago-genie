import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import { departmentGuardPrompt } from "../../toolPrompt";
import { findCourse, findInstructor } from "../lib";


const findCourseFeedbackTeachingEffectivenessTool = {
  description: `Evaluates the effectiveness of the course instructor's teaching methods.  Provides summaries, student quotes, AI references, and detailed instructor metrics. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  
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

    console.log("firing findCourseFeedbackTeachingEffectivenessTool")


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
        return `Hmm, I couldn’t find any feedback data for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''} in the ${department} department. I’ll note this down and work on improving in the future!`;
    }
    

      // Initialize data structures
      const allAISummaries: { summary: string; term: string; year: string; instructor: string }[] = [];
      const allQuotes: { quote: string; term: string; year: string; instructor: string }[] = [];
      const allAIReferences: { reference: string; term: string; year: string; instructor: string }[] = [];
      const instructorMetricsTotals: { [key: string]: { mean: number; median: number; stronglyAgree: number } } = {};
      let totalSections = 0;

      data.forEach((section: any) => {
        const feedback = JSON.parse(section.feedback);
        const teachingEffectiveness = feedback.teachingEffectiveness;

        if (teachingEffectiveness) {
          // Collect AI summaries
          allAISummaries.push({
            summary: teachingEffectiveness.aiSummary,
            term: section.termOffered || "Unknown Term",
            year: section.year || "Unknown Year",
            instructor: section.instructor || "Unknown Instructor"
          });

          // Collect AI references
          if (teachingEffectiveness.aiReferences && Array.isArray(teachingEffectiveness.aiReferences)) {
            teachingEffectiveness.aiReferences.forEach((reference: string) => {
              allAIReferences.push({
                reference,
                term: section.termOffered || "Unknown Term",
                year: section.year || "Unknown Year",
                instructor: section.instructor || "Unknown Instructor"
              });
            });
          }

          // Collect student quotes
          teachingEffectiveness.studentQuotes.forEach((quote: string) => {
            allQuotes.push({
              quote,
              term: section.termOffered || "Unknown Term",
              year: section.year || "Unknown Year",
              instructor: section.instructor || "Unknown Instructor"
            });
          });

          // Aggregate instructor metrics
          for (const metric in teachingEffectiveness.instructorMetrics) {
            const metricData = teachingEffectiveness.instructorMetrics[metric];
            if (!instructorMetricsTotals[metric]) {
              instructorMetricsTotals[metric] = { mean: 0, median: 0, stronglyAgree: 0 };
            }
            instructorMetricsTotals[metric].mean += metricData.mean;
            instructorMetricsTotals[metric].median += metricData.median;
            instructorMetricsTotals[metric].stronglyAgree += parseFloat(metricData.stronglyAgree.replace('%', ''));
          }
          totalSections++;
        }
      });

      if (totalSections === 0) {
        return `No teaching effectiveness feedback found for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''} in the ${department} department.`;
      }

      // Calculate averages
      const instructorMetricsAverages: { [key: string]: { mean: string; median: string; stronglyAgree: string } } = {};
      for (const metric in instructorMetricsTotals) {
        instructorMetricsAverages[metric] = {
          mean: (instructorMetricsTotals[metric].mean / totalSections).toFixed(2),
          median: (instructorMetricsTotals[metric].median / totalSections).toFixed(2),
          stronglyAgree: `${(instructorMetricsTotals[metric].stronglyAgree / totalSections).toFixed(2)}%`,
        };
      }

      // Remove duplicates
      const uniqueQuotes = Array.from(new Set(allQuotes.map(q => JSON.stringify(q)))).map(q => JSON.parse(q));
      const uniqueAIReferences = Array.from(new Set(allAIReferences.map(r => JSON.stringify(r)))).map(r => JSON.parse(r));
      const uniqueAISummaries = Array.from(new Set(allAISummaries.map(s => JSON.stringify(s)))).map(s => JSON.parse(s));

      // Start building the response
      let response = `## Teaching Effectiveness for ${courseName || courseId}${instructor ? ' taught by ' + instructor : ''}\n\n`;

      // Include AI Summaries with course name, term, and instructor after each summary
      response += "### AI Summaries:\n\n";
      response += "<longshowmore>\n\n";

      uniqueAISummaries.slice(0, 10).forEach(({ summary, term, year, instructor }) => {
        response += `- "${summary}" ${courseName || courseId}, ${term} ${year} (Instructor: ${instructor})\n\n`;
      });

      

      response += "\n</longshowmore>\n\n";

      // Include AI References with term, year, and instructor
      if (uniqueAIReferences.length > 0) {
        response += "### AI References:\n\n";
        response += "<longshowmore>\n\n";

        uniqueAIReferences.forEach(({ reference, term, year, instructor }) => {
          response += `- "${reference}" ${courseName || courseId}, ${term} ${year} (Instructor: ${instructor})\n\n`;
        });

        response += "\n</longshowmore>\n\n";
      }

      // Include Student Quotes with term, year, and instructor after each quote
      response += "### Student Quotes:\n\n";
      response += "<longshowmore>\n\n";

      uniqueQuotes.slice(0, 25).forEach(({ quote, term, year, instructor }) => {
        response += `- "${quote}" ${courseName || courseId}, ${term} ${year} (Instructor: ${instructor})\n\n`;
      });

      response += "\n</longshowmore>\n\n";

      // Include instructor metrics
      if (Object.keys(instructorMetricsAverages).length > 0) {
        response += "### Instructor Metrics:\n\n";
        
        // Prepare data for the chart
        const metricsToChart = Object.keys(instructorMetricsAverages).map(metric => ({
          key: metric,
          label: metric.replace(/([A-Z])/g, ' $1').trim().replace(/\b\w/g, char => char.toUpperCase()),
          value: parseFloat(instructorMetricsAverages[metric].mean)
        }));
        
        const chartData = {
          values: metricsToChart.map(metric => metric.value),
          labels: metricsToChart.map(metric => metric.label),
          max: 5
        };
        
        response += `<barchart data='${JSON.stringify(chartData)}' ></barchart>\n\n`;
      }

      // Add a separator
      response += "\n\n<separator> \n </separator>\n\n";

      // Add call-to-actions to trigger other tools
      response += "### Want to Learn More?\n\n";

      // Include course and instructor in the call-to-actions if present
      const courseMention = courseName || courseId;
      const instructorMention = instructor ? ` taught by ${instructor}` : '';

    
      response += `<calltoaction> "What are the **Suggested Improvements** for **${courseMention}**${instructorMention}?" </calltoaction>\n`;
      response += `<calltoaction> "Tell me about **Student Engagement** in **${courseMention}**${instructorMention}." </calltoaction>\n`;
      response += `<calltoaction> "What are the **Learning Gains** from **${courseMention}**${instructorMention}?" </calltoaction>\n`;
      response += `<calltoaction> "How is the **Course Structure** of **${courseMention}**${instructorMention} organized?" </calltoaction>\n`;
      response += `<calltoaction> "Can you describe the **Course Difficulty** of **${courseMention}**${instructorMention}?" </calltoaction>\n`;

      return response;

    } catch (error) {
      console.error("Error in Teaching Effectiveness Tool:", error);
      if (error instanceof Error) {
        return `Error fetching teaching effectiveness: ${error.message}`;
      }
      return "An unexpected error occurred while fetching teaching effectiveness.";
    }
  }
};

export { findCourseFeedbackTeachingEffectivenessTool };
