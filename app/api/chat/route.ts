// pages/api/chat.ts

import { NextRequest } from 'next/server';
import { systemTemplate } from './systemtemplate';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { z } from 'zod';
import { unstable_noStore as noStore } from 'next/cache';
import { getXataClient } from '@/src/xata';

const xata = getXataClient();

// Import your tools

// Core Catalog
import { findCoreDegreeSectionsSummary } from './tools/coreCatalog/findCoreDegreeTrackDescription';
import { findSpecificCoreSectionDetails } from './tools/coreCatalog/findSpecificCoreSectionDetails';
import { suggestCoreCourseBasedOnInterests } from './tools/coreCatalog/suggestCoreCourseBasedOnInterests';
import { findCourseCountsTowardsCore } from './tools/coreCatalog/findCourseCountsTowardsCore';

// Course Catalog
import { findPrerequisitesOfClass } from './tools/courseCatalog/findPrerequisitesOfClass';
import { findWhatClassesICanTakeTool } from './tools/courseCatalog/findWhatClassesICanTakeTool';
import { suggestCoursesBasedOnInterests } from './tools/courseCatalog/suggestCoursesBasedOnInterests';
import { findCourseIdOrNameTool } from './tools/courseCatalog/findClassIDFromName';

// Course Feedback
import { findOverallCourseFeedback } from './tools/courseFeedback/findOverallCourseFeedback';
import { findCourseFeedbackCourseDifficultyTool } from './tools/courseFeedback/findCourseFeedbackCourseDifficultyTool';
import { findCourseFeedbackCourseStructureTool } from './tools/courseFeedback/findCourseFeedbackCourseStructureTool';
import { findCourseFeedbackLearningGains } from './tools/courseFeedback/findCourseFeedbackLearningGains';
import { findCourseFeedbackSuggestedImprovementsTool } from './tools/courseFeedback/findCourseFeedbackSuggestedImprovementsTool';
import { findCourseFeedbackStudentEngagementTool } from './tools/courseFeedback/findCourseFeedbackStudentEngagementTool';
import { courseSemanticSearch } from './tools/courseFeedback/courseSemanticSearch';
import { courseFeedbackSematicSuggest } from './tools/courseFeedback/courseFeedbackSematicSuggest';
import { findCourseFeedbackTeachingEffectivenessTool } from './tools/courseFeedback/findCourseFeedbackTeachingEffectivenessTool';

// Degree Catalog
import { suggestDegreesBasedOnInterests } from './tools/degreeCatalog/suggestDegreesBasedOnInterests';
import { findDegreeTracksByDepartment } from './tools/degreeCatalog/findDegreeTracksByDepartment';
import { findCourseCountsTowardsDegreeNotCore } from './tools/degreeCatalog/findCourseCountsTowardsDegreeNotCore';
import { findDegreeSpecificTrackCourses } from './tools/degreeCatalog/findDegreeSpecificTrackCourses';
import { findCoursesByDegreeTrack } from './tools/degreeCatalog/findCoursesByDegreeTrack';

// Instructor Feedback
import { findInstructorFeedback } from './tools/instructorFeedback/findInstructorFeedback';
import { findInstructorQuotes } from './tools/instructorFeedback/findInstructorQuotes';
import { findInstructorsAndClassesByDepartment } from './tools/instructorFeedback/findInstructorsAndClassesByDepartment';
import { instructorSemanticSearch } from './tools/instructorFeedback/instructorSemanticSearch';
import { findClassesOfInstructor } from './tools/instructorFeedback/findClassesOfInstructor';
import { compareInstructorsForCourse } from './tools/instructorFeedback/compareInstructorsForCourse';
import { findClassesInstructorIsNotTeaching } from './tools/instructorFeedback/findClassesInstructorIsNotTeaching';

// Schedule
import { findCourseSectionsThisQuarter } from './tools/schedule/findCourseSectionsThisQuarter';

// Fallback
import { fallbackToOldModel } from './tools/zfallback/fallback';

export const maxDuration = 120; 


export async function POST(req: NextRequest) {
  const { messages, data } = await req.json();
  const threadId = data.threadId;
  const lastMessage = messages[messages.length - 1];
  const question = lastMessage.content;

  console.log(messages)

  if (lastMessage.role === 'user') {
    try {
      await xata.db.thread_messages.create({
        thread_link: threadId,
        message: lastMessage.content,
        user_or_gpt: 'user',
      });
    } catch (error) {
      console.error('Error storing user message in Xata:', error);
    }
  }

  try {
    const result = await streamText({
      model: openai('gpt-4o'),
      tools: {
        // courseCatalog
        findPrerequisitesOfClass,
        findWhatClassesICanTakeTool,
        suggestCoursesBasedOnInterests,
        findCourseIdOrNameTool,
        
        // coreCatalog
        findCoreDegreeSectionsSummary,
        findSpecificCoreSectionDetails,
        suggestCoreCourseBasedOnInterests,
        findCourseCountsTowardsCore,
        
        // courseFeedback
        findOverallCourseFeedback,
        findCourseFeedbackCourseDifficultyTool,
        findCourseFeedbackCourseStructureTool,
        findCourseFeedbackLearningGains,
        findCourseFeedbackSuggestedImprovementsTool,
        findCourseFeedbackTeachingEffectivenessTool,
        findCourseFeedbackStudentEngagementTool,
        courseSemanticSearch,
        courseFeedbackSematicSuggest,

        // degreeCatalog
        suggestDegreesBasedOnInterests,
        findDegreeTracksByDepartment,
        findCourseCountsTowardsDegreeNotCore,
        findDegreeSpecificTrackCourses,
        findCoursesByDegreeTrack,

        // instructorCatalog
        findClassesOfInstructor,
        findInstructorFeedback,
        findInstructorQuotes,
        findInstructorsAndClassesByDepartment,
        instructorSemanticSearch,
        compareInstructorsForCourse,
        findClassesInstructorIsNotTeaching,

        // Schedule
        findCourseSectionsThisQuarter,

        // Fallback
        fallbackToOldModel,
        
      },
      system: systemTemplate,
      messages: [
        ...messages.slice(-10, -1),
        { role: 'user', content: `Context: \n\nQuestion: ${question}` },
      ],
      onFinish: async ({ text, toolResults }) => {
        try {
            let messageContent;
    
            if (toolResults && toolResults.length > 0) {
                messageContent = toolResults.map(result => {
                    const args = JSON.stringify(result.args, null, 2);
                    return `Tool Name: ${result.toolName}\nArgs: ${args}\nResult: ${result.result}`;
                }).join('\n\n');
            } else if (text) {
                messageContent = text;
            } else {
                messageContent = 'No content generated.';
            }
            await xata.db.thread_messages.create({
                thread_link: threadId,
                message: messageContent,
                user_or_gpt: 'gpt',
            });
        } catch (error) {
            console.error('Error storing assistant message in Xata:', error);
        }
    } 
    });
    return result.toDataStreamResponse();
    
  } catch (error) {
    console.error('Error in OpenAI request:', error);
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
