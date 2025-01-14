
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import { findCourse } from "../lib";

type Schedule = {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    location: string;
};

type QueryResult = {
    courseName: string;
    courseId: string;
    sectionId?: string | null; // Updated to handle undefined or null
    instructor?: string | null; // Updated to handle undefined or null
    schedules: Schedule[];
};

const findCourseSectionsThisQuarter = {
    description: `Finds all sections of a specific course offered in a specific quarter and year mentioned by the user. If neither the time nor year is mentioned, use ${process.env.CURRENT_QUARTER} for the termOffered and ${process.env.CURRENT_YEAR} for the year as defaults. If the user does not mention the department ask it to mention the department to help you. Make sure you don't make courseIds up unless theya re provided by the user`,
    parameters: z.object({
        department: z.enum(departments),
        userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
        userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
        termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]),
        year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string"),
    }),
    execute: async ({ department, userCourseId, userCourseName, year, termOffered }: { 
        department: string;
        userCourseId: string;
        userCourseName: string;
        year: string;
        termOffered: string;
    }): Promise<string> => {
        noStore();  

        console.log("Executing findCourseSectionsThisQuarter", department, year, termOffered);

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
    
     
            const graph = await Neo4jGraph.initialize({
                url: process.env.NEO4J_URI!,
                username: process.env.NEO4J_USERNAME!,
                password: process.env.NEO4J_PASSWORD!
            });

            const query = `
                MATCH (c:Course)
                WHERE 
                    CASE
                        WHEN $courseId IS NOT NULL THEN c.id = $courseId
                        ELSE c.name = $courseName
                    END
                
                MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
                WHERE 
                    cs.year = $currentYear 
                    AND cs.termOffered = $currentQuarter

                OPTIONAL MATCH (cs)-[:TAUGHT_BY]->(i:Instructor)
                OPTIONAL MATCH (cs)-[:HAS_SCHEDULE]->(s:Schedule)
                
                RETURN 
                    c.name as courseName,
                    c.id as courseId,
                    cs.sectionId as sectionId,
                    i.nameSurname as instructor,
                    collect(DISTINCT {
                        dayOfWeek: s.dayOfWeek,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        location: s.location
                    }) as schedules
                ORDER BY cs.sectionId
            `;
            const data = await graph.query(query, {
                courseId: courseId,
                courseName: courseName,
                currentYear: year,
                currentQuarter: termOffered
            }) as QueryResult[];

            console.log("Query Result:", data);

            if (!data || data.length === 0) {
                return `Hmm, I couldn’t find any sections for ${courseId || courseName} in ${termOffered} ${year}. I’ll make a note of this and work on improving in the future!`;
            }
            
            let response = `## ${data[0].courseName} (${data[0].courseId})\n`;
            response += "<showmore>\n\n";
            response += `## Sections for ${termOffered} ${year}\n`;

            data.forEach((section) => {
                // Only display section information if sectionId is not null
                if (section.sectionId) {
                    response += `- **Section ${section.sectionId}**\n`;
                } else {
                    response += `- **Section**\n`;
                }

                // Only display instructor if available
                if (section.instructor) {
                    response += `Instructor: **${section.instructor}.**\n`;
                }

                if (section.schedules && section.schedules.length > 0) {
                    response += `Schedule: \n`;
                    
                    section.schedules
                        .filter(schedule => schedule.dayOfWeek && schedule.startTime && schedule.endTime)
                        .sort((a, b) => {
                            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                            return days.indexOf(a.dayOfWeek) - days.indexOf(b.dayOfWeek);
                        })
                        .forEach((schedule) => {
                            response += `- ${schedule.dayOfWeek} ${schedule.startTime}-${schedule.endTime}`;
                            if (schedule.location) {
                                response += ` @ ${schedule.location}`;
                            }
                            response += '\n\n';
                        });
                } else {
                    response += `No schedule information available.\n`;
                }

                response += '\n';
            });

            response += `\n</showmore>\n\n`;

            // Add separator and "Want to Learn More?" section with connected call to actions
            response += "\n\n<separator>\n</separator>\n\n";
            response += '### Want to Learn More?\n';
            
            // If there are multiple instructors, suggest viewing specific instructor schedules
            const instructors = data
                .map(section => section.instructor)
                .filter((instructor, index, self) => instructor && self.indexOf(instructor) === index);

            if (instructors.length > 0) {
                const randomInstructor = instructors[Math.floor(Math.random() * instructors.length)];
                response += `<calltoaction>"What is ${randomInstructor}'s schedule for ${data[0].courseId}?"</calltoaction>\n`;
            }
            
            // Add call to action for course feedback
            response += `<calltoaction>"What do students say about ${data[0].courseName}?"</calltoaction>\n`;
            
            // Add call to action for prerequisites
            response += `<calltoaction>"What are the prerequisites for ${data[0].courseId}?"</calltoaction>\n`;

            return response;

        } catch (error) {
            console.error("Error in findCourseSectionsThisQuarter:", error);
            return `Error finding course sections: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
};

export { findCourseSectionsThisQuarter };