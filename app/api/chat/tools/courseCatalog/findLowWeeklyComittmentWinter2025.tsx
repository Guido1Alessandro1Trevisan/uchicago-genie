
import { z } from "zod";
import { unstable_noStore as noStore } from 'next/cache';
import coursesData from "@/app/api/chat/constants/course-winter-2025-hours.json"
import { departmentGuardPrompt } from "../../toolPrompt";
import { departments } from "../../constants/departments";

const rankClassesByWeeklyHoursTool = {
  description: `Ranks classes in a given department based on the average weekly hours worked outside of class. If a student asks about easy classes, fire this tool. If a student asks about easy "Core" classes, fire this tool but make sure they specify which part of the core. ${departmentGuardPrompt} Make sure you don't make up the userCourseId if the user does not provide three or five digit numbers.`,
  parameters: z.object({
    department: z.enum(departments).describe("The department for which to rank the classes"),
  }),
  execute: async ({ department }: { department: string }): Promise<string> => {
    noStore();

    console.log("Executing rankClassesByWeeklyHoursTool");

    try {
      // Filter the data for the given department
      const departmentData = coursesData.filter(course => course.department === department);
      
      if (departmentData.length === 0) {
        return `Hmm, I couldn’t find any courses in the department: ${department}. I’ll make a note of this and work on improving in the future!`;
      }

      // Create a map to aggregate courses, avoiding duplicates
      const courseMap = new Map<string, {
        courseID: string;
        courseName: string;
        instructor: string;
        weeklyHoursOutsideOfClass: number;
      }>();

      departmentData.forEach(course => {
        const key = `${course.courseID} - ${course.instructor}`;
        if (!courseMap.has(key)) {
          courseMap.set(key, {
            courseID: course.courseID,
            courseName: course.courseName, // Added courseName here
            instructor: course.instructor,
            weeklyHoursOutsideOfClass: course.weeklyHoursOutsideOfClass,
          });
        }
      });

      // Convert map to array
      const coursesArray = Array.from(courseMap.values());

      // Sort the array by weeklyHoursOutsideOfClass in ascending order
      coursesArray.sort((a, b) => a.weeklyHoursOutsideOfClass - b.weeklyHoursOutsideOfClass);

      // Build the response string
      let response = `Here are the **${department} department** classes ranked by weekly hours worked outside of class during Winter 2025 (in ascending order) based on the available information:\n\n`;

      coursesArray.forEach((course, index) => {
        response += `${index + 1}. ${course.courseID} - ${course.courseName} - ${course.instructor}: ${course.weeklyHoursOutsideOfClass} hours/week\n`;
      });

      return response;

    } catch (error) {
      console.error("Error in rankClassesByWeeklyHoursTool:", error);
      if (error instanceof Error) {
        return `Error ranking classes: ${error.message}`;
      }
      return "An unexpected error occurred while ranking classes.";
    }
  }
};

export { rankClassesByWeeklyHoursTool };