
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';

import { departments } from "../../constants/departments";

import { findDegreeTrack } from "../lib";
import { findCourse } from "../lib";

type DegreeSection = {
    name: string;
    description: string;
};

const findCourseCountsTowardsDegreeNotCore = {
    description: `Verifies whether a specific course counts towards a degree track's requirements and indicates in which section(s) it counts. Do not use this tool if the user inquires about classes that count toward the Core Curriculum or Core. If the user does not mention the department of the course or the degree track, and you can try to infer it from the context, explicitly ask the user to specify the department for either the course or the degree track. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
    parameters: z.object({
        departmentOfCourse: z.enum(departments).describe("The department of the course the user mentions"),
        departmentOfDegreeTrack: z.enum(departments).describe("The department of the degree track"),
        userQuery: z.string().describe("The user's query"),
        userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
        userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
        userDegreeTrack: z.string().describe("This is the name of the Degree Track that the user has specified."),
    }),
    execute: async ({
        departmentOfCourse,
        departmentOfDegreeTrack,
        userCourseId,
        userCourseName,
        userDegreeTrack
    }: {
        departmentOfCourse: string;
        departmentOfDegreeTrack?: string;
        userCourseId?: string;
        userCourseName?: string;
        userDegreeTrack?: string;
    }): Promise<string> => {
        noStore();

        console.log("firing findCourseCountsTowardsDegree department of course", departmentOfCourse, "department of degree track", departmentOfDegreeTrack);

        try {
            // Ensure userCourseId and userCourseName are strings
            const courseIdInput = userCourseId ?? '';
            const courseNameInput = userCourseName ?? '';

            // Fetch courseId and courseName from user's query
            const courseResult = await findCourse(departmentOfCourse, courseIdInput, courseNameInput);
        
            let courseId = null;
            let courseName = null;
      
            if (courseResult && courseResult.length > 0) {
                // Assuming we pick the first result
                courseId = courseResult[0].courseId;
                courseName = courseResult[0].courseName;
            } else {
                return `Hmm, I couldn't find any course matching the provided information in the ${departmentOfCourse} department. I’ll note this down and work on improving in the future!`;
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

            let query: string;
            let params: any;

            if (userDegreeTrack) {
                // Ensure departmentOfDegreeTrack and userDegreeTrack are strings
                const degreeDepartment = departmentOfDegreeTrack ?? '';
                const degreeName = userDegreeTrack ?? '';

                // Fetch degreeTrackName from user's query
                const degreeTrack = await findDegreeTrack(degreeDepartment, degreeName);

                console.log("Course info", courseId, courseName);
                console.log("Degree track", degreeTrack);

                // Check if degreeTrack is successfully extracted
                if (!degreeTrack) {
                    return `Hey, I'm sorry, but I wasn't able to find the degree track you're looking for. Please provide the accurate name of the degree track, and I'd be happy to assist!`;
                }

                // Prepare params
                params = {
                    degreeTrack: degreeTrack,
                    departmentOfDegreeTrack: degreeDepartment,
                    courseId: courseId || null,
                    courseName: courseName || null
                };

                console.log('Parameters for Neo4j query:', params);

                // Query to check if the course counts towards the specified degree track
                query = `
                    MATCH (dt:DegreeTrack {name: $degreeTrack})<-[:OFFERS]-(d:Department {name: $departmentOfDegreeTrack})
                    MATCH (c:Course)
                    WHERE 
                        CASE
                            WHEN $courseId IS NOT NULL AND $courseId <> '' THEN c.id = $courseId
                            WHEN $courseName IS NOT NULL AND $courseName <> '' THEN c.name = $courseName
                            ELSE FALSE
                        END
                    OPTIONAL MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)-[:REQUIRES]->(c)
                    RETURN
                        dt.name AS degreeName,
                        dt.type AS degreeType,
                        d.name AS degreeDepartment,
                        c.name AS courseName,
                        c.id AS courseId,
                        [section IN COLLECT(ds) | {name: section.name, description: section.description}] AS sectionDetails,
                        EXISTS((dt)-[:HAS_SECTION]->(:DegreeSection)-[:REQUIRES]->(c)) AS countsTowardsDegree
                `;

            } else {
                // When userDegreeTrack is not specified, check all DegreeTracks
                // Prepare params
                params = {
                    courseId: courseId || null,
                    courseName: courseName || null
                };

                if (departmentOfDegreeTrack) {
                    params.departmentOfDegreeTrack = departmentOfDegreeTrack;
                    query = `
                        MATCH (dt:DegreeTrack)<-[:OFFERS]-(d:Department {name: $departmentOfDegreeTrack})
                        MATCH (c:Course)
                        WHERE 
                            CASE
                                WHEN $courseId IS NOT NULL AND $courseId <> '' THEN c.id = $courseId
                                WHEN $courseName IS NOT NULL AND $courseName <> '' THEN c.name = $courseName
                                ELSE FALSE
                            END
                        OPTIONAL MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)-[:REQUIRES]->(c)
                        RETURN
                            dt.name AS degreeName,
                            dt.type AS degreeType,
                            d.name AS degreeDepartment,
                            c.name AS courseName,
                            c.id AS courseId,
                            COLLECT(DISTINCT ds) AS sectionDetails,
                            EXISTS((dt)-[:HAS_SECTION]->(:DegreeSection)-[:REQUIRES]->(c)) AS countsTowardsDegree
                    `;
                } else {
                    // No department specified, search across all departments
                    query = `
                        MATCH (dt:DegreeTrack)<-[:OFFERS]-(d:Department)
                        MATCH (c:Course)
                        WHERE 
                            CASE
                                WHEN $courseId IS NOT NULL AND $courseId <> '' THEN c.id = $courseId
                                WHEN $courseName IS NOT NULL AND $courseName <> '' THEN c.name = $courseName
                                ELSE FALSE
                            END
                        OPTIONAL MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)-[:REQUIRES]->(c)
                        RETURN
                            dt.name AS degreeName,
                            dt.type AS degreeType,
                            d.name AS degreeDepartment,
                            c.name AS courseName,
                            c.id AS courseId,
                            COLLECT(DISTINCT ds) AS sectionDetails,
                            EXISTS((dt)-[:HAS_SECTION]->(:DegreeSection)-[:REQUIRES]->(c)) AS countsTowardsDegree
                    `;
                }
            }

            const data = await graph.query(query, params);

            console.log('Neo4j Query Result:', data);

            if (!data || data.length === 0) {
                return `Hmm, I couldn’t find any information about the course "${courseName || courseId}" in relation to any degree tracks. Please verify the course details, and I’ll make a note of this to work on improving in the future!`;
            }
            
            // Prepare the response
            let response = `## Course Requirement Check\n`;
            response += `**Course:** ${data[0].courseName || courseName} (${data[0].courseId || courseId})\n\n`;

            data.forEach((result: any) => {
                if (result.countsTowardsDegree) {
                    response += `### Degree Track: ${result.degreeName} (${result.degreeDepartment})\n`;
                    response += `✅ Yes, **${result.courseName || courseName}** counts towards **${result.degreeName}** in the following section(s):\n\n`;

                    result.sectionDetails.forEach((section: DegreeSection) => {
                        if (section) {
                            response += `- **${section.name}**\n`;
                            if (section.description) {
                                response += `  ${section.description}\n`;
                            }
                            response += '\n';
                        }
                    });
                } else {
                    response += `### Degree Track: ${result.degreeName} (${result.degreeDepartment})\n`;
                    response += `❌ No, **${result.courseName || courseName}** does not count towards **${result.degreeName}**.\n\n`;
                }
            });

            return response;

        } catch (error) {
            console.error("Error in findCourseCountsTowardsDegree:", error);
            if (error instanceof Error) {
                return `Error checking course requirements: ${error.message}`;
            }
            return "An unexpected error occurred while checking course requirements";
        }
    }
};

export { findCourseCountsTowardsDegreeNotCore };