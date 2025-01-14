import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';

import { departments } from "../../constants/departments";


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

const courseFeedbackSematicSuggest = {
    description: `This tool suggests courses to the user based on their query, which is not related to the content itself of the course. For example, students might ask to find courses with little homework or a lot of homework, easy courses or challenging ones, or courses taught by professors known for being approachable or demanding. They could inquire about courses that offer a lot of structure versus those with minimal structure, or about courses where homework closely aligns with the exams. Essentially, they might seek courses based on any factor unrelated to the content of the course itself.  `,

    parameters: z.object({
        department: z.enum(departments).describe(""),
        userQuery: z.string().describe("Keywords with the interst of the user"),

    }),
    execute: async ({ department, userQuery }: { 
        department: string, 
        userQuery: any
    }): Promise<string> => {
        noStore();

        console.log("firing courseFeedbackSematicSuggest")


        try {
            const graph = await Neo4jGraph.initialize({
                url: process.env.NEO4J_URI!,
                username: process.env.NEO4J_USERNAME!,
                password: process.env.NEO4J_PASSWORD!,
            });

            // Fetch all courses with feedback in the specified department
            const cypherQuery = `
                MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
                MATCH (cs:CourseSection)-[:SECTION_OF]->(c)
                WHERE cs.feedback IS NOT NULL
                RETURN 
                    cs.sectionId AS sectionId,
                    c.name AS courseName,
                    c.id AS courseId,
                    cs.instructor AS instructor,
                    cs.termOffered AS term,
                    cs.year AS year,
                    cs.feedback AS feedback
            `;

            const params = { department };
            const data = await graph.query(cypherQuery, params);

            if (!data || data.length === 0) {
                return `No courses with feedback found in the ${department} department.`;
            }

            const allQuotes: QuoteWithContext[] = [];
            const courseSet = new Map<string, string>(); // Map to hold course ID and names

            // Define the six feedback topics
            const feedbackTopics = [
                'overallCourseImpression',
                'learningGains',
                'teachingEffectiveness',
                'courseDifficulty',
                'courseStructure',
                'studentEngagement'
            ];

            // Check if the user's query pertains to one of the six topics
            const lowerCaseQuery = userQuery.toLowerCase();
            const isTopicQuery = feedbackTopics.some(topic => lowerCaseQuery.includes(topic.replace(/([A-Z])/g, ' $1').toLowerCase()));

            if (!isTopicQuery) {
                return `I’m sorry, I can’t answer that question yet. Try asking something like, “What’s the overall feedback for BIOS 2027?” or focus on one of these feedback topics. For example, you could ask, “How effective is the teaching in BIOS 2027?” or “What are students saying about the course difficulty in BIOS 2027?” The feedback topics I can help with are: Overall Course Impression, Learning Gains, Teaching Effectiveness, Course Difficulty, Course Structure, or Student Engagement.`;
            }

            // Extract quotes from feedback data
            for (const section of data) {
                if (!section.feedback) continue;

                // Parse the feedback JSON data
                let feedback;
                try {
                    feedback = JSON.parse(section.feedback);
                } catch (e) {
                    console.error("Error parsing feedback JSON:", e);
                    continue;
                }

                // Collect course names
                courseSet.set(section.courseId, section.courseName);

                // Define categories with student quotes
                const categories = {
                    'overallCourseImpression': feedback.overallCourseImpression?.studentQuotes,
                    'learningGains': feedback.learningGains?.studentQuotes,
                    'teachingEffectiveness': feedback.teachingEffectiveness?.studentQuotes,
                    'courseDifficulty': feedback.courseDifficulty?.studentQuotes,
                    'courseStructure': feedback.courseStructure?.studentQuotes,
                    'studentEngagement': feedback.studentEngagement?.studentQuotes
                };

                // Extract quotes from the categories
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
            }

            if (allQuotes.length === 0) {
                return `No student quotes available in the ${department} department related to the specified topics.`;
            }

            // Prepare quotes for embedding
            const quotesText = allQuotes.map((q) => q.quote);

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

            // Group quotes by course and aggregate similarity scores
            const courseScores = new Map<string, { courseName: string; totalSimilarity: number; quotes: QuoteWithContext[] }>();

            quotesWithScores.forEach(quote => {
                const courseId = quote.courseName;
                if (!courseScores.has(courseId)) {
                    courseScores.set(courseId, {
                        courseName: quote.courseName,
                        totalSimilarity: 0,
                        quotes: []
                    });
                }
                const courseData = courseScores.get(courseId)!;
                courseData.totalSimilarity += quote.similarity || 0;
                courseData.quotes.push(quote);
            });

            // Sort courses by total similarity score
            const sortedCourses = Array.from(courseScores.values()).sort((a, b) => b.totalSimilarity - a.totalSimilarity);

            if (sortedCourses.length === 0) {
                return `No courses found matching your query in the ${department} department.`;
            }

            // Build response with sorted courses and top quotes
            let response = `## Course Recommendations Based on Your Query: "${userQuery}"\n\n`;
            response += `**Top courses in the ${department} department related to your interests:**\n\n`;

            response += "<longshowmore>\n\n";

            // Limit the number of courses to suggest (e.g., top 5)
            const topCourses = sortedCourses.slice(0, 5);

            topCourses.forEach((courseData, index) => {
                response += `### ${index + 1}. ${courseData.courseName}\n`;
                // Sort quotes by similarity for this course
                const topQuotes = courseData.quotes.sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, 3);
                topQuotes.forEach((quote) => {
                    response += `- "${quote.quote}"\n`;
                    response += `   - **Instructor: ${quote.instructor}, ${quote.term} ${quote.year}**\n\n`;
                });
            });

            response += `\n</longshowmore>\n\n`;

            // Add a separator
            response += "\n\n<separator> \n </separator>\n\n";

            // Add call-to-actions to trigger other tools
            response += "### Want to Explore More?\n\n";

            // Include course and instructor in the call-to-actions if present
            const courseMention = topCourses[0]?.courseName || "this course";
            const instructorMention = topCourses[0]?.quotes[0]?.instructor ? ` taught by ${topCourses[0].quotes[0].instructor}` : '';

            response += `<calltoaction> "Can I see the **Teaching Effectiveness** of **${courseMention}**${instructorMention}?" </calltoaction>\n`;
            response += `<calltoaction> "What are the **Suggested Improvements** for **${courseMention}**${instructorMention}?" </calltoaction>\n`;
            response += `<calltoaction> "Tell me about **Student Engagement** in **${courseMention}**${instructorMention}." </calltoaction>\n`;
            response += `<calltoaction> "What are the **Learning Gains** from **${courseMention}**${instructorMention}?" </calltoaction>\n`;
            response += `<calltoaction> "How is the **Course Structure** of **${courseMention}**${instructorMention} organized?" </calltoaction>\n`;
            response += `<calltoaction> "Can you describe the **Course Difficulty** of **${courseMention}**${instructorMention}?" </calltoaction>\n`;

            return response;

        } catch (error) {
            console.error("Error in courseSemanticSuggest:", error);
            return `Error performing semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    },
};

export { courseFeedbackSematicSuggest };