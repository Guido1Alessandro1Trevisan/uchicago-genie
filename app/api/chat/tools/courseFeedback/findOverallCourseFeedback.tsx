
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import { departments } from "../../constants/departments";
import OpenAI from "openai";

import { departmentGuardPrompt } from "../../toolPrompt";
import { findCourse, findInstructor } from "../lib";

const openai = new OpenAI();

type Metric = {
    mean: number;
    median: number;
    stronglyAgree: number;
};

type MetricTotals = {
    [key: string]: Metric;
};

type MetricAverages = {
    [key: string]: {
        mean: string;
        median: string;
        stronglyAgree: string;
    };
};

const findOverallCourseFeedback = {
    description: `Extracts overall course impressions and metrics from student feedback across all course sections of a course and can filter based on the professor. If the user doesn't specify a department, ask them to clarify. ${departmentGuardPrompt}. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers. Use this tool when students ask about ratings/reviews of a course as well.`,
    parameters: z.object({
        department: z.enum(departments).describe(""),
        userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
        userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
        instructor: z.string().describe("This is the name of the instructor, with any typos made by the user corrected.").optional()
    }),
    execute: async ({
        department,
        userCourseId,
        userCourseName,
        instructor
    }: {
        department: string,
        userCourseId: string,
        userCourseName: string,
        instructor: any,
    }): Promise<string> => {

        console.log("\n=== Starting findOverallCourseFeedback execution ===");
        console.log("Input parameters:", { department, userCourseId, userCourseName, instructor });

        noStore();

        try {
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

            const query = `
                MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
                WHERE 
                    c.id = $courseId
                WITH c
                OPTIONAL MATCH (cs:CourseSection)
                WHERE 
                    cs.sectionId STARTS WITH c.id
                    AND CASE
                        WHEN $instructor IS NOT NULL THEN cs.instructor = $instructor
                        ELSE true
                    END
                WITH 
                    c.name as CourseName,
                    c.id as CourseID,
                    c.description as CourseDescription,
                    collect({
                        sectionId: cs.sectionId,
                        termOffered: cs.termOffered,
                        year: cs.year,
                        instructor: cs.instructor,
                        feedback: cs.feedback
                    }) as SectionInfo
                RETURN
                    CourseName,
                    CourseID,
                    CourseDescription,
                    SectionInfo
            `;

            const params = {
                department,
                courseId: courseId || null,
                instructor: instructor || null
            };

            const data = await graph.query(query, params);

            if (!data || data.length === 0) {
                return `No information found for ${courseId || courseName}${
                    instructor ? ` with instructor ${instructor}` : ''
                } in the ${department} department.`;
            }

            const course = data[0];
            let response = `## Course: ${course.CourseName} (${course.CourseID})\n`;

            if (course.CourseDescription) {
                response += `\n**Course Description:** ${course.CourseDescription}\n\n`;
            }

            if (course.SectionInfo && Array.isArray(course.SectionInfo) && course.SectionInfo.length > 0) {
                // Mention the instructor if present
                if (instructor) {
                    response += `\n## Feedback for Sections Taught by **${instructor}**:\n`;
                } else {
                    response += `\n## Overall Feedback Across All Sections:\n`;
                }

                let totalSections = 0;
                const metricTotals: MetricTotals = {};
                const recommendationTotals = {
                    highlyMotivated: { yes: 0, no: 0 },
                    anyone: { yes: 0, no: 0 }
                };
                const allQuotes: { quote: string; term: string; year: string }[] = [];
                const allSummaries: any = {
                    intellectualChallenge: [],
                    courseStructure: [],
                    studentEngagement: []
                };

                course.SectionInfo.forEach(section => {
                    if (!section.feedback) return;
                    const feedback = JSON.parse(section.feedback);

                    // Check for valid metrics
                    const hasValidMetrics = Object.values(feedback.overallMetrics || {}).some((metric: any) => {
                        return metric.mean !== 0 || metric.median !== 0 || parseFloat(metric.stronglyAgree) !== 0;
                    });

                    // Check for non-zero distributions
                    const hasNonZeroDistributions = Object.values(feedback.distribution || {}).some((value: any) => {
                        return parseFloat(value) > 0;
                    });

                    // Skip this section if it doesn't have valid metrics or distributions
                    if (!hasValidMetrics && !hasNonZeroDistributions) return;

                    totalSections++;

                    // Aggregate overall metrics
                    for (const [metricName, value] of Object.entries(feedback.overallMetrics || {})) {
                        const metricValues: any = value as Metric;
                        if (!metricTotals[metricName]) metricTotals[metricName] = { mean: 0, median: 0, stronglyAgree: 0 };
                        metricTotals[metricName].mean += metricValues.mean;
                        metricTotals[metricName].median += metricValues.median;
                        metricTotals[metricName].stronglyAgree += parseFloat(metricValues.stronglyAgree) || 0;
                    }

                    // Aggregate recommendation stats
                    const recStats = feedback.overallCourseImpression?.recommendationStats;
                    if (recStats) {
                        const highlyMotivatedStudents = recStats.highlyMotivatedStudents || { yes: 0, no: 0 };
                        const anyoneInterested = recStats.anyoneInterested || { yes: 0, no: 0 };

                        recommendationTotals.highlyMotivated.yes += parseFloat(highlyMotivatedStudents.yes) || 0;
                        recommendationTotals.highlyMotivated.no += parseFloat(highlyMotivatedStudents.no) || 0;
                        recommendationTotals.anyone.yes += parseFloat(anyoneInterested.yes) || 0;
                        recommendationTotals.anyone.no += parseFloat(anyoneInterested.no) || 0;
                    }

                    // Collect quotes and summaries
                    if (feedback.overallCourseImpression?.studentQuotes) {
                        feedback.overallCourseImpression.studentQuotes.forEach((quote: string) => {
                            allQuotes.push({
                                quote,
                                term: section.termOffered || "Unknown Term",
                                year: section.year || "Unknown Year"
                            });
                        });
                    }

                    if (feedback.learningGains?.aiSummary) {
                        allSummaries.intellectualChallenge.push(feedback.learningGains.aiSummary);
                    }

                    if (feedback.courseStructure?.aiSummary) {
                        allSummaries.courseStructure.push(feedback.courseStructure.aiSummary);
                    }

                    if (feedback.studentEngagement?.aiSummary) {
                        allSummaries.studentEngagement.push(feedback.studentEngagement.aiSummary);
                    }
                });

                if (totalSections === 0) {
                    response += `\n## Note: No valid feedback data found${instructor ? ` for sections taught by ${instructor}` : ''}\n`;
                    return response;
                }

                // Calculate averages
                const metricAverages: MetricAverages = {};
                for (const [metricName, totals] of Object.entries(metricTotals)) {
                    metricAverages[metricName] = {
                        mean: (totals.mean / totalSections).toFixed(2),
                        median: (totals.median / totalSections).toFixed(2),
                        stronglyAgree: `${(totals.stronglyAgree / totalSections).toFixed(2)}%`
                    };
                }

                // Prepare data for bar chart
                const metricsToChart = [
                    { key: 'overallExcellence', label: 'Overall Excellence' },
                    { key: 'intellectualChallenge', label: 'Intellectual Challenge' },
                    { key: 'understoodPurpose', label: 'Understood Purpose' },
                    { key: 'understoodStandards', label: 'Understood Standards' },
                    { key: 'enhancedAbility', label: 'Enhanced Ability' },
                    { key: 'receivedUsefulFeedback', label: 'Received Useful Feedback' },
                    { key: 'evaluatedFairly', label: 'Evaluated Fairly' },
                    { key: 'feltRespected', label: 'Felt Respected' }
                ];

                const chartData = {
                    values: metricsToChart.map(metric =>
                        parseFloat(metricAverages[metric.key]?.mean || '0')
                    ),
                    labels: metricsToChart.map(metric => metric.label),
                    max: 5
                };

                response += `<barchart data='${JSON.stringify(chartData)}' ></barchart>\n\n`;

                const avgHighlyMotivatedYes = (recommendationTotals.highlyMotivated.yes / totalSections).toFixed(1);
                const avgAnyoneYes = (recommendationTotals.anyone.yes / totalSections).toFixed(1);

                response += "\n## Course Recommendations:\n";
                response += `- ${avgHighlyMotivatedYes}% of students recommend this course for highly motivated students\n`;
                response += `- ${avgAnyoneYes}% of students recommend this course for anyone interested in the subject\n\n`;

                // Combine summaries and ensure uniqueness
                const uniqueSummaries = Array.from(new Set([
                    ...allSummaries.intellectualChallenge,
                    ...allSummaries.courseStructure,
                    ...allSummaries.studentEngagement
                ]));

                // Limit the total number of summaries to 10
                const limitedSummaries = uniqueSummaries.slice(0, 10);

                response += "## Course Summary:\n";
                response += "<showmore>\n\n";

                // Iterate over the limited summaries
                limitedSummaries.forEach(summary => {
                    if (summary) {
                        response += `- ${summary}\n`;
                    }
                });

                response += "\n</showmore>\n\n";

                response += "\n";

                response += "## Student Quotes:\n";
                response += "<showmore>\n\n";

                // Group quotes by term and year
                const quotesByTermAndYear = allQuotes.reduce((acc, { quote, term, year }) => {
                    const key = `${term} ${year}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(quote);
                    return acc;
                }, {} as { [key: string]: string[] });

                // Format quotes grouped by term and year
                Object.entries(quotesByTermAndYear).slice(0, 25).forEach(([termYear, quotes]) => {
                    response += `### ${termYear}:\n`;
                    Array.from(new Set(quotes)).forEach(quote => {
                        response += `- "${quote}"\n`;
                    });
                    response += "\n";
                });

                response += "</showmore>\n\n";

                // Add a separator
                response += "\n\n<separator> \n </separator>\n\n";

                // Add call-to-actions to trigger other tools
                response += "### Want to Explore More?\n\n";

                // Include course and instructor in the call-to-actions if present
                const courseMention = course.CourseName;
                const instructorMention = instructor ? ` taught by ${instructor}` : '';

                response += `<calltoaction> "Can I see the **Teaching Effectiveness** of **${courseMention}**${instructorMention}?" </calltoaction>\n`;
                response += `<calltoaction> "What are the **Suggested Improvements** for **${courseMention}**${instructorMention}?" </calltoaction>\n`;
                response += `<calltoaction> "Tell me about **Student Engagement** in **${courseMention}**${instructorMention}." </calltoaction>\n`;
                response += `<calltoaction> "What are the **Learning Gains** from **${courseMention}**${instructorMention}?" </calltoaction>\n`;
                response += `<calltoaction> "How is the **Course Structure** of **${courseMention}**${instructorMention} organized?" </calltoaction>\n`;
                response += `<calltoaction> "Can you describe the **Course Difficulty** of **${courseMention}**${instructorMention}?" </calltoaction>\n`;

            } else {
                response += `\n## Note: No feedback data found${instructor ? ` for sections taught by ${instructor}` : ''}\n`;
            }

            return response;

        } catch (error) {
            console.error("Error in findOverallCourseFeedback:", error);
            if (error instanceof Error) {
                return `Error finding course feedback: ${error.message}`;
            }
            return "An unexpected error occurred while finding course feedback";
        }
    }
};

export { findOverallCourseFeedback };