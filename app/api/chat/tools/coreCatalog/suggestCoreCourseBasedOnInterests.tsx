
import { z } from "zod";
import OpenAI from "openai";
import { unstable_noStore as noStore } from 'next/cache';

import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "langchain/document";
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";

const suggestCoreCourseBasedOnInterests = {
    description: `Suggests 20 courses or sequences from the Core Curriculum based on the user's interests by searching through course and sequence descriptions. If interests are not provided, suggests 20 popular or random courses/sequences. If neither the term nor year is mentioned, use ${process.env.CURRENT_QUARTER} for the termOffered and ${process.env.CURRENT_YEAR} for the year as defaults. If termOffered and year are both specified, suggests only courses (no sequences) offered in that term and year that are linked to the degree sections and degree subsections of the Core Curriculum degree track. Does not propose single courses if they are in a sequence (unless term and year are specified); proposes the sequence directly with a description. If the user does not specify the sectionName, it searches through all sections of the Core Curriculum degree track.`,
    parameters: z.object({
        interests: z.string().optional().describe("The user's interests or keywords related to desired courses."),
        termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
        year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string").optional(),
        sectionName: z
            .enum([
                "Humanities",
                "Civilization Studies",
                "Arts",
                "Physical Sciences",
                "Biological Sciences",
                "Mathematical Sciences",
                "Sciences Elective",
                "Social Sciences",
            ])
            .optional(),
    }),
    execute: async ({
        interests,
        termOffered,
        year,
        sectionName
    }: {
        interests?: string;
        termOffered?: "Autumn" | "Winter" | "Spring" | "Summer";
        year?: string;
        sectionName?: string;
    }): Promise<string> => {
        noStore();

        const department = "Core Curriculum";

        console.log("section", sectionName);

        console.log("Executing suggestCoreCourseBasedOnInterests tool");

        try {
            // Initialize the Neo4j graph
            const graph = await Neo4jGraph.initialize({
                url: process.env.NEO4J_URI!,
                username: process.env.NEO4J_USERNAME!,
                password: process.env.NEO4J_PASSWORD!,
            });

            let results: Document[];

            if (termOffered || year) {
                // Handle cases where only one of termOffered or year is provided
                const cypher = `
                    MATCH (dt:DegreeTrack {name: $department})-[:HAS_SECTION]->(ds:DegreeSection)
                    WHERE ($sectionName IS NULL OR ds.name = $sectionName)
                    OPTIONAL MATCH (ds)-[:HAS_SUBSECTION]->(dss:DegreeSubSection)
                    OPTIONAL MATCH (dss)-[:SUBSECTION_COURSE]->(c1:Course)<-[:SECTION_OF]-(cs1:CourseSection)
                    OPTIONAL MATCH (ds)-[:SECTION_COURSE]->(c2:Course)<-[:SECTION_OF]-(cs2:CourseSection)
                    WITH dt, ds, collect(dss) as subsections, collect(c1) + collect(c2) as courses
                    UNWIND courses as c
                    MATCH (c)<-[:SECTION_OF]-(cs:CourseSection)
                    WHERE ($termOffered IS NULL OR cs.termOffered = $termOffered)
                    AND ($year IS NULL OR cs.year = $year)
                    RETURN DISTINCT
                        c.name AS courseName,
                        c.id AS courseId,
                        c.description AS courseDescription
                `;

                const params = {
                    department,
                    termOffered,
                    year,
                    sectionName: sectionName || null,  // Ensure sectionName is null if not provided
                };

                const data = await graph.query(cypher, params);
                
                if (!data || data.length === 0) {
                    return `Hmm, I couldn’t find any courses${
                        sectionName ? ` in the ${sectionName} section of the ${department}` : ` in the ${department}`
                    } for ${termOffered || "any term"} ${year || "any year"}. I’ll make a note of this and work on improving in the future!`;
                }
                

                // Prepare course data
                const courses = data.map((item) => ({
                    type: 'course',
                    pageContent: item.courseDescription || '',
                    metadata: {
                        name: item.courseName,
                        id: item.courseId,
                    },
                }));

                if (interests && interests.trim() !== '') {
                    // Initialize OpenAI embeddings
                    const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY! });

                    // Create documents from course data
                    const documents = courses.map(
                        (item) =>
                            new Document({
                                pageContent: `${item.metadata.name}: ${item.pageContent}`,
                                metadata: item.metadata,
                            })
                    );

                    // Initialize the in-memory vector store
                    const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);

                    // Perform similarity search
                    results = await vectorStore.similaritySearch(interests, 20);

                    if (results.length === 0) {
                        return `No relevant courses found based on your interests${
                            sectionName ? ` in the ${sectionName} section of the ${department}` : ` in the ${department}`
                        } for ${termOffered || "any term"} ${year || "any year"}.`;
                    }
                } else {
                    // No interests provided, return 20 random courses
                    const shuffledCourses = courses.sort(() => 0.5 - Math.random());
                    results = shuffledCourses.slice(0, 20).map(
                        (item) =>
                            new Document({
                                pageContent: `${item.metadata.name}: ${item.pageContent}`,
                                metadata: item.metadata,
                            })
                    );
                }

                // Build response
                let response = `## Courses from the ${department}${
                    sectionName ? ` - ${sectionName} section` : ''
                } offered in ${termOffered || "any term"} ${year || "any year"}\n`;
                response += "\n\n<spaceseparator> \n </spaceseparator>\n\n";

                results.forEach((document, index) => {
                    const item = document.metadata;
                    response += `### ${index + 1}. ${item.name} (${item.id || 'No ID'})\n`;
                    response += `<showmore>\n${document.pageContent}\n</showmore>\n\n`;
                });

                return response;
        
            } else {
                // Fetch courses and sequences from the Core Curriculum
                const cypher = `
                    MATCH (dt:DegreeTrack {name: $department})-[:HAS_SECTION]->(ds:DegreeSection)
                    WHERE ($sectionName IS NULL OR ds.name = $sectionName)
                    OPTIONAL MATCH (ds)-[:HAS_SUBSECTION]->(dss:DegreeSubSection)
                    OPTIONAL MATCH (dss)-[:SUBSECTION_COURSE]->(c1:Course)
                    OPTIONAL MATCH (ds)-[:REQUIRES]->(c2:Course)
                    OPTIONAL MATCH (ds)-[:SECTION_SEQUENCE]->(seq:Sequence)
                    OPTIONAL MATCH (dss)-[:SUBSECTION_SEQUENCE]->(seq:Sequence)
                    OPTIONAL MATCH (ds)-[:SECTION_COURSE]->(c3:Course)
                    WITH dt, ds, dss, c1, c2, c3, seq
                    WITH collect(DISTINCT c1) + collect(DISTINCT c2) + collect(DISTINCT c3) as courses, seq
                    OPTIONAL MATCH (seq)-[:SEQUENCE_OF]->(seqCourse:Course)
                    RETURN
                        courses,
                        seq.name AS sequenceName,
                        seq.id AS sequenceId,
                        seq.description AS sequenceDescription,
                        collect(DISTINCT seqCourse.name) AS sequenceCourses
                `;
                const params = {
                    department,
                    sectionName: sectionName || null,  // Ensure sectionName is null if not provided
                };

                const data = await graph.query(cypher, params);

                if (!data || data.length === 0) {
                    return `No courses or sequences found${
                        sectionName ? ` in the ${sectionName} section` : ''
                    } of the ${department}.`;
                }

                // Prepare course and sequence data
                const allItems: any = [];

                // Process courses
                if (data[0].courses && data[0].courses.length > 0) {
                    data[0].courses.forEach((course: any) => {
                        if (course.name) {
                            allItems.push({
                                type: 'course',
                                pageContent: course.description || '',
                                metadata: {
                                    name: course.name,
                                    id: course.id,
                                },
                            });
                        }
                    });
                }

                // Process sequences
                data.forEach((item) => {
                    if (item.sequenceName) {
                        allItems.push({
                            type: 'sequence',
                            pageContent: item.sequenceDescription || '',
                            metadata: {
                                name: item.sequenceName,
                                id: item.sequenceId,
                                courses: item.sequenceCourses.filter(Boolean),
                            },
                        });
                    }
                });

                // Remove courses that are part of sequences
                const coursesInSequences = new Set(
                    data.flatMap((item) => item.sequenceCourses || [])
                );
                const uniqueItems = allItems.filter((item: any) => {
                    if (item.type === 'course') {
                        return !coursesInSequences.has(item.metadata.name);
                    }
                    return true;
                });

                if (uniqueItems.length === 0) {
                    return `No unique courses or sequences found${
                        sectionName ? ` in the ${sectionName} section` : ''
                    } of the ${department}.`;
                }

                if (interests && interests.trim() !== '') {
                    // Initialize OpenAI embeddings
                    const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY! });

                    // Create documents from item data
                    const documents = uniqueItems.map(
                        (item: any) =>
                            new Document({
                                pageContent: `${item.metadata.name}: ${item.pageContent}`,
                                metadata: item.metadata,
                            })
                    );

                    // Initialize the in-memory vector store
                    const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);

                    // Perform similarity search
                    results = await vectorStore.similaritySearch(interests, 20);

                    if (results.length === 0) {
                        return `No relevant courses or sequences found based on your interests${
                            sectionName ? ` in the ${sectionName} section` : ''
                        } of the ${department}.`;
                    }
                } else {
                    // If no interests provided, return 20 random items
                    const shuffledItems = uniqueItems.sort(() => 0.5 - Math.random());
                    results = shuffledItems.slice(0, 20).map(
                        (item: any) =>
                            new Document({
                                pageContent: `${item.metadata.name}: ${item.pageContent}`,
                                metadata: item.metadata,
                            })
                    );
                }

                // Build response
                let response = `## Suggested Courses and Sequences${
                    sectionName ? ` from the ${sectionName} section` : ''
                } of the ${department}\n`;
                response += "\n\n<spaceseparator> \n </spaceseparator>\n\n";

                results.forEach((document, index) => {
                    const item = document.metadata;
                    response += `### ${index + 1}. ${item.name} (${item.id || 'No ID'})\n`;
                    response += `<showmore>\n${document.pageContent}\n</showmore>\n\n`;
                    if (item.type === 'sequence') {
                        response += `**Courses in this sequence:** ${item.courses.join(', ')}\n\n`;
                    }
                });

                return response;
            }
        } catch (error) {
            console.error("Error in suggestCoreCourseBasedOnInterests:", error);
            return `Error suggesting courses: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`;
        }
    },
};

export { suggestCoreCourseBasedOnInterests };