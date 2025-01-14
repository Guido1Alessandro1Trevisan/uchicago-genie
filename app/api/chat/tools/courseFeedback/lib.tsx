
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";

// Define the structure of the feedback data based on your provided example
type FeedbackData = {
  [sectionId: string]: {
    learningGains: {
      aiSummary: string;
      studentQuotes: string[];
    };
    teachingEffectiveness: {
      aiSummary: string;
      studentQuotes: string[];
      instructorMetrics: {
        [metric: string]: {
          mean: number;
          median: number;
          stronglyAgree: string;
        };
      };
    };
    courseDifficulty: {
      aiSummary: string;
      studentQuotes: string[];
    };
    courseStructure: {
      aiSummary: string;
      studentQuotes: string[];
    };
    studentEngagement: {
      aiSummary: string;
      hoursPerWeekOutsideOfSession: { [key: string]: string };
      proportionOfClassAttended: { [key: string]: string };
      interestLevel: {
        before: { [key: string]: string };
        after: { [key: string]: string };
      };
    };
    suggestedImprovements: {
      aiSummary: string;
      studentQuotes: string[];
    };
  };
};

export async function fetchFeedbackData(
  courseId: string | null,
  courseName: string | null,
): Promise<FeedbackData> {
  const url = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!url || !username || !password) {
    throw new Error("Missing Neo4j credentials");
  }

  const graph = await Neo4jGraph.initialize({
    url,
    username,
    password,
  });

  // Cypher query to fetch feedback data
  const query = `
    MATCH (c:Course)
    WHERE 
        CASE
            WHEN $courseId IS NOT NULL THEN c.id = $courseId
            ELSE c.name = $courseName
        END
    WITH c
    OPTIONAL MATCH (c)<-[:SECTION_OF]-(cs:CourseSection)
    WHERE 
        ($instructor IS NULL OR cs.instructor = $instructor)
    RETURN
        cs.sectionId AS sectionId,
        cs.feedback AS feedback
  `;

  const params = {
    courseId,
    courseName,
    instructor: null,
  };

  // Execute the query
  const data = await graph.query(query, params);

  const feedbackData: FeedbackData = {};

  console.log("Fetched Data:", data);

  data.forEach((record: any) => {
    const sectionId = record.sectionId;
    const feedback = record.feedback ? JSON.parse(record.feedback) : null;

    if (feedback) {
      // Apply limits to AI summaries and student quotes
      const limitAiSummary = (summary: string) => {
        const items = summary.split('\n').filter(item => item.trim() !== '');
        // Limit to 3 items
        const limitedItems = items.slice(0, 3);
        return limitedItems.join('\n');
      };

      const limitStudentQuotes = (quotes: string[]) => {
        // Limit to 25 quotes
        return quotes.slice(0, 25);
      };

      // Process each section of the feedback
      feedbackData[sectionId] = {
        learningGains: {
          aiSummary: limitAiSummary(feedback.learningGains?.aiSummary || ''),
          studentQuotes: limitStudentQuotes(feedback.learningGains?.studentQuotes || []),
        },
        teachingEffectiveness: {
          aiSummary: limitAiSummary(feedback.teachingEffectiveness?.aiSummary || ''),
          studentQuotes: limitStudentQuotes(feedback.teachingEffectiveness?.studentQuotes || []),
          instructorMetrics: feedback.teachingEffectiveness?.instructorMetrics || {},
        },
        courseDifficulty: {
          aiSummary: limitAiSummary(feedback.courseDifficulty?.aiSummary || ''),
          studentQuotes: limitStudentQuotes(feedback.courseDifficulty?.studentQuotes || []),
        },
        courseStructure: {
          aiSummary: limitAiSummary(feedback.courseStructure?.aiSummary || ''),
          studentQuotes: limitStudentQuotes(feedback.courseStructure?.studentQuotes || []),
        },
        studentEngagement: {
          aiSummary: limitAiSummary(feedback.studentEngagement?.aiSummary || ''),
          hoursPerWeekOutsideOfSession:
            feedback.studentEngagement?.hoursPerWeekOutsideOfSession || {},
          proportionOfClassAttended:
            feedback.studentEngagement?.proportionOfClassAttended || {},
          interestLevel: feedback.studentEngagement?.interestLevel || { before: {}, after: {} },
        },
        suggestedImprovements: {
          aiSummary: limitAiSummary(feedback.suggestedImprovements?.aiSummary || ''),
          studentQuotes: limitStudentQuotes(feedback.suggestedImprovements?.studentQuotes || []),
        },
      };
    } else {
      console.log(`No feedback found for section ${sectionId}`);
    }
  });

  console.log("FeedbackData", feedbackData);

  return feedbackData;
}

export function parseHourRange(range: string): number {
  const rangeMatch = range.match(/(\d+)-(\d+)\s*hours/i);
  const openEndedMatch = range.match(/(\d+)\+\s*hours/i);

  if (rangeMatch) {
    const lower = parseInt(rangeMatch[1], 10);
    const upper = parseInt(rangeMatch[2], 10);
    return (lower + upper) / 2;
  } else if (openEndedMatch) {
    const lower = parseInt(openEndedMatch[1], 10);
    // Assign an upper bound for open-ended ranges, e.g., 25 for "21+ hours"
    const upper = lower + 4; // You can adjust this as needed
    return (lower + upper) / 2;
  } else {
    // If the range doesn't match expected patterns, return 0 or handle accordingly
    console.warn(`Unrecognized range format: "${range}". Assigning 0 hours.`);
    return 0;
  }
}