
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import OpenAI from "openai";

import { findInstructor } from "../lib";
import { departmentGuardPrompt } from "../../toolPrompt";

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type QuoteWithContext = {
    quote: string;
    courseName: string;
    term: string;
    year: string;
    instructor?: string;
    similarity?: number; 
};

const instructorSemanticSearch = {
    description: `This tool retrieves answers to any questions about the user which are referring to an instructor and do not specify a class and ask about something specific which is not overall feedback or more student quotes. If the user doesn't mention a department, ask them to specify what they teach to make it easier to find the instructor. This tool should be mainly focused on negative feedback. Users can also prompt stuff like "is the professor good at teaching" and in the user query you should add words to get negative feedback especially ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
    parameters: z.object({
        department: z.enum(departments).describe("The department to retrieve instructors from"),
        instructor: z.string().describe("This is the name of the instructor, with any typos made by the user corrected."),
        userQuery: z.string().describe("List of keywords and user interests")
    }),
    
    execute: async ({ department, instructor, userQuery }: { department: string; instructor: string, userQuery: string }): Promise<string> => {
        noStore();

        console.log("firing instructorSemanticSearch");

        // Fetch instructor information based on the user query
        const courseId = null;
        const courseName = null;

        if (instructor && instructor.trim() !== '') {
            const instructorResult = await findInstructor(department, instructor);
            if (instructorResult) {
                instructor = instructorResult;
            } else {
                return `Hmm, no instructor found matching the provided name in the ${department} department. I’ll make a note of this and work on improving in the future!`;
            }
        }

        console.log("findInstructorQuotes", instructor, courseId, courseName);

        // If no instructor is found, return an appropriate message
        if (!instructor) {
            return "Hmm, I couldn't find any instructor based on the provided query. I'll make sure to look into this and learn more for the future.";
        }

        try {
            const graph = await Neo4jGraph.initialize({
                url: process.env.NEO4J_URI!,
                username: process.env.NEO4J_USERNAME!,
                password: process.env.NEO4J_PASSWORD!,
            });

            // Build the WHERE clause based on the available identifiers
            let whereClause = "cs.instructor = $instructor AND cs.feedback IS NOT NULL";
            const params: any = { department, instructor };

            if (courseId) {
                whereClause += " AND c.id = $courseId";
                params.courseId = courseId;
            } else if (courseName) {
                whereClause += " AND c.name = $courseName";
                params.courseName = courseName;
            }

            const cypherQuery = `
                MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
                MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
                WHERE ${whereClause}
                RETURN 
                    cs.sectionId AS sectionId,
                    c.name AS courseName,
                    c.id AS courseId,
                    cs.instructor AS instructor,
                    cs.termOffered AS term,
                    cs.year AS year,
                    cs.feedback AS feedback
            `;

            const data = await graph.query(cypherQuery, params);
            if (!data || data.length === 0) {
                if (courseId) {
                    return `Hmm, I couldn’t find any feedback for instructor ${instructor} in course ID ${courseId} within the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else if (courseName) {
                    return `Hmm, I couldn’t find any feedback for instructor ${instructor} in course "${courseName}" within the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else {
                    return `Hmm, I couldn’t find any feedback for instructor ${instructor} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                }
            }

            const allQuotes: QuoteWithContext[] = [];
            const uniqueCourses = new Set<string>();

            // Extract quotes from feedback data
            data.forEach((section) => {
                if (!section.feedback) return;

                // Parse the feedback JSON data
                let feedback;
                try {
                    feedback = JSON.parse(section.feedback);
                } catch (e) {
                    console.error("Error parsing feedback JSON:", e);
                    return;
                }

                // Collect unique course names for the "Tell Me More" section
                uniqueCourses.add(section.courseName);

                // Define all relevant categories to extract quotes from
                const categories = {
                    'overallMetrics': feedback.overallMetrics?.studentQuotes,
                    'overallCourseImpression': feedback.overallCourseImpression?.studentQuotes,
                    'learningGains': feedback.learningGains?.studentQuotes,
                    'teachingEffectiveness': feedback.teachingEffectiveness?.studentQuotes,
                    'courseDifficulty': feedback.courseDifficulty?.studentQuotes,
                    'courseStructure': feedback.courseStructure?.studentQuotes,
                    'studentEngagement': feedback.studentEngagement?.studentQuotes,
                    'suggestedImprovements': feedback.suggestedImprovements?.studentQuotes
                };

                Object.entries(categories).forEach(([category, quotes]) => {
                    if (quotes && Array.isArray(quotes)) {
                        quotes.forEach((quote: string) => {
                            allQuotes.push({
                                quote,
                                courseName: section.courseName,
                                term: section.term,
                                year: section.year,
                                instructor: section.instructor,
                            });
                        });
                    }
                });
            });

            if (allQuotes.length === 0) {
                if (courseId) {
                    return `Hmm, I couldn’t find any student quotes for instructor ${instructor} in course ID ${courseId} within the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else if (courseName) {
                    return `Hmm, I couldn’t find any student quotes for instructor ${instructor} in course "${courseName}" within the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else {
                    return `Hmm, I couldn’t find any student quotes for instructor ${instructor} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                }
            }

            // Prepare quotes for embedding
            const quotesText = allQuotes.slice(0, 25).map((q: any) => q.quote);

            // Get embeddings for both quotes and query
            let quotesEmbeddings, queryEmbedding;
            try {
                [quotesEmbeddings, queryEmbedding] = await Promise.all([
                    openai.embeddings.create({
                        model: "text-embedding-ada-002",
                        input: quotesText
                    }),
                    openai.embeddings.create({
                        model: "text-embedding-ada-002",
                        input: userQuery
                    })
                ]);
            } catch (error) {
                console.error("Error fetching embeddings:", error);
                return `Error retrieving embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }

            // Validate embeddings response
            if (
                !quotesEmbeddings ||
                !quotesEmbeddings.data ||
                !Array.isArray(quotesEmbeddings.data) ||
                quotesEmbeddings.data.length !== quotesText.length
            ) {
                return "Error: Unexpected response from OpenAI embeddings API for quotes.";
            }

            if (
                !queryEmbedding ||
                !queryEmbedding.data ||
                !Array.isArray(queryEmbedding.data) ||
                queryEmbedding.data.length === 0
            ) {
                return "Error: Unexpected response from OpenAI embeddings API for the user query.";
            }

            // Function to calculate cosine similarity
            const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
                const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
                const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
                const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
                return dotProduct / (magnitudeA * magnitudeB);
            };

            // Extract query vector
            const queryVector = queryEmbedding.data[0].embedding;

            // Calculate similarity scores for each quote
            const quotesWithScores = allQuotes.slice(0, 25).map((quote, index) => ({
                ...quote,
                similarity: cosineSimilarity(
                    quotesEmbeddings.data[index].embedding,
                    queryVector
                )
            }));

            // Sort quotes by similarity in descending order
            const sortedQuotes = quotesWithScores.sort((a, b) => b.similarity! - a.similarity!);

            // Build response with sorted quotes
            let response = `## Student Quotes for ${instructor}\n\n`;
            response += `**Top student quotes sorted by relevance to your query: "${userQuery}"**\n\n`;

            response += "<longshowmore>\n\n";

            sortedQuotes.forEach(({ quote, courseName, term, year }) => {
                response += `- "${quote}"\n`;
                response += `**${courseName}, ${term} ${year}**\n\n`;
            });

            response += `\n</longshowmore>\n\n`;

            // "Tell Me More" Section with Multiple Courses
            // Convert the set of unique courses to an array
            const coursesArray = Array.from(uniqueCourses);
            // Shuffle the array to ensure randomness
            for (let i = coursesArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [coursesArray[i], coursesArray[j]] = [coursesArray[j], coursesArray[i]];
            }
            // Select up to three random courses
            const numberOfCoursesToSuggest = Math.min(3, coursesArray.length);
            const selectedCourses = coursesArray.slice(0, numberOfCoursesToSuggest);

            response += "\n\n<separator> \n </separator>\n\n";

            // Add the "Want to Learn More?" section to the response
            response += "### Want to Learn More?\n\n";
            selectedCourses.forEach((course) => {
                response += `<calltoaction> "Can you tell me more about ${instructor}'s teaching in **${course}**? " </calltoaction>\n`;
            });

            return response;

        } catch (error) {
            console.error("Error in instructorSemanticSearch:", error);
            return `Error retrieving instructor quotes: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    },
};

export { instructorSemanticSearch };