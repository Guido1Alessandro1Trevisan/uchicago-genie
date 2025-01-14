
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';

import { departments } from "../../constants/departments";
import { findCourse } from "../lib";

const findWhatClassesICanTakeTool = {
    description: `Finds classes a student can take after completing a specific class. If a student wants to know what classes they can take after completing a course, use this tool to return the list of courses that have the given course as a prerequisite. Include information about each course, such as its name, ID, and any prerequisite descriptions. This tool is also triggered if a user asks about classes related. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
    parameters: z.object({
        department: z.enum(departments),
        userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
        userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
        termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
        year: z.string()
            .regex(/^\d{4}$/, "Year must be a four-digit string")
            .optional(),
    }),
    execute: async ({
        department,
        userCourseId,
        userCourseName,
        termOffered,
        year,
    }: {
        department: string,
        userCourseId: string,
        userCourseName: string,
        termOffered?: "Autumn" | "Winter" | "Spring" | "Summer",
        year?: string,
    }): Promise<string> => {
        noStore();

        console.log("Executing findWhatClassesICanTakeTool");

        try {
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
      
       
            console.log(`Course ID: ${courseId}, Course Name: ${courseName}, ${termOffered}, ${year}, ${department}`);

            if (courseId === null && courseName === null) {
                return "Hmm, I’m sorry, but I couldn’t find the course you’re looking for. Just a heads-up, I can’t help with graduate-level or Booth courses yet. If you can provide the Course ID or Course Name for an undergraduate course from the University of Chicago catalog, I’d be happy to assist! I’ll also note this down and work on improving in the future!";
            }
            
            

            const url = process.env.NEO4J_URI;
            const username = process.env.NEO4J_USERNAME;
            const password = process.env.NEO4J_PASSWORD;

            if (!url || !username || !password) {
                throw new Error("Missing Neo4j credentials");
            }

            const graph = await Neo4jGraph.initialize({
                url,
                username,
                password
            });

            // Build the query to find courses that have the given course as a prerequisite
            let query = `
                MATCH (course)-[:HAS_PREREQUISITE]->(prereqCourse:Course)
                WHERE 
                    CASE
                        WHEN $courseId IS NOT NULL THEN prereqCourse.id = $courseId
                        ELSE prereqCourse.name = $courseName
                    END
            `;

            // Add filters for termOffered and year if they are provided
            if (termOffered || year) {
                query += `
                    OPTIONAL MATCH (course)<-[:SECTION_OF]-(cs:CourseSection)
                `;

                const whereClauses = [];
                if (termOffered) {
                    whereClauses.push(`cs.termOffered = $termOffered`);
                }
                if (year) {
                    whereClauses.push(`cs.year = $year`);
                }
                if (whereClauses.length > 0) {
                    query += `
                        WHERE ${whereClauses.join(' AND ')}
                    `;
                }
            }

            query += `
                RETURN DISTINCT
                    course.name AS CourseName,
                    course.id AS CourseID,
                    course.description AS CourseDescription,
                    course.prereqDescription AS CoursePrereqDescription
            `;

            const params = {
                department,
                courseId: courseId || null,
                courseName: courseName || null,
                termOffered: termOffered || null,
                year: year || null,
            };

            const data = await graph.query(query, params);

            if (!data || data.length === 0) {
                let response = `No courses found that have ${courseName || courseId} as a prerequisite in the ${department} department${termOffered ? ` for the ${termOffered} term` : ''}${year ? ` in the year ${year}` : ''}.`;

                response += `<calltoaction> Suggest me some courses based on my interests in ${courseName || courseId} in the ${department} Department by doing a quick sematic search </calltoaction>`
                return response


            }

            let response = `Courses you can take after completing ${courseName || courseId}:\n\n`;

            data.forEach((course: any, index: number) => {
                response += `## ${index + 1}. Course: ${course.CourseName} (${course.CourseID})\n`;
                if (course.CourseDescription) {
                    response += `**Description:** ${course.CourseDescription}\n`;
                }
                if (course.CoursePrereqDescription) {
                    response += `**Prerequisite Description:** ${course.CoursePrereqDescription}\n`;
                }
                response += "\n";
            });

            return response;

        } catch (error) {
            console.error("Error in findWhatClassesICanTakeTool:", error);
            if (error instanceof Error) {
                return `Error finding available classes: ${error.message}`;
            }
            return "An unexpected error occurred while finding available classes";
        }
    }
};

export { findWhatClassesICanTakeTool };