import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departmentGuardPrompt } from "../../toolPrompt";

import { departments } from "../../constants/departments";
import { findCourse, findInstructor } from "../lib";


import OpenAI from "openai";


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type QuoteWithContext = {
    quote: string;
    courseName: string;
    instructor: string;
    term: string;
    year: string;
    similarity?: number; // Optional: Include similarity score
};

const courseSemanticSearch = {
    description: `This tool retrieves answers to any questions about the user which are referring to a course and do not specify an instructor and ask about something specific which is not overall feedback or more student quotes. ${departmentGuardPrompt}. Make sure you don't make courseIds up unless theya re provided by the user `,

    parameters: z.object({
        department: z.enum(departments).describe(""),
        userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
        userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
        instructor: z.string().describe("This is the name of the instructor, with any typos made by the user corrected."),
        userQuery: z.string().describe("Keywords with the interst of the user"),

    }),
    execute: async ({ department, userCourseId, userCourseName, instructor, userQuery }: { 
        department: string, 
        userCourseId: string,
        userCourseName: string,
        instructor: any,
        userQuery: any
    }): Promise<string> => {
        noStore();

        console.log("firing courseSemanticSearch")


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
  

        try {
            const graph = await Neo4jGraph.initialize({
                url: process.env.NEO4J_URI!,
                username: process.env.NEO4J_USERNAME!,
                password: process.env.NEO4J_PASSWORD!,
            });

            // Build the WHERE clause based on the available identifiers
            let whereClause = "cs.feedback IS NOT NULL";
            const params: any = { department };

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
                    return `Hmm, I couldn’t find any feedback for course ID ${courseId} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else if (courseName) {
                    return `Hmm, I couldn’t find any feedback for the course "${courseName}" in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else {
                    return `Hmm, I couldn’t find any feedback for the specified course in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                }
            }
            

            const allQuotes: QuoteWithContext[] = [];
            const uniqueInstructors = new Set<string>();

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

                // Collect unique instructor names for the "Tell Me More" section
                uniqueInstructors.add(section.instructor);

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
                        quotes.slice(0, 25).forEach((quote: string) => {
                            allQuotes.push({
                                quote,
                                courseName: section.courseName,
                                instructor: section.instructor,
                                term: section.term,
                                year: section.year,
                            });
                        });
                    }
                });
            });

            if (allQuotes.length === 0) {
                if (courseId) {
                    return `Hmm, I couldn’t find any student quotes for course ID ${courseId} in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else if (courseName) {
                    return `Hmm, I couldn’t find any student quotes for the course "${courseName}" in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                } else {
                    return `Hmm, I couldn’t find any student quotes for the specified course in the ${department} department. I’ll make a note of this and work on improving in the future!`;
                }
            }
            
            // Fetch all quotes (no longer limiting to first 20)
            // Prepare quotes for embedding
            const quotesText = allQuotes.map((q: any) => q.quote);

            // Get embeddings for both quotes and query
            const [quotesEmbeddings, queryEmbedding] = await Promise.all([
                openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: quotesText
                }),
                openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: userQuery
                })
            ]);

            // Function to calculate cosine similarity
            const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
                const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
                const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
                const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
                return dotProduct / (magnitudeA * magnitudeB);
            };

            // Calculate similarity scores for each quote
            const queryVector = queryEmbedding.data[0].embedding;
            const quotesWithScores = allQuotes.map((quote, index) => ({
                ...quote,
                similarity: cosineSimilarity(
                    quotesEmbeddings.data[index].embedding,
                    queryVector
                )
            }));

            // Sort quotes by similarity in descending order
            const sortedQuotes = quotesWithScores.sort((a, b) => b.similarity - a.similarity);

            // Build response with sorted quotes
            let response = `## Student Quotes for`

            if (courseId) {
                response +=` ${courseId}\n\n`;
            } else {
                response +=` ${courseName}\n\n`;
            }

            response += `**Top student quotes sorted by relevance to your query: "${userQuery}"**\n\n`;

            response += "<longshowmore>\n\n";

            sortedQuotes.forEach(({ quote, instructor, term, year, similarity }, index) => {
                response += `${index + 1}. "${quote}"`;
                response += `   - **Instructor: ${instructor}, ${term} ${year}**\n\n`;
            });

            response += `\n</longshowmore>\n\n`;

            // "Tell Me More" Section with Multiple Instructors
            // Convert the set of unique instructors to an array
            const instructorsArray = Array.from(uniqueInstructors);
            // Shuffle the array to ensure randomness
            for (let i = instructorsArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [instructorsArray[i], instructorsArray[j]] = [instructorsArray[j], instructorsArray[i]];
            }
            // Select up to three random instructors
            const numberOfInstructorsToSuggest = Math.min(3, instructorsArray.length);
            const selectedInstructors = instructorsArray.slice(0, numberOfInstructorsToSuggest);

            response += "\n\n<separator> \n </separator>\n\n";

            // Add the "Tell Me More" section to the response
            response += "### Want to Learn More?\n\n";
            selectedInstructors.forEach((instructor) => {
                if (courseId) {
                    response += `<calltoaction> "Can you tell me more about **${courseId}** taught by ${instructor}? " </calltoaction>\n`;
                } else {
                    response += `<calltoaction> "Can you tell me more about **${courseName}** taught by ${instructor}? " </calltoaction>\n`;
                }
                
            });

            return response;

        } catch (error) {
            console.error("Error in courseSemanticSearch:", error);
            return `Error performing semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    },
};

export { courseSemanticSearch };