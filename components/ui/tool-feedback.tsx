
import React, { useState, useEffect } from 'react';
import OpenAIMarkdown from '@/components/markdown/openai-markdown';
import magicLamp from '@/public/gifs/magic-lamp.gif';

const toolFeedbackMessages: any = {
  // Core Catalog
  'findBiologyCourseFeedback': 'Fetching biology course feedback',
  'findCoreDegreeSectionsSummary': 'Retrieving core degree sections',
  'findSpecificCoreSectionDetails': 'Retrieving core degree section',
  'findSequenceDetails': 'Retrieving sequence details',
  'suggestCoreCourseBasedOnInterests': 'Suggesting Core Classes',
  'findCourseCountsTowardsCore': 'Identifying courses that count towards your core',

  // Course Catalog
  'findCourseIdOrNameTool': 'Searching for course ID or name',
  'findPrerequisitesOfClass': 'Fetching prerequisites of the class',
  'findWhatClassesICanTakeTool': 'Finding classes you can take',
  'suggestCoursesBasedOnInterests': 'Suggesting courses based on your interests',

  // Course Feedback
  'courseFeedbackSematicSuggest': 'Providing course feedback suggestions',
  'courseSemanticSearch': 'Performing course semantic search',
  'findCourseFeedbackCourseDifficultyTool': 'Collecting course difficulty feedback',
  'findCourseFeedbackCourseStructureTool': 'Analyzing course structure feedback',
  'findCourseFeedbackLearningGains': 'Assessing learning gains feedback',
  'findCourseFeedbackStudentEngagementTool': 'Reviewing student engagement feedback',
  'findCourseFeedbackSuggestedImprovementsTool': 'Compiling suggested improvements',
  'findCourseFeedbackTeachingEffectivenessTool': 'Evaluating teaching effectiveness feedback',
  'findOverallCourseFeedback': 'Gathering overall course feedback',

  // Degree Catalog
  'findDegreeSpecificTrackCourses': 'Listing degree-specific track courses',
  'findCourseCountsTowardsDegreeNotCore': 'Identifying courses that count towards your degree',
  'findDegreeTracksByDepartment': 'Retrieving degree tracks by department',
  'suggestDegreesBasedOnInterests': 'Suggesting degrees based on your interests',
  'findCoursesByDegreeTrack': 'Finding courses',

  // Instructor Feedback
  'findClassesOfInstructor': 'Listing classes taught by instructor',
  'findInstructorFeedback': 'Gathering instructor feedback',
  'findInstructorQuotes': 'Collecting instructor quotes',
  'findInstructorsByDepartment': 'Finding instructors by department',
  'instructorSemanticSearch': 'Performing instructor semantic search',
  'compareInstructorsForCourse': 'Finding comparison data',

  // Schedule
  'findCourseSectionsThisQuarter': 'Fetching course sections for this quarter',

  // Fallback
  "fallbackToOldModel": "Falling back to old model",

  // Default
  'default': 'Fetching information',
};

const ToolFeedbackItem = ({ toolInvocation, handleCallToAction, messageContent }: any) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true); 

  const formatMessage = (content: any) => {
    return (
      <OpenAIMarkdown
        isLoading={isLoading}
        text={content}
        onAction={(actionText) => handleCallToAction(actionText)}
      />
    );
  };

  useEffect(() => {
    let interval: any;
    if (toolInvocation.state === 'result') {
      const fullText = toolInvocation.result;
      setDisplayedText(''); 
      setIsStreaming(true);
      setIsLoading(true); 
      let index = 0;
      const intervalDuration = 10;

      interval = setInterval(() => {
        if (index < fullText.length) {
          let nextSpaceIndex = fullText.indexOf(' ', index);
          if (nextSpaceIndex === -1) {
            nextSpaceIndex = fullText.length;
          }

          setDisplayedText(fullText.substring(0, nextSpaceIndex));

          index = nextSpaceIndex + 1;
        } else {
          clearInterval(interval);
          setIsStreaming(false);
          setIsLoading(false); 
        }
      }, intervalDuration);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [toolInvocation.state, toolInvocation.toolCallId]);

  const feedbackMessage =
    toolFeedbackMessages[toolInvocation.toolName] || toolFeedbackMessages['default'];

  const containerClassName = `mt-1 text-sm ${
    isLoading ? 'max-h-screen overflow-y-auto custom-scrollbar' : ''
  }`;

  return (
    <>
      {messageContent}
      <div key={toolInvocation.toolCallId} className={containerClassName}>
        {toolInvocation.state === 'call' && (
          <div className="flex items-center text-slate-600">
            <span className="animate-pulse">{feedbackMessage}</span>
            <img src={magicLamp.src} alt="Loading..." className="h-8 w-8 mr-2" />
          </div>
        )}
        {toolInvocation.state === 'result' && (
          <div className="whitespace-pre-wrap text-slate-700 mt-1">
            {formatMessage(displayedText)}
          </div>
        )}
        {toolInvocation.state === 'error' && (
          <div className="text-red-600">
            <strong>Error:</strong> {toolInvocation.errorMessage}
          </div>
        )}
      </div>
    </>
  );
};

const ToolFeedback = ({ toolInvocations, handleCallToAction, messageContent }: any) => {
  return (
    <>
      {toolInvocations?.map((toolInvocation: any) => (
        <ToolFeedbackItem
          key={toolInvocation.toolCallId}
          toolInvocation={toolInvocation}
          handleCallToAction={handleCallToAction}
          messageContent={messageContent}
        />
      ))}
    </>
  );
};

export default ToolFeedback;