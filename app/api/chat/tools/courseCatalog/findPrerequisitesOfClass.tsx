import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import { findCourse } from "../lib";


const findPrerequisitesOfClass = {
    description: `Explains the immediate prerequisites of any class requested by the user. If a student asks whether they can take a particular class, use this tool to explain the prerequisites. Additionally, activate this tool if the user mentions prerequisites, requirements, or asks questions like 'What class do I need to take before taking this one? or "Do I need to take Math 15250 if I have already taken Math 15300 for Economic Analysis I?" Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
    parameters: z.object({
        department: z.enum(departments),
        userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204. Make"),
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

        console.log("firing findPrerequisitesOfClass")


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
      
            console.log(courseName)
            
            if (courseId === null && courseName === null) {
                return "Hmm, I’m sorry, but I couldn’t find the course you’re looking for. Just a heads-up, I can’t help with graduate-level or Booth courses yet. If you can provide the Course ID or Course Name for an undergraduate course from the University of Chicago catalog, I’d be happy to assist! I’ll also make a note of this and work on improving in the future!";
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

            // Modified query to handle both courseId and courseName cases
            const query = `
                MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
                WHERE 
                    CASE
                        WHEN $courseId IS NOT NULL THEN c.id = $courseId
                        ELSE c.name = $courseName
                    END
                WITH c
                OPTIONAL MATCH (c)-[:HAS_PREREQUISITE]->(prereq:Course)
                WITH 
                    c.name as CourseName,
                    c.id as CourseID,
                    c.prereqDescription as CoursePrereqDescription,
                    collect({
                        id: prereq.id,
                        name: prereq.name
                    }) as Prerequisites
                RETURN
                    CourseName,
                    CourseID,
                    CoursePrereqDescription,
                    Prerequisites
            `;

            const params = {
                department,
                courseId: courseId || null,
                courseName: courseName || null
            };

            const data = await graph.query(query, params);

            if (!data || data.length === 0) {
                return `No information found for ${courseName || courseId} in the ${department} department`;
            }

            const course = data[0];
            let response = `**Course:** ${course.CourseName} (${course.CourseID})\n`;
            
            if (course.CoursePrereqDescription) {
                response += `**Course Prerequisite Description:** ${course.CoursePrereqDescription}\n`;
            }

            if (course.Prerequisite) {
                if (course.Prerequisites && 
                    Array.isArray(course.Prerequisites) && 
                    course.Prerequisites.length > 0) {
                    response += "\n## Immediate Prerequisites:\n";
                    course.Prerequisites
                        .filter((prereq: any) => prereq.id && prereq.name)
                        .forEach((prereq: any) => {
                            response += `- ${prereq.name} (${prereq.id})\n`;
                        });
                } else {
                    response += "\n## Prerequisites: None\n";
                }
            }

            return response;

        } catch (error) {
            console.error("Error in findPrerequisitesOfClass:", error);
            if (error instanceof Error) {
                return `Error finding prerequisites: ${error.message}`;
            }
            return "An unexpected error occurred while finding prerequisites";
        }
    }
};

export { findPrerequisitesOfClass };