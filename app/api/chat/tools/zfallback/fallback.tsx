import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import OpenAI from "openai";

const oldSystemPrompt = `
Use the following pieces of context to answer the question at the end do not use any mark up like asterisks to make the text bold. Start a new line when necessary.

If you don't know the answer, just say that you don't know, don't try to make up an answer. Do not provide any information that does not directly answer the question at hand. If the question is not about the course catalog or a class at the University of Chicago, please respond: 'I can only assist with questions related to courses at the University of Chicago.' Be as concise and clear as possible, while ensuring you include all essential information.

If someone asks about major/graduation/course requirements, explicitly name all paths of courses (and explicitly say all courses in each path) that the student could take to fulfill their major/graduation/course requirements. Do not refer to any courses without naming their specific course numbers. When discussing major requirements, do not skip classes which are in the major requirement but aren't the same category as the subject of the major.

Do not confuse the BA/BS with honors requirements with the standard BA/BS. If a requirements says "one of the following:", it means the student **is NOT required** to take any specific one of the listed classes, UNLESS they are the honors or standard version of the same class. If a yes or no question is asked, search for evidence in the affirmative and then search for evidence in the negative. Determine which evidence is stronger and choose yes or no accordingly. Provide an explanation for your answer.

If someone mentions the non-honors version of a class, assume they are talking about the honors and non-honors version of that class as a single entity. **If they must take either the honors or regular version of that class, they must take that class.**

Do not cite the pdf in any shape or form. Do not include in any way stuff like【5:0†2023-2024_The_College_3_.pdf. This is`;

const fallbackToOldModel = {
    description: "This tool falls back to the previous model if none of the tools are available to answer the current user queries.",
    parameters: z.object({
        userQuery: z.string().describe("The entire user query")
    }),

    execute: async ({ userQuery }: { userQuery: string }) => {
        noStore();

        console.log("Executing fallbackToOldModel");

        try {
            // Initialize the OpenAI client
            const openai = new OpenAI();

            // Fetch a list of available assistants to ensure the assistant ID is valid
            const assistants = await openai.beta.assistants.list({
                order: "desc",
                limit: 20
            });

            const assistantId = assistants.data.find(asst => asst.id === process.env.ASSISTANT_ID)?.id;

            if (!assistantId) {
                throw new Error("Assistant ID not found.");
            }

            // Create a new thread for the query
            const thread = await openai.beta.threads.create();

            await openai.beta.threads.messages.create(thread.id, {
                role: "assistant",
                content: oldSystemPrompt
            });

            // Add the user query as the initial message in the thread
            await openai.beta.threads.messages.create(thread.id, {
                role: "user",
                content: userQuery
            });

            // Execute the assistant's run on the thread
            const run = await openai.beta.threads.runs.create(thread.id, {
                assistant_id: assistantId
            });

            // Poll for the run status until completed
            let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            while (runStatus.status !== "completed") {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            }

            // Retrieve the messages from the thread
            const messages = await openai.beta.threads.messages.list(thread.id);

            // Find the last assistant message for this run
            const lastMessageForRun: any = messages.data
                .filter(
                    (message) => message.run_id === run.id && message.role === "assistant"
                )
                .pop();

                let response =  `<fallback> Our newest model can’t answer this just yet, so we reverted to the previous one, which may hallucinate </fallback>\n`;

            const assistantContent = lastMessageForRun?.content[0]?.text?.value || "I couldn't retrieve a response.";

            const cleanedContent = assistantContent.replace(/【[^】]*】/g, '');

            response += cleanedContent;

            return response;

        } catch (error) {
            console.error("Error in fallbackToOldModel:", error);
            return "Error";
        }
    }
};

export { fallbackToOldModel };