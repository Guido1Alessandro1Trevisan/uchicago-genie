
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';

import { departments } from "../../constants/departments";

import { findCourse } from "../lib";

const userFriendlyText: any = {
  "non_science_majors": "Not majors in the Physical or Biological Sciences, Economics, Psychology, or Public Policy Studies",
  "science_majors": "Majors in the Physical or Biological Sciences, Economics, Psychology, or Public Policy Studies",
  "Non-Bio_Major_Requirements": "Non-Bio Major Requirements",
  "Bio_Major_Requirements": "Bio Major Requirements"
};

const findCourseCountsTowardsCore = {
  description: `Verifies whether a specific course counts towards the "Core Curriculum" requirements and indicates in which section(s) and subsection(s) it counts. Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  parameters: z.object({
    departmentOfCourse: z.enum(departments).describe("The department of the course the user mentions"),
    userCourseId: z.string().describe("This is the course ID, which consists of four capital letters followed by three to five numbers. For example, MATH 20700 or ECON 107. Sometimes the user does not specify the department, and that's fine; you can simply input the numbers, such as 107 or 204"),
    userCourseName: z.string().describe("This is the name of the course, not to be confused with the course ID. It typically consists of just a name without any three- or five-digit numbers."),
  }),
  execute: async ({
    departmentOfCourse,
    userCourseId,
        userCourseName,
  }: {
    departmentOfCourse: string;
    userCourseId: string,
        userCourseName: string,
  }): Promise<string> => {
    noStore();

    console.log("Executing findCourseCountsTowardsCore with department:", departmentOfCourse);

    try {
      // Fetch courseId and courseName from user's query
      const courseResult = await findCourse(departmentOfCourse, userCourseId, userCourseName);
        
      let courseId = null;
      let courseName = null;

      if (courseResult && courseResult.length > 0) {
        // Assuming we pick the first result
        courseId = courseResult[0].courseId;
        courseName = courseResult[0].courseName;
      } else {
        return `Hmm, I couldn't find any course matching the provided information in the ${departmentOfCourse} department. I’ll note this down and work on improving in the future!`;
      }
      

      console.log("Course info", courseId, courseName);

      // Check if courseId or courseName is successfully extracted
      if (courseId === null && courseName === null) {
        return "Hey, I'm sorry, but I wasn't able to find the course you are looking for. Note that I can't help with graduate-level or Booth courses just yet. If you can provide the Course ID or Course Name for an undergraduate course from the University of Chicago catalog, I'd be happy to assist!";
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

      // Define the Cypher query to check the Core Curriculum relationships
      const query = `
        // Check for direct connection via DegreeSection
        MATCH (dt:DegreeTrack {name: "Core Curriculum"})
        MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)-[:SECTION_COURSE]->(c:Course)
        WHERE
          ($courseId IS NOT NULL AND c.id = $courseId) OR
          ($courseName IS NOT NULL AND c.name = $courseName)
        RETURN
          dt.name AS degreeName,
          c.name AS courseName,
          c.id AS courseId,
          'DegreeSection' AS matchType,
          ds.name AS matchName,
          ds.description AS matchDescription,
          ds.name AS degreeSectionName,
          ds.description AS degreeSectionDescription,
          null AS degreeSubSectionName,
          null AS degreeSubSectionDescription
        LIMIT 1

        UNION

        // Check for connection via DegreeSubSection
        MATCH (dt:DegreeTrack {name: "Core Curriculum"})
        MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)-[:HAS_SUBSECTION]->(dss:DegreeSubSection)-[:SUBSECTION_COURSE]->(c:Course)
        WHERE
          ($courseId IS NOT NULL AND c.id = $courseId) OR
          ($courseName IS NOT NULL AND c.name = $courseName)
        RETURN
          dt.name AS degreeName,
          c.name AS courseName,
          c.id AS courseId,
          'DegreeSubSection' AS matchType,
          dss.name AS matchName,
          dss.description AS matchDescription,
          ds.name AS degreeSectionName,
          ds.description AS degreeSectionDescription,
          dss.name AS degreeSubSectionName,
          dss.description AS degreeSubSectionDescription
        LIMIT 1

        UNION

        // Check for connection via Sequence under Section
        MATCH (dt:DegreeTrack {name: "Core Curriculum"})
        MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)-[:SECTION_SEQUENCE]->(seq:Sequence)-[:SEQUENCE_COURSE]->(c:Course)
        WHERE
          ($courseId IS NOT NULL AND c.id = $courseId) OR
          ($courseName IS NOT NULL AND c.name = $courseName)
        RETURN
          dt.name AS degreeName,
          c.name AS courseName,
          c.id AS courseId,
          'Sequence' AS matchType,
          seq.name AS matchName,
          seq.description AS matchDescription,
          ds.name AS degreeSectionName,
          ds.description AS degreeSectionDescription,
          null AS degreeSubSectionName,
          null AS degreeSubSectionDescription
        LIMIT 1

        UNION

        // Check for connection via Sequence under SubSection
        MATCH (dt:DegreeTrack {name: "Core Curriculum"})
        MATCH (dt)-[:HAS_SECTION]->(ds:DegreeSection)-[:HAS_SUBSECTION]->(dss:DegreeSubSection)-[:SUBSECTION_SEQUENCE]->(seq:Sequence)-[:SEQUENCE_COURSE]->(c:Course)
        WHERE
          ($courseId IS NOT NULL AND c.id = $courseId) OR
          ($courseName IS NOT NULL AND c.name = $courseName)
        RETURN
          dt.name AS degreeName,
          c.name AS courseName,
          c.id AS courseId,
          'SequenceUnderSubSection' AS matchType,
          seq.name AS matchName,
          seq.description AS matchDescription,
          ds.name AS degreeSectionName,
          ds.description AS degreeSectionDescription,
          dss.name AS degreeSubSectionName,
          dss.description AS degreeSubSectionDescription
        LIMIT 1

        UNION

        // Check for connection via BioSection
        MATCH (c:Course)
        WHERE
          ($courseId IS NOT NULL AND c.id = $courseId) OR
          ($courseName IS NOT NULL AND c.name = $courseName)
        MATCH (c)-[:BIOSECTION]->(bs:BioSection)
        RETURN
          'Core Curriculum' AS degreeName,
          c.name AS courseName,
          c.id AS courseId,
          'BioSection' AS matchType,
          bs.name AS matchName,
          bs.description AS matchDescription,
          bs.name AS degreeSectionName,
          bs.description AS degreeSectionDescription,
          null AS degreeSubSectionName,
          null AS degreeSubSectionDescription
        LIMIT 1
      `;

      const params = {
        courseId: courseId || null,
        courseName: courseName || null
      };

      const data = await graph.query(query, params);

      console.log('Query result:', JSON.stringify(data, null, 2));

      if (!data || data.length === 0) {
        return `Hmm, I couldn’t find any information about the course "${courseName || courseId}" in relation to the "Core Curriculum". Please verify the course details, and I’ll make a note of this to work on improving in the future!`;
    }
    
      // Prepare the response
      const result = data[0]; // Take the first match

      // Ensure that courseName and courseId are correctly retrieved
      const courseNameResult = result.courseName || courseName || 'Unknown Course';
      const courseIdResult = result.courseId || courseId || 'Unknown ID';

      let response = `## Core Curriculum Requirement Check\n`;
      response += `**Course:** ${courseNameResult} (${courseIdResult})\n\n`;

      response += `✅ Yes, **${courseNameResult}** counts towards the **Core Curriculum** in the following:\n\n`;

      // Provide the matching section/subsection/sequence/etc.
      switch (result.matchType) {
        case 'DegreeSection':
          response += `### Degree Section:`;
          response += `${result.matchName || 'Unknown Section'} \n`;
          if (result.matchDescription) {
            response += `  ${result.matchDescription}\n`;
          }
          break;

        case 'DegreeSubSection':
          // Display Degree SubSection first

          let subSectionText;
          if (userFriendlyText[result.matchName] === undefined) {
            subSectionText = result.matchName;
          } else {
            subSectionText = userFriendlyText[result.matchName];
          }

          response += `${subSectionText || 'Unknown SubSection'}`;
          if (result.matchDescription) {
            response += `  ${result.matchDescription}\n`;
          }

          // Then display Degree Section
          response += `\n## Degree Section:`;
          response += ` ${result.degreeSectionName || 'Unknown Section'}\n`;
          if (result.degreeSectionDescription) {
            response += `  ${result.degreeSectionDescription}\n`;
          }
          break;

        case 'Sequence':
        case 'SequenceUnderSubSection':
          response += `## Degree Section:`;
          response += `${result.degreeSectionName || 'Unknown Section'}\n`;
          if (result.degreeSectionDescription) {
            response += `  ${result.degreeSectionDescription}\n`;
          }
          if (result.degreeSubSectionName) {

            let subSectionText;
            if (userFriendlyText[result.degreeSubSectionName] === undefined) {
              subSectionText = result.degreeSubSectionName;
            } else {
              subSectionText = userFriendlyText[result.degreeSubSectionName];
            }

            response += `\n## Degree SubSection:`;
            response += `${subSectionText}\n`;
            if (result.degreeSubSectionDescription) {
              response += `  ${result.degreeSubSectionDescription}\n`;
            }
          }
          response += `\n## Sequence:`;
          response += `${result.matchName || 'Unknown Sequence'}\n`;
          if (result.matchDescription) {
            response += `  ${result.matchDescription}\n`;
          }
          break;

        case 'BioSection':
          response += `## Biological Sciences Section:`;
          response += `${result.degreeSectionName || 'Unknown BioSection'}\n`;
          if (result.degreeSectionDescription) {
            response += `  ${result.degreeSectionDescription}\n`;
          }
          break;

        default:
          response += `- **Unknown Section**\n`;
          break;
      }

      return response;

    } catch (error) {
      console.error("Error in findCourseCountsTowardsCore:", error);
      if (error instanceof Error) {
        return `Error checking core curriculum requirements: ${error.message}`;
      }
      return "An unexpected error occurred while checking core curriculum requirements";
    }
  }
};

export { findCourseCountsTowardsCore };