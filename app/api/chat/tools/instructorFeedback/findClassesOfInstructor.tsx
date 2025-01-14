
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';

import { departments } from "../../constants/departments";
import departmentInstructors from "../../constants/department-instructors.json";
import { findInstructor } from "../lib";

import { departmentGuardPrompt } from "../../toolPrompt";


type CourseSection = {
  courseName: string;
  courseId: string;
  term: string;
  year: string;
  department: string;
};

const findClassesOfInstructor = {
  description: `Retrieves the total number of classes a single instructor has taught, along with the names of these classes. The user can optionally include the term and/or year to filter the results accordingly. It is important to use the department to filter out the instructor and course. ${departmentGuardPrompt}`,

  parameters: z.object({
    instructor: z.string().describe("This is the name of the instructor, with any typos made by the user corrected."),
    termOffered: z.enum(["Autumn", "Winter", "Spring", "Summer"]).optional(),
    year: z.string().regex(/^\d{4}$/, "Year must be a four-digit string").optional(),
    department: z.enum(departments).optional(),
  }),

  execute: async ({
    instructor,
    termOffered,
    year,
    department,
  }: {
    instructor: string;
    termOffered: any;
    year: any;
    department: typeof departments[number];
  }): Promise<string> => {
    noStore();

    // Set parameters to null if not provided
    termOffered = termOffered ?? null;
    year = year ?? null;

    console.log("Executing findClassesOfInstructor", termOffered, year);

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

      console.log("Running findClassesOfInstructor with", { department, termOffered, year, instructor: instructorName });

      // Initialize the Neo4j graph connection
      const graph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
      });

      // Construct the query
      let query = `
MATCH (d:Department {name: $department})-[:OFFERS]->(c:Course)<-[:SECTION_OF]-(cs:CourseSection)-[:TAUGHT_BY]->(i:Instructor {nameSurname: $instructor})
WHERE ($termOffered IS NULL OR cs.termOffered = $termOffered)
  AND ($year IS NULL OR cs.year = $year)
RETURN 
    d.name AS department,
    c.name AS courseName,
    c.id AS courseId,
    c.description AS courseDescription,
    cs.termOffered AS term,
    cs.year AS year
ORDER BY toInteger(cs.year) DESC, 
         CASE cs.termOffered 
             WHEN 'Winter' THEN 1 
             WHEN 'Spring' THEN 2 
             WHEN 'Summer' THEN 3 
             WHEN 'Autumn' THEN 4 
             ELSE 5 
         END DESC
      `;

      const params: Record<string, any> = {
        department,
        instructor: instructorName,
        termOffered,
        year,
      };

      // Execute the query
      const result = await graph.query(query, params);

      console.log("Query Result:", result);

      // Process the result
      const data = result.map((record: any) => ({
        department: record.department,
        courseName: record.courseName,
        courseId: record.courseId,
        courseDescription: record.courseDescription,
        term: record.term,
        year: record.year,
      }));

      // No classes found
      if (!data || data.length === 0) {
        let message = `Hmm, I couldn’t find any classes for instructor ${instructorName} in the ${department} department`;
        if (termOffered) {
          message += ` for the term ${termOffered}`;
        }
        if (year) {
          message += ` for the year ${year}`;
        }
        message += `. I’ll make a note of this and work on improving in the future!`;

        // Suggest two random instructors
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

      // Process and format the data
      const totalSections = data.length;

      // Group sections by courseId
      const courseMap = new Map<string, CourseSection[]>();
      const descriptionMap = new Map<string, string>();

      data.forEach(record => {
        const section: CourseSection = {
          department: record.department,
          courseName: record.courseName,
          courseId: record.courseId,
          term: record.term,
          year: record.year,
        };

        const description = record.courseDescription || 'No description available';
        const key = `${section.courseName} (${section.courseId})`;

        descriptionMap.set(key, description);

        if (!courseMap.has(key)) {
          courseMap.set(key, []);
        }
        courseMap.get(key)!.push(section);
      });

      // Build the response
      let response = `### Classes Taught by ${instructorName}\n\n`;

      // Include total number of sections
      response += `**Total Sections Taught:** ${totalSections}\n\n`;

      // Include filters
      const filtersApplied: string[] = [];
      if (termOffered) {
        filtersApplied.push(`**Term Offered:** ${termOffered}`);
      }
      if (year) {
        filtersApplied.push(`**Year:** ${year}`);
      }
      if (filtersApplied.length > 0) {
        response += filtersApplied.join(' | ') + "\n\n";
      }

      // Build response using courseMap
      courseMap.forEach((sections, courseKey) => {
        const description = descriptionMap.get(courseKey) || 'No description available';
        const terms = sections.map(section => `${section.year}: ${section.term}`).join(' | ');
        response += `- **${courseKey}**\n  _${description}_\n  ${terms}\n\n`;
      });

      // Trim and add separator
      response = response.trim();

      response += `

<separator> 
</separator>

### Want to learn more? 
`;

      const courses = Array.from(courseMap.keys());
      if (courses.length > 0) {
        response += `<calltoaction> What do students say about ${instructorName}'s teaching in ${courses[0]}? </calltoaction>\n`;
      }
      response += `<calltoaction> What is ${instructorName}'s teaching style like? </calltoaction>\n`;

      return response;

    } catch (error) {
      console.error("Error in findClassesOfInstructor:", error);

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

export { findClassesOfInstructor };