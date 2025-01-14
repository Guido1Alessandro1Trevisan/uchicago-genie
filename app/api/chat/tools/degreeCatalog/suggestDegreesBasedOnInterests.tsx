
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import OpenAI from "openai";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type DegreeWithContext = {
    degreeName: string;
    degreeType: string;
    description: string;
    totalUnits: number;
    department: string;
    similarity?: number; 
};

const suggestDegreesBasedOnInterests = {
    description: `This tool suggests degrees based on the user's interests by searching through degree descriptions. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
    parameters: z.object({
        department: z.enum(departments).optional(),
        interests: z.string().describe("The user's interests or keywords related to desired degrees"),
    }),
    execute: async ({ department, interests }: { 
        department?: string;
        interests: string;
    }): Promise<string> => {
        noStore();

        console.log("firing suggestDegreesBasedOnInterests")
    
        try {
            const graph = await Neo4jGraph.initialize({
                url: process.env.NEO4J_URI!,
                username: process.env.NEO4J_USERNAME!,
                password: process.env.NEO4J_PASSWORD!
            });

            let cypher: string;
            let params: any;

            if (department) {
                cypher = `
                    MATCH (d:Department {name: $department})-[:OFFERS]->(dt:DegreeTrack)
                    RETURN dt.name as degreeName,
                           dt.type as degreeType,
                           dt.description as description,
                           dt.totalUnits as totalUnits,
                           d.name as department
                `;
                params = { department };
            } else {
                cypher = `
                    MATCH (d:Department)-[:OFFERS]->(dt:DegreeTrack)
                    RETURN dt.name as degreeName,
                           dt.type as degreeType,
                           dt.description as description,
                           dt.totalUnits as totalUnits,
                           d.name as department
                `;
                params = {};
            }

            const data = await graph.query(cypher, params);

            if (!data || data.length === 0) {
                return `Hmm, I couldn’t find any degrees${department ? ` in the ${department} department` : ''}. I’ll make a note of this and work on improving in the future!`;
            }
            

            // Prepare degree data
            const allDegrees: DegreeWithContext[] = data.map(degree => ({
                degreeName: degree.degreeName,
                degreeType: degree.degreeType,
                description: degree.description || '',
                totalUnits: degree.totalUnits,
                department: degree.department || department || 'Unknown Department'
            }));

            // Filter out degrees without descriptions
            const degreesWithDescriptions = allDegrees.filter(
                degree => degree.description.trim() !== ''
            );

            if (degreesWithDescriptions.length === 0) {
                return `Hmm, I couldn’t find any degrees with descriptions${department ? ` in the ${department} department` : ''}. I’ll make a note of this and work on improving in the future!`;
            }            

            // Prepare embeddings for descriptions
            const descriptions = degreesWithDescriptions.map(degree => 
                `${degree.degreeName}: ${degree.description}`
            );

            // Get embeddings for interests and degree descriptions
            const [descriptionEmbeddings, interestsEmbedding] = await Promise.all([
                openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: descriptions
                }),
                openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: [interests]
                })
            ]);

            // Function to calculate cosine similarity
            const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
                const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
                const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
                const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
                return dotProduct / (magnitudeA * magnitudeB);
            };

            // Calculate similarity scores
            const interestVector = interestsEmbedding.data[0].embedding;
            const degreesWithScores = degreesWithDescriptions.map((degree, index) => ({
                ...degree,
                similarity: cosineSimilarity(
                    descriptionEmbeddings.data[index].embedding,
                    interestVector
                )
            }));

            // Sort by similarity in descending order
            const sortedDegrees = degreesWithScores
                .sort((a, b) => b.similarity! - a.similarity!);

            // Build response with top degrees
            let response = `## Suggested Degrees Based on Your Interests\n\n`;
            response += `**Top degrees matching your interests: "${interests}"**\n\n`;

            response += "<longshowmore>\n\n";

            sortedDegrees.slice(0, 10).forEach((degree, index) => {
                response += `# ${index + 1}. ${degree.degreeName} (${degree.degreeType})\n`;
                response += `**Department**: ${degree.department}\n`;
                response += `**Total Units Required**: ${degree.totalUnits}\n\n`;
                response += `${degree.description}\n\n`;
            });

            response += `\n</longshowmore>\n\n`;

            // "Want to Learn More" Section
            response += "\n\n<separator> \n </separator>\n\n";

            response += "### Want to Learn More?\n\n";

            // Collect unique departments from the degrees
            const uniqueDepartments = new Set(degreesWithDescriptions.map(degree => degree.department));

            // Select up to three random degrees from the sorted list beyond the top 10
            const additionalDegrees = sortedDegrees.slice(10);
            if (additionalDegrees.length > 0) {
                const numberOfDegreesToSuggest = Math.min(3, additionalDegrees.length);
                // Shuffle the additional degrees
                for (let i = additionalDegrees.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [additionalDegrees[i], additionalDegrees[j]] = [additionalDegrees[j], additionalDegrees[i]];
                }
                const selectedDegrees = additionalDegrees.slice(0, numberOfDegreesToSuggest);

                selectedDegrees.forEach(degree => {
                    response += `<calltoaction> "Can you tell me more about the **${degree.degreeName} (${degree.degreeType})** degree?" </calltoaction>\n`;
                });
            } else {
                // If no additional degrees, suggest exploring different departments
                const departmentsArray = Array.from(uniqueDepartments);
                const numberOfDepartmentsToSuggest = Math.min(3, departmentsArray.length);
                // Shuffle the departments
                for (let i = departmentsArray.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [departmentsArray[i], departmentsArray[j]] = [departmentsArray[j], departmentsArray[i]];
                }
                const selectedDepartments = departmentsArray.slice(0, 1);

                selectedDepartments.forEach(dept => {
                    response += `<calltoaction> "Can you tell me more about degrees in the **${dept}** department?" </calltoaction>\n`;
                });
            }

            return response;

        } catch (error) {
            console.error("Error in suggestDegreesBasedOnInterests:", error);
            return `Error suggesting degrees: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
};

export { suggestDegreesBasedOnInterests };