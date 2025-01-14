
import { z } from "zod";
import { departments } from "./constants/departments";


export const departmentGuardPrompt = `If the user doesn't specify a department, ask them to clarify. For instance they provide a broad term like "Art," confirm whether they mean "Art: Core", "Art History," "Visual Arts," "Media Arts and Design," or another related department.`


const tools = {
  "findCourseSectionsThisQuarter": {
    description: `Finds all sections of a specific course offered in a specific quarter and year mentioned by the user. If neither the time nor year is mentioned, use ${process.env.CURRENT_QUARTER} for the termOffered and ${process.env.CURRENT_YEAR} for the year as defaults. If the user does not mention the department ask it to mention the department to help you`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z.string().describe("The query about the course"),
      termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]),
      year: z
        .string()
        .regex(/^\d{4}$/, "Year must be a four-digit string"),
    }),
  },
  "instructorSemanticSearch": {
    description: `This tool retrieves answers to any questions about the user which are referring to an instructor and do not specify a class and ask about something specific which is not overall feedback or more student quotes. If the user doesn't mention a department, ask them to specify what they teach to make it easier to find the instructor. This tool should be mainly focused on negative feedback. Users can also prompt stuff like "is the professor good at teaching" and in the user query you should add words to get negative feedback especially`,
    parameters: z.object({
      department: z.enum(departments).describe(
        "The department to retrieve instructors from"
      ),
      userQuery: z.string().describe("The user query"),
    }),
  },
  "findInstructorQuotes": {
    description:
      "This tool retrieves and displays many student quotes, if mentioned, organized by the courses that the instructor has taught. It provides detailed insights into student feedback for each course. Use this tool when users are specifically interested in student quotes and ask a question along the lines of 'Can I see more student quotes about Andre Neves's teaching style?'. If the user does not mention the department ask it to mention the department to help you.",
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z
        .string()
        .describe("The query about the instructor and their courses"),
    }),
  },
  "findInstructorsByDepartment": {
    description: `This tool retrieves all instructors for a specified department it can also filter out based on the year and the quarter. If neither the time nor year is mentioned, use ${process.env.CURRENT_QUARTER} for the termOffered and ${process.env.CURRENT_YEAR} for the year as defaults.`,
    parameters: z.object({
      department: z
        .enum(departments)
        .describe("The department to retrieve instructors from"),
      termOffered: z
        .enum(["Autumn", "Winter", "Spring", "Summer"])
        .optional()
        .describe("The term the courses are offered"),
      year: z
        .string()
        .regex(/^\d{4}$/, "Year must be a four-digit string"),
    }),
  },
  "findInstructorFeedback": {
    description:
      "This tool analyzes an instructor's overall teaching performance across all courses, providing key feedback themes and relevant student quotes. Use this tool if the user asks about general feedback or what you think about this professor without mentioning something specific. For example, if the student asks, 'What do you think about this instructor?' If the user doesn't mention a department, ask them to specify what they teach to make it easier to find the instructor.",
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z.string().describe("The entire query of the user"),
    }),
  },
  "findClassesOfInstructor": {
    description: `Retrieves the total number of classes a single instructor has taught, along with the names of these classes. The user can optionally include the term and/or year to filter the results accordingly. It is important to use the department to filter out the instructor and course. If the user doesn't specify the department, ask for it to specify the department. Note that you can only answer questions after Autumn 2019 and before Winter 2025. So if, for example, a user asks about the classes taught by professors in Winter 2025, you can answer that question. This tool can also be used when a student asks how many classes a professor has taught.`,
    parameters: z.object({
      userQuery: z.string().describe("User's query about an instructor"),
      termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
      year: z
        .string()
        .regex(/^\d{4}$/, "Year must be a four-digit string")
        .optional(),
      department: z.enum(departments).optional(),
    }),
  },
  "compareInstructorsForCourse": {
    description: `Provides comparative data about all instructors teaching a specific course in a specified term and year. If the term or year is not specified, defaults to ${process.env.CURRENT_QUARTER} and ${process.env.CURRENT_YEAR}. The tool combines feedback metrics, student quotes, and schedule information for each instructor. If the user doesn't specify the department, ask for it to specify the department. This toll can be triggered by queries like 'Who are the best algorithms teachers'`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z.string().describe("The query about the course"),
      termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]),
      year: z
        .string()
        .regex(/^\d{4}$/, "Year must be a four-digit string"),
    }),
  },
  "suggestDegreesBasedOnInterests": {
    description: `This tool suggests degrees based on the user's interests by searching through degree descriptions.`,
    parameters: z.object({
      department: z.enum(departments).optional(),
      interests: z
        .string()
        .describe(
          "The user's interests or keywords related to desired degrees"
        ),
    }),
  },
  "findDegreeTracksByDepartment": {
    description:
      "This query retrieves the names of the degree tracks for a specific department. If the user asks you to suggest a degree track based on intersts don't use this tool for that.",
    parameters: z.object({
      department: z.enum(departments),
    }),
  },
  "findDegreeSpecificTrackCourses": {
    description: `Retrieves detailed information about a specific degree track (major, minor, or specialization), including its degree sections and the courses connected to each section. If no specific track is identified, lists available degree tracks in the department.`,
    parameters: z.object({
      departmentOfDegreeTrack: z.enum(departments).describe(
        "The department of the degree track"
      ),
      userQuery: z.string().describe("The user's query"),
    }),
  },
  "findCourseCountsTowardsDegreeNotCore": {
    description: `Verifies whether a specific course counts towards a degree track's requirements and indicates in which section(s) it counts. Do not use this tool if the user inquires about classes that count toward the Core Curriculum or Core. If the user does not mention the department of the course or the degree track, and you cannot infer it from the context, explicitly ask the user to specify the department for either the course or the degree track.`,
    parameters: z.object({
      departmentOfCourse: z.enum(departments).describe(
        "The department of the course the user mentions"
      ),
      departmentOfDegreeTrack: z.enum(departments).describe(
        "The department of the degree track"
      ),
      userQuery: z.string().describe("The user's query"),
    }),
  },
  "findOverallCourseFeedback": {
    description: `Extracts overall course impressions and metrics from student feedback across all course sections of a course and can filter based on the professor. If the user does not specify a department, ask them to provide the department of the course to assist you. If a student one word like 'Art,' and there are multiple departments that use that word confirm whether they mean 'Art History,' 'Visual Arts,' or 'Media Arts and Design,' among others.`,
    parameters: z.object({
      department: z.enum(departments).describe(""),
      userQuery: z.string().describe("The entire prompt of the user"),
    }),
  },
  "findCourseFeedbackTeachingEffectivenessTool": {
    description: `Evaluates the effectiveness of the course instructor's teaching methods.  Provides summaries, student quotes, AI references, and detailed instructor metrics. If the user does not specify a department, ask them to provide the department of the course to assist you.`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z
        .string()
        .describe(
          "The entire prompt of the user, typically the course name or ID, and instructor if specified"
        ),
    }),
  },
  "findCourseFeedbackSuggestedImprovementsTool": {
    description: `Compiles student suggestions for enhancing the course.Includes summaries and specific recommendations from student feedback. If the user does not specify a department, ask them to provide the department of the course to assist you.`,
    parameters: z.object({
      department: z.enum(departments).describe(
        "When tell you about a department make sure you are sure of selectiving the correct department for example if a student puts Art, you have to ask if they mean 'Art History', 'Visual Arts' or 'Media Arts and Design' etc"
      ),
      userQuery: z
        .string()
        .describe(
          "The entire prompt of the user, typically the course name or ID, and instructor if specified"
        ),
    }),
  },
  "findCourseFeedbackStudentEngagementTool": {
    description: `Analyzes student engagement levels within the course, including time commitment like the weekly hours worked and attendance. USe this tool if students ask about hourly commitments per week. If the user does not specify a department, ask them to provide the department of the course to assist you.`,
    parameters: z.object({
      department: z.enum(departments).describe(
        "When tell you about a department make sure you are sure of selectiving the correct department for example if a student puts Art, you have to ask if they mean 'Art History', 'Visual Arts' or 'Media Arts and Design' etc"
      ),
      userQuery: z
        .string()
        .describe(
          "The entire prompt of the user, typically the course name or ID, and instructor if specified"
        ),
    }),
  },
  "findCourseFeedbackLearningGains": {
    description: `Provides insights into the skills and knowledge students have gained from the course. 
      Includes summaries of learning achievements and relevant student quotes. If the user does not specify a department, ask them to provide the department of the course to assist you.`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z
        .string()
        .describe(
          "The entire prompt of the user, typically the course name or ID, and instructor if specified"
        ),
    }),
  },
  "findCourseFeedbackCourseStructureTool": {
    description: `Evaluates the organization and structure of the course, including lectures, problem sessions, and assignments.
      Provides summaries and student feedback on course components. If the user does not specify a department, ask them to provide the department of the course to assist you.`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z
        .string()
        .describe(
          "The entire prompt of the user, typically the course name or ID, and instructor if specified"
        ),
    }),
  },
  "findCourseFeedbackCourseDifficultyTool": {
    description: `Assesses the overall difficulty of the course from the students' perspective.
      Provides summaries and student comments on difficulty levels and course suitability. Includes the weighted average of hours per week committed outside of sessions.`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z
        .string()
        .describe(
          "The entire query of the user, typically the course name or ID, and instructor if specified"
        ),
    }),
  },
  "rankClassesByWeeklyHoursTool": {
    description: `Ranks classes in a given department based on the average weekly hours worked outside of class. Returns the classes in descending order of weekly hours.`,
    parameters: z.object({
      department: z.enum(departments).describe("The department for which to rank the classes"),
    }),
  },
  "courseSemanticSearch": {
    description: `This tool retrieves answers to any questions about the user which are referring to a course and do not specify an instructor and ask about something specific which is not overall feedback or more student quotes. If the user doesn't mention a department, ask them to specify which department the course belongs to to make it easier to find the course.`,
    parameters: z.object({
      department: z
        .enum(departments)
        .describe("The department to retrieve courses from"),
      userQuery: z.string().describe("The user query"),
    }),
  },
  "courseFeedbackSematicSuggest": {
    description: `This tool suggests courses to the user based on their query, which is not related to the content itself of the course. For example, students might ask to find courses with little homework or a lot of homework, easy courses or challenging ones, or courses taught by professors known for being approachable or demanding. They could inquire about courses that offer a lot of structure versus those with minimal structure, or about courses where homework closely aligns with the exams. Essentially, they might seek courses based on any factor unrelated to the content of the course itself.`,
    parameters: z.object({
      department: z
        .enum(departments)
        .describe("The department to search courses in"),
      userQuery: z
        .string()
        .describe(
          "The user's query related to one of the six feedback topics"
        ),
    }),
  },
  "suggestCoursesBasedOnInterests": {
    description: `Suggests 10 courses based on the user's interests by searching through course descriptions and includes when the courses are offered.`,
    parameters: z.object({
      department: z.enum(departments).optional(),
      interests: z
        .string()
        .describe(
          "The user's interests or keywords related to desired courses"
        ),
      termOffered: z
        .enum(["Autumn", "Winter", "Spring", "Summer"])
        .optional(),
      year: z
        .string()
        .regex(/^\d{4}$/, "Year must be a four-digit string")
        .optional(),
    }),
  },
  "findWhatClassesICanTakeTool": {
    description: `Finds classes a student can take after completing a specific class. If a student wants to know what classes they can take after completing a course, use this tool to return the list of courses that have the given course as a prerequisite. Include information about each course, such as its name, ID, and any prerequisite descriptions. This tool is also triggered if a user asks about classes related`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z.string().describe("The query of the user"),
      termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
      year: z
        .string()
        .regex(/^\d{4}$/, "Year must be a four-digit string")
        .optional(),
    }),
  },
  "findPrerequisitesOfClass": {
    description: `Explains the immediate prerequisites of any class requested by the user. If a student asks whether they can take a particular class, use this tool to explain the prerequisites. Additionally, activate this tool only if the user mentions prerequisites, requirements, or asks questions like 'What class do I need to take before taking this one?`,
    parameters: z.object({
      department: z.enum(departments),
      userQuery: z.string().describe("The query of the user"),
    }),
  },
  "findCourseIdOrNameTool": {
    description: `Finds the course information (ID, name, and description) given a course name or course ID. Retrieves data from the Neo4j database.`,
    parameters: z.object({
      department: z.string().describe(
        "The department name provided by the user"
      ),
      userQuery: z
        .string()
        .describe("The course name or course ID provided by the user"),
    }),
  },
  "findBiologyCourseFeedback": {
    description: `Finds feedback for specific sections of Inquiry Biology (BIOS 10140) or Principles of Biology (BIOS 10130). If the user does not specify the section, provides a list of sections to choose from. In general it helps you navigate the core classes for Bio`,
    parameters: z.object({
      userQuery: z
        .string()
        .describe(
          "Query about a specific biology section (e.g., 'What do students say about Section A of Inquiry Bio?')"
        ),
    }),

  },
  "findCoreDegreeSectionsSummary": {
    description: `Retrieves general descriptions of each section in the 'Core Curriculum' degree track without listing the courses. If the user mentions a specific section of the Core Curriculum do not run this tool`,
    parameters: z.object({
      userQuery: z.string().describe("The user's query"),
    }),
  },
  "findCourseCountsTowardsCore": {
    description: `Verifies whether a specific course counts towards the "Core Curriculum" requirements and indicates in which section(s) and subsection(s) it counts.`,
    parameters: z.object({
      departmentOfCourse: z.enum(departments).describe("The department of the course the user mentions"),
      userQuery: z.string().describe("The user's query"),
    }),
  },
  "findSequenceDetails": {
    description: `Provides detailed information about a specific sequence, including its description and the courses associated with it. This tool should be used when a user inquires about a specific sequence.`,
    parameters: z.object({
      department: z.string().describe("The department name provided by the user"),
      userQuery: z.string().describe("The user's query"),
    }),
  },
  "findSpecificCoreSectionDetails": {
    description: `Provides detailed information about a specific Core Curriculum section, including the courses required for that section. Make sure that this tool is used only if the user mentions that the section is in the "Core Curriculum" or Core`,
    parameters: z.object({
      sectionName: z
        .enum([
          "Humanities",
          "Civilization Studies",
          "Arts",
          "Humanities/Civilization Studies/Arts Elective",
          "Physical Sciences",
          "Biological Sciences",
          "Mathematical Sciences",
          "Sciences Elective",
          "Social Sciences",
        ])
        .describe("The name of the core section"),
    }),
  },
  "suggestCoreCourseBasedOnInterests": {
    description: `Suggests 20 courses or sequences from the Core Curriculum based on the user's interests by searching through course and sequence descriptions. If interests are not provided, suggests 20 popular or random courses/sequences. If termOffered and year are both specified, suggests only courses (no sequences) offered in that term and year that are linked to the degree sections and degree subsections of the Core Curriculum degree track. Does not propose single courses if they are in a sequence (unless term and year are specified); proposes the sequence directly with a description.`,
    parameters: z.object({
      interests: z.string().optional().describe("The user's interests or keywords related to desired courses."),
      termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
      year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string").optional(),
    }),
  },
};

export { tools };