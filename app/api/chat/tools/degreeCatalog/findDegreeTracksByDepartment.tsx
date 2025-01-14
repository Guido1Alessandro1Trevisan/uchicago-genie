import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";

const findDegreeTracksByDepartment = {
    description: "This query retrieves the names of the degree tracks for a specific department. If the user asks you to suggest a degree track based on intersts don't use this tool for that. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.",
    parameters: z.object({
        department: z.enum(departments)
    }),

    execute: async ({ department }: { department: string }) => {
        noStore();

        console.log("firing findDegreeTracksByDepartment");

        try {
            const url: any = process.env.NEO4J_URI;
            const username: any = process.env.NEO4J_USERNAME;
            const password: any = process.env.NEO4J_PASSWORD;

            if (!url || !username || !password) {
                throw new Error("Missing required Neo4j credentials");
            }

            const graph = await Neo4jGraph.initialize({
                url,
                username,
                password
            });

            const query = `
                MATCH (d:Department)
                WHERE d.name = $department
                OPTIONAL MATCH (d)-[:OFFERS]->(dt:DegreeTrack)
                RETURN dt as DegreeTrack
            `;

            const data = await graph.query(query, {
                department
            });

            if (data.length === 0) {
                return `Hmm, I couldn’t find any degree tracks in the ${department} department. I’ll make a note of this and work on improving in the future!`;
            }
            

            let response = `## Degree tracks offered by ${department}:
`;
            const degreeTracks = data.map(({ DegreeTrack }) => DegreeTrack.name);

            response += degreeTracks.map((name) => `- ${name}`).join('\n');

            response += "\n\n<separator> \n </separator>\n\n";

            response += "### Want to Explore More?\n\n";

            // Randomly pick two degree tracks for call-to-action
            const randomDegrees = degreeTracks.sort(() => 0.5 - Math.random()).slice(0, 2);

            randomDegrees.forEach((degree) => {
                response += `<calltoaction> "Tell me about **${degree}**" </calltoaction>\n`;
            });

            return response;

        } catch (error) {
            console.error("Error in findDegreeTracksByDepartment:", error);
            throw error;
        }
    }
};

export { findDegreeTracksByDepartment };
