import { z } from "zod";
import OpenAI from "openai";
import { unstable_noStore as noStore } from 'next/cache';

import { departments } from "../../constants/departments";

import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "langchain/document";
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const suggestCoursesBasedOnInterests = {
    description: `Suggests 10 courses based on the user's interests by searching through course descriptions and includes when the courses are offered.`,
    parameters: z.object({
        interests: z.string().describe("The user's interests or keywords related to desired courses"),
        termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
        year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string").optional(),
    }),
    execute: async ({
        interests,
        termOffered,
        year,
    }: {
        interests: string;
        termOffered?: "Autumn" | "Winter" | "Spring" | "Summer";
        year?: string;
    }): Promise<string> => {
        noStore();

        console.log("Executing suggestCoursesBasedOnInterests tool");
        const department = null

        try {
            // Initialize the Neo4j graph
            const graph = await Neo4jGraph.initialize({
                url: process.env.NEO4J_URI!,
                username: process.env.NEO4J_USERNAME!,
                password: process.env.NEO4J_PASSWORD!,
            });

            // Build the Cypher query dynamically based on provided parameters
            let cypher = '';
            let params: any = {};

            // Start constructing the query
            cypher += 'MATCH (c:Course)';

            // If department is provided, match courses offered by the department
            if (department) {
                cypher += `
                    MATCH (d:Department {name: $department})-[:OFFERS]->(c)
                `;
                params.department = department;
            }

            // If termOffered or year is provided, match only the courses that have sections in that term/year
            if (termOffered || year) {
                cypher += `
                    MATCH (c)<-[:SECTION_OF]-(cs:CourseSection)
                `;
                let whereClauses = [];
                if (termOffered) {
                    whereClauses.push('cs.termOffered = $termOffered');
                    params.termOffered = termOffered;
                }

                if (year) {
                    whereClauses.push('cs.year = $year');
                    params.year = year;
                }

                if (whereClauses.length > 0) {
                    cypher += `
                        WHERE ${whereClauses.join(' AND ')}
                    `;
                }
            } else {
                // If no termOffered or year specified, optionally match course sections
                cypher += `
                    OPTIONAL MATCH (c)<-[:SECTION_OF]-(cs:CourseSection)
                `;
            }

            // Return course information
            cypher += `
                RETURN c.name AS courseName,
                       c.id AS courseId,
                       c.description AS description,
                       collect(DISTINCT cs.termOffered) AS termsOffered,
                       collect(DISTINCT cs.year) AS yearsOffered
            `;

            const data = await graph.query(cypher, params);

            if (!data || data.length === 0) {
                return `No courses found${
                    department ? ` in the ${department} department` : ''
                }${
                    termOffered ? ` offered in ${termOffered}` : ''
                }${
                    year ? ` in the year ${year}` : ''
                }.`;
            }

            // Prepare course data
            const allCourses = data.map((course) => ({
                pageContent: course.description || '',
                metadata: {
                    courseName: course.courseName,
                    courseId: course.courseId,
                    termsOffered: (course.termsOffered || []).filter((term: any) => term != null),
                    yearsOffered: (course.yearsOffered || []).filter((yr: any) => yr != null),
                },
            }));

            // Filter out courses without valid descriptions
            const coursesWithValidDescriptions = allCourses.filter(
                (course) => {
                    const description = course.pageContent.trim();
                    // Exclude courses with empty descriptions
                    if (description === '') {
                        return false;
                    }
                    // Exclude courses where the description contains schema-related keywords
                    const invalidKeywords = ['Nodes:', 'Relationships:', '({', '})', '->', '<-'];
                    for (const keyword of invalidKeywords) {
                        if (description.includes(keyword)) {
                            return false;
                        }
                    }
                    // Exclude courses with excessively long descriptions (possible schema text)
                    if (description.length > 1000) {
                        return false;
                    }
                    return true;
                }
            );
            
            if (coursesWithValidDescriptions.length === 0) {
                return `Hmm, I couldn’t find any courses with valid descriptions${
                    department ? ` in the ${department} department` : ''
                }${
                    termOffered ? ` offered in ${termOffered}` : ''
                }${
                    year ? ` in the year ${year}` : ''
                }. I’ll make a note of this and work on improving in the future!`;
            }
            

            // Remove duplicate courses based on description (cross-listed courses)
            const uniqueCourses = coursesWithValidDescriptions.filter(
                (course, index, self) =>
                    index ===
                    self.findIndex(
                        (c) => c.pageContent.trim() === course.pageContent.trim()
                    )
            );

            if (uniqueCourses.length === 0) {
                return `No unique courses found based on descriptions${
                    department ? ` in the ${department} department` : ''
                }${
                    termOffered ? ` offered in ${termOffered}` : ''
                }${
                    year ? ` in the year ${year}` : ''
                }.`;
            }

            // Initialize OpenAI embeddings
            const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY! });

            // Create documents from course data
            const documents = uniqueCourses.map(
                (course) =>
                    new Document({
                        pageContent: `${course.metadata.courseName}: ${course.pageContent}`,
                        metadata: course.metadata,
                    })
            );

            // Initialize the in-memory vector store
            const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);

            // Perform similarity search
            const results = await vectorStore.similaritySearch(interests, 10);

            if (results.length === 0) {
                return `No relevant courses found based on your interests${
                    department ? ` in the ${department} department` : ''
                }${
                    termOffered ? ` offered in ${termOffered}` : ''
                }${
                    year ? ` in the year ${year}` : ''
                }.`;
            }

            // Build response
            let response = "## Suggested Courses Based on Your Interests";
            if (termOffered || year) {
                response += ` ${termOffered || ""} ${year || ""}`;
            }

            response += "\n\n<spaceseparator>\n</spaceseparator>\n\n";

            results.forEach((document, index) => {
                const course = document.metadata;
                const termsOfferedString = course.termsOffered?.length > 0
                    ? course.termsOffered.join(', ')
                    : 'N/A';
                const yearsOfferedString = course.yearsOffered?.length > 0
                    ? course.yearsOffered.join(', ')
                    : 'N/A';
                response += `# ${index + 1}. ${course.courseName} (${course.courseId})\n`;
                response += `<showmore>\n${document.pageContent}\n</showmore>\n\n`;
            });


            return response;
        } catch (error) {
            console.error("Error in suggestCoursesBasedOnInterests:", error);
            return `Error suggesting courses: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`;
        }
    },
};

export { suggestCoursesBasedOnInterests };