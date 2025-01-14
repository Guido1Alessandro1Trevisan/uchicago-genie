# UChicago Genie Guide

Welcome to the repository for **UChicago Genie**. This documentation will guide you through the setup and understanding of the components of the project. Please follow the instructions below to successfully configure and explore the repository.

## Table of Contents

1. [Core Technologies](#core-technologies)
2. [Environment Variables](#environment-variables)
3. [Authentication Configuration](#authentication-configuration)
4. [Database Configuration](#database-configuration)
5. [Project Structure](#project-structure)
6. [Tools and Utilities](#tools-and-utilities)
7. [List of Tools](#list-of-tools-questions-uchicago-genie-is-optimized-to-answer)
8. [Neo4j Graph Schema](#neo4j-graph-schema)

---

## Core Technologies

1. **OpenAI API**
   - Enhances natural language understanding and generation for advanced language processing.

2. **Authentication**
   - Utilizes Google OAuth 2.0 for secure user authentication and access control.

3. **Database Solutions**
   - **Xata**: A serverless database ensuring seamless data management and scalability.
   - **Neo4j**: A graph database optimizing the querying of interconnected data structures like courses and departments.

4. **Backend Framework**
   - **Next.js**: Powers server-side rendering and effective routing, improving performance.

5. **Frontend Development**
   - **Shan UI**: Facilitates a responsive and intuitive user interface.
   - **React Markdown**: Enables dynamic content rendering, crucial for visual data representations.

## Environment Variables

To run the project, you'll need to configure several environment variables. Below is a list of the necessary keys and their purposes:

```plaintext
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ASSISTANT_ID=asst_rXXXXXXXXXXXXXXXXXXXXXX

AUTH_SECRET=wZQpnP02XXXXXXXXXXXXX
AUTH_GOOGLE_ID=XXXXXXXXXXXXXX.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-XXXXXXXXXXXXXXXXXX

XATA_BRANCH=main
XATA_API_KEY=xau_4t8wmXXXXXXXXXXXXXMDELd

NEO4J_URI=neo4j+s://XXXXXXXX.databases.neo4j.io
NEO4J_USERNAME=XXXX
NEO4J_PASSWORD=XXXXXXXXXX

AURA_INSTANCEID=XXXXXXXX
AURA_INSTANCENAME=XXXXXXXX

NEW=XXXXXXXXXXXXXXXXXXXXXXXXXXXX

CURRENT_QUARTER=Winter
CURRENT_YEAR=2025
```

## Authentication Configuration

Under the **AUTH** section, you need to configure the `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`. These are vital for enabling authentication within the application.

## Database Configuration

This application uses **Xata** for database configuration and **Neo4j** for data storage to enable GraphRAG. Ensure your framework or tooling properly loads these configurations at startup:

- **Xata Configuration**:
  - Branch: `XXXX`
  - API Key: `xau_XXXXXXXX`

- **Neo4j Configuration**:
  - URI: `neo4j+s://XXXXXXXX.databases.neo4j.io`
  - Username: `XXXX`
  - Password: `XXXXXXXXXXXXXX`

Note that in order to run you need to have a database that respects the schema

## Project Structure

Here's a quick overview of the directory structure:

- `/api/chat/constants`: Houses constants utilized in chat functionalities.
- `/api/chat/tools`: Stores LLM tools and their prompts.
- `/components/markdown`: Markdown parsing of responses with React Markdown for generating graphs and other components.
- `/api/chat/tools/lib.tsx`: Helper functions to that decrease latency by using Fuzzy Keyword search to understand the user query

## Tools and Utilities

The project extensively uses tools like fuzzy word search and Cypher queries for optimized responses.

The prompts used to build GPT-4os assistant logic and LLM tools are:

- **Tool Prompts**: `/api/chat/toolPrompt.tsx`, these are refined for accuracy to prevent assumptions on the responses of users.
- **System Template Prompt**: `/api/chat/systemtemplate.tsx`, guiding the overarching logic of the chatbot. 

## List of Tools (Questions UChicago Genie is optimized to answer)

This section provides a comprehensive list of the tools available in this repository, alongside their intended parameters and output descriptions. The tools are utilized for various educational and administrative tasks within an academic setting, supporting activities like retrieving course information, instructor evaluations, and student feedback.

| **Tool Name**                              | **Description**                                                                                                                                                                      | **Parameters**                                                                                                                                                                        |
|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **findCourseSectionsThisQuarter**          | Finds all sections of a specified course in a given term and year, defaulting if unspecified. It requests department detail if not mentioned.                                        | `department`, `userQuery`, `termOffered`, `year`                                                                                                                                       |
| **instructorSemanticSearch**               | Retrieves instructor-related answers, emphasizing negative feedback. Requests teaching-specific details if department not specified.                                                 | `department`, `userQuery`                                                                                                                                                              |
| **findInstructorQuotes**                   | Displays student quotes by an instructor's courses if interested specifically. Requests department detail if not mentioned.                                                          | `department`, `userQuery`                                                                                                                                                              |
| **findInstructorsByDepartment**            | Retrieves all instructors in a department, filtering by term and year as specified or by defaults.                                                                                    | `department`, `termOffered`, `year`                                                                                                                                                    |
| **findInstructorFeedback**                 | Provides an analysis of overall teaching performance across courses with key feedback themes and quotes. Requests department if unspecified.                                           | `department`, `userQuery`                                                                                                                                                              |
| **findClassesOfInstructor**                | Retrieves classes taught by an instructor, allowing term and year filtering. Use within specified periods, and request department detail if not mentioned.                           | `userQuery`, `termOffered`, `year`, `department`                                                                                                                                       |
| **compareInstructorsForCourse**            | Compares instructors teaching a specific course, with feedback and schedule info using defaults if term/year unspecified. Requests department if not specified.                     | `department`, `userQuery`, `termOffered`, `year`                                                                                                                                       |
| **suggestDegreesBasedOnInterests**         | Suggests degrees by aligning user interests with degree descriptions.                                                                                                                 | `department`, `interests`                                                                                                                                                              |
| **findDegreeTracksByDepartment**           | Retrieves degree tracks for a department. Not to be used for interest-based suggestions.                                                                                             | `department`                                                                                                                                                                           |
| **findDegreeSpecificTrackCourses**         | Provides details about a degree track including sections and courses, lists available tracks if unspecified.                                                                         | `departmentOfDegreeTrack`, `userQuery`                                                                                                                                                 |
| **findCourseCountsTowardsDegreeNotCore**   | Verifies if a course counts toward a degree track, excluding core curriculum courses. Requests department for unspecified course/degree tracks.                                      | `departmentOfCourse`, `departmentOfDegreeTrack`, `userQuery`                                                                                                                           |
| **findOverallCourseFeedback**              | Extracts metrics and impressions from student feedback for all course sections. Requests department detail if unspecified.                                                           | `department`, `userQuery`                                                                                                                                                              |
| **findCourseFeedbackTeachingEffectivenessTool** | Evaluates course teaching effectiveness with summaries and metrics. Requests department detail if unspecified.                                                                          | `department`, `userQuery`                                                                                                                                                              |
| **findCourseFeedbackSuggestedImprovementsTool** | Compiles student suggestions for course enhancement. Requests department detail if unspecified.                                                                                         | `department`, `userQuery`                                                                                                                                                              |
| **findCourseFeedbackStudentEngagementTool** | Analyzes engagement levels and time commitment in a course. Requests department detail if unspecified.                                                                                | `department`, `userQuery`                                                                                                                                                              |
| **findCourseFeedbackLearningGains**       | Provides insights into skills and knowledge gained from the course.                                                                                                                                          | `department`, `userQuery`                                                                                                                                                               |
| **findCourseFeedbackCourseStructureTool**  | Evaluates the course structure including lectures and assignments. Requests department detail if unspecified.                                                                         | `department`, `userQuery`                                                                                                                                                               |
| **findCourseFeedbackCourseDifficultyTool** | Assesses the perceived course difficulty with student feedback. Requests department detail if unspecified.                                                                            | `department`, `userQuery`                                                                                                                                                               |
| **rankClassesByWeeklyHoursTool**           | Ranks departmental courses by average weekly hours worked, in descending order.                                                                                                        | `department`                                                                                                                                                                            |
| **courseSemanticSearch**                  | Finds course-specific answers not linked to overall feedback. Requests department if unspecified.                                                                                   | `department`, `userQuery`                                                                                                                                                               |
| **courseFeedbackSematicSuggest**           | Suggests courses based on non-course content-related user queries like workload or teaching style. Requests department if unspecified.                                                | `department`, `userQuery`                                                                                                                                                               |
| **suggestCoursesBasedOnInterests**         | Suggests courses based on user interests with term and year offered.                                                                                                                  | `department`, `interests`, `termOffered`, `year`                                                                                                                                       |
| **findWhatClassesICanTakeTool**            | Identifies classes available post completing a specified course, including prerequisites.                                                                                                                                 | `department`, `userQuery`, `termOffered`, `year`                                                                                                                                       |
| **findPrerequisitesOfClass**              | Explains prerequisites for a specified class. Activates on prerequisite/requirement-related queries.                                                                                 | `department`, `userQuery`                                                                                                                                                               |
| **findCourseIdOrNameTool**                 | Finds course information given its name or ID.                                                                                                                                        | `department`, `userQuery`                                                                                                                                                               |
| **findBiologyCourseFeedback**              | Finds feedback for specific Biology sections, advising on core classes.                                                                                                                | `userQuery`                                                                                                                                                                             |
| **findCoreDegreeSectionsSummary**          | Provides general descriptions of core curriculum sections without listing courses.                                                                                                     | `userQuery`                                                                                                                                                                             |
| **findCourseCountsTowardsCore**            | Verifies if a course counts toward the "Core Curriculum" requirements and identifies the specific sections where it applies. Requests department for course information if unspecified.                       | `departmentOfCourse`, `userQuery`                                                                                                                                                       |
| **findSequenceDetails**                    | Provides detailed information about a specific sequence, including its description and associated courses. Ideal for queries about sequences.                                            | `department`, `userQuery`                                                                                                                                                               |
| **findSpecificCoreSectionDetails**         | Offers detailed insights into a specific Core Curriculum section and the required courses for the section. Used when queries mention the "Core Curriculum" explicitly.                  | `sectionName`                                                                                                                                                                           |
| **suggestCoreCourseBasedOnInterests**      | Suggests 20 courses or sequences from the Core Curriculum based on user interests or provides a general list. Filters by term and year when specified.                                      | `interests`, `termOffered`, `year`                                                                                                                                                      |

## Neo4j Graph Schema

#### Department Node
```plaintext
(d:Department {
    name: $name,
    departmentDescription: $departmentDescription
})
```

#### Degree Track Node
```plaintext
(dt:DegreeTrack {
    name: $name, 
    type: $type,
    department: $department,
    totalUnits: $totalUnits,
    description: $description
})
```

#### Degree Section Node
```plaintext
(ds:DegreeSection {
    name: $name,
    description: $description
})
```

#### Sequence Node
```plaintext
(s:Sequence {
    name: $name,
    id: $id,
    description: $description
})
```

#### Course Node
```plaintext
(c:Course {
    name: $name,
    id: $id,
    description: $description,
    notes: $notes,
    prereqDescription: $prereqDescription
})
```

#### Instructor Node
```plaintext
(i:Instructor {
    nameSurname: $nameSurname,
})
```

#### Course Section Node
```plaintext
(cs:CourseSection {
    id: $id,
    year: $year,
    notes: $notes,
    termOffered: $termOffered,
    feedback: $feedback,
    instructor: "$instructor"
})
```

#### Schedule Node
```plaintext
(s:Schedule {
    dayOfWeek: $dayOfWeek,
    startTime: $startTime,
    endTime: $endTime,
    location: $location
})
```

#### SubSchedule Node
```plaintext
(ss:SubSchedule {
    dayOfWeek: $dayOfWeek,
    startTime: $startTime,
    endTime: $endTime,
    location: $location
})
```

### Relationships

#### Department Relations
- `(d:Department)-[:OFFERS]->(dt:DegreeTrack)`
- `(d:Department)-[:OFFERS]->(c:Course)`
- `(d:Department)-[:OFFERS]->(s:Sequence)`

#### Degree Track Relations
- `(dt:DegreeTrack)-[:HAS_SECTION]->(ds:DegreeSection)` with attribute `Total_units_required`
- `(ds:DegreeSection)-[:REQUIRES]->(c:Course)`

#### Course Relations
- `(c:Course)-[:HAS_PREREQUISITE]->(c:Course)`
- `(c:Course)-[:IS_SEQUENTIAL_TO]->(c:Course)`
- `(c:Course)<-[:SECTION_OF]-(cs:CourseSection)`

#### Sequence Relations
- `(s:Sequence)<-[:SEQUENCE_OF]-(c:Course)`

#### Course Section Relations
- `(cs:CourseSection)-[:TAUGHT_BY]->(i:Instructor)`
- `(cs:CourseSection)-[:HAS_SCHEDULE]->(s:Schedule)`
- `(cs:CourseSection)-[:HAS_SUBSCHEDULE]->(ss:SubSchedule)`

#### Additional Relations for Core and Biology Sections
- `(ds:DegreeSection)-[:SECTION_SEQUENCE]->(s:Sequence)`
- `(ds:DegreeSection).[HAS_SUBSECTION]->(ds:DegreeSubSection)`
- `(ds:DegreeSubSection)-[:SUBSECTION_COURSE]->(c:Course)`
- `(ds:DegreeSection)-[:SECTION_COURSE]->(c:Course)`
- `(ds:DegreeSubSection)-[:SUBSECTION_SEQUENCE]->(s:Sequence)`
- `(c: Course)-[BIOSECTION]->(bs: BioSection)`

#### DegreeSubSection Node (for Core)
```plaintext
(dss: DegreeSubSection {
    name: $name,
    description: $description
})
```

#### BioSection (for Biology)
```plaintext
(bs: BioSection {
    section: $section,
    name: $name,
    description: $description,
    instructor: $instructor,
    terms: $quarters
})
```