
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';

import { departments } from "../../constants/departments";
import departmentInstructors from "../../constants/department-instructors.json";
import { findInstructor } from "../lib";

import { departmentGuardPrompt } from "../../toolPrompt";


const findClassesInstructorIsNotTeaching = {
  description: `Retrieves all classes an instructor is not teaching in a specific term and year within a department. The tool lists classes the instructor has previously taught in the department but is not teaching in the specified term and year. It is important to use the department to filter out the instructor and courses. ${departmentGuardPrompt}`,

  parameters: z.object({
    instructor: z.string().describe("This is the name of the instructor, with any typos made by the user corrected."),
    termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).default("Winter"),
    year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string").default("2025"),
    department: z.enum(departments).describe("The department to search within."),
  }),

  execute: async ({
    instructor,
    termOffered = "Winter",
    year = "2025",
    department,
  }: {
    instructor: string;
    termOffered: any;
    year: any;
    department: typeof departments[number];
  }): Promise<string> => {
    noStore();

    console.log("Executing findClassesInstructorIsNotTeaching", termOffered, year);

    // Check if department is provided
    if (!department) {
      return `Please specify the department for the instructor's classes. Available departments are: ${departments.join(', ')}.`;
    }

    let instructorName = '';

    try {
      // Check if instructor is provided
      if (instructor && instructor.trim() !== '') {
        // Fetch the instructor
        const instructorResult = await findInstructor(department, instructor);
        if (instructorResult) {
          instructorName = instructorResult;
        } else {
          let message = `Instructor not found. Please try to provide a valid instructor name.`;

          message += `
- Is the instructor's name spelled correctly?
- Is the instructor part of the specified department?
          `;

          // Suggest two random instructors from the department
          const departmentData = departmentInstructors.find(dep => dep.department === department);
          let randomInstructors = ['our instructors', 'our instructors'];
          if (departmentData && departmentData.instructors.length > 1) {
            const instructorsList = departmentData.instructors.map(instr => instr.instructor);
            const shuffled = instructorsList.sort(() => 0.5 - Math.random());
            randomInstructors = shuffled.slice(0, 2);
          }

          message += `

<separator>
</separator>

### Want to learn more?

<calltoaction> What is ${randomInstructors[0]}'s teaching style like? </calltoaction>
<calltoaction> How many classes has ${randomInstructors[1]} taught? </calltoaction>
          `;

          return message;
        }
      } else {
        return `Please specify the instructor's name to find their classes.`;
      }

      console.log("Running findClassesInstructorIsNotTeaching with", { department, termOffered, year, instructor: instructorName });

      // Initialize the Neo4j graph connection
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      // Fetch all courses the instructor has taught in the department
      const allInstructorCoursesQuery = `
MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
MATCH (c)<-[:SECTION_OF]-(:CourseSection)-[:TAUGHT_BY]->(i:Instructor {nameSurname: $instructor})
RETURN DISTINCT c.id AS courseId, c.name AS courseName, c.description AS courseDescription
      `;

      const allInstructorCoursesParams = {
        department,
        instructor: instructorName,
      };

      const allCoursesResult = await graph.query(allInstructorCoursesQuery, allInstructorCoursesParams);

      // Fetch courses the instructor is teaching in the specified term and year
      const instructorTermYearCoursesQuery = `
MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)
MATCH (c)<-[:SECTION_OF]-(cs:CourseSection {termOffered: $termOffered, year: $year})-[:TAUGHT_BY]->(i:Instructor {nameSurname: $instructor})
RETURN DISTINCT c.id AS courseId
      `;

      const instructorTermYearCoursesParams = {
        department,
        instructor: instructorName,
        termOffered,
        year,
      };

      const termYearCoursesResult = await graph.query(instructorTermYearCoursesQuery, instructorTermYearCoursesParams);

      console.log("All Courses Result:", allCoursesResult);
      console.log("Term Year Courses Result:", termYearCoursesResult);

      // Compute the difference
      const termYearCourseIds = new Set(termYearCoursesResult.map((record: any) => record.courseId));

      const coursesNotTeaching = allCoursesResult.filter((record: any) => !termYearCourseIds.has(record.courseId));

      // Process and format the data
      if (coursesNotTeaching.length === 0) {
        return `Instructor ${instructorName} is teaching all their courses in ${termOffered} ${year} in the ${department} department.`;
      }

      // Build the response
      let response = `### Some classes that ${instructorName} is not teaching in ${termOffered} ${year} in the ${department} department\n\n`;

      coursesNotTeaching.forEach((record: any) => {
        const courseId = record.courseId;
        const courseName = record.courseName;
        const courseDescription = record.courseDescription || 'No description available';

        response += `- **${courseName} (${courseId})**\n  _${courseDescription}_\n\n`;
      });

      // Trim and add separator
      response = response.trim();

      response += `

<separator> 
</separator>

### Want to learn more? 

<calltoaction> What is ${instructorName}'s teaching style like? </calltoaction>
`;

      return response;

    } catch (error) {
      console.error("Error in findClassesInstructorIsNotTeaching:", error);

      let message = `Error finding classes: ${error instanceof Error ? error.message : 'Unknown error'}.`;

      // Suggest two random instructors
      let randomInstructors = ['our instructors', 'our instructors'];
      if (department) {
        const departmentData = departmentInstructors.find(dep => dep.department === department);
        if (departmentData && departmentData.instructors.length > 1) {
          const instructorsList = departmentData.instructors.map(instr => instr.instructor);
          const shuffled = instructorsList.sort(() => 0.5 - Math.random());
          randomInstructors = shuffled.slice(0, 2);
        }
      }

      message += `

<separator>
</separator>

### Want to learn more?

<calltoaction> What is ${randomInstructors[0]}'s teaching style like? </calltoaction>
<calltoaction> How many classes has ${randomInstructors[1]} taught? </calltoaction>
      `;

      return message;
    }
  },
};

export { findClassesInstructorIsNotTeaching };