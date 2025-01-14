
import courses from "../constants/department-courses.json";
import instructorsData from "../constants/department-instructors.json";
import degreeTracksData from "../constants/department-degreetracks.json";

import Fuse from "fuse.js";



async function findCourseId(department: string, courseIdSearchTerm: string) {
  // Find the department data
  const departmentData = courses.find(
    (dept) => dept.departmentName.toLowerCase() === department.toLowerCase()
  );

  if (!departmentData) {
    return null;
  }

  const coursesDep = departmentData.courses;

  // Perform a loose keyword search on courseId
  const matchingCourses = coursesDep.filter((course) =>
    course.courseId.toLowerCase().includes(courseIdSearchTerm.toLowerCase())
  );

  if (matchingCourses.length === 0) {
    return null;
  }

  // Return the matching courseIds and courseNames
  return matchingCourses.map((course) => ({
    courseId: course.courseId,
    courseName: course.courseName,
  }));
}

async function findCourseName(department: string, courseNameSearchTerm: string) {
  // Find the department data
  const departmentData = courses.find(
    (dept) => dept.departmentName.toLowerCase() === department.toLowerCase()
  );

  if (!departmentData) {
    return null;
  }

  const coursesDep = departmentData.courses;

  // Filter out courses that don't have a courseName
  const coursesWithNames = coursesDep.filter((course) => course.courseName);

  // Set up Fuse.js options
  const options = {
    keys: ["courseName"],
    threshold: 0.4, // Adjust the threshold as needed
  };

  // Initialize Fuse with the course data
  const fuse = new Fuse(coursesWithNames, options);

  // Perform the search
  const matchingCourses = fuse.search(courseNameSearchTerm);

  if (matchingCourses.length === 0) {
    return null;
  }

  // Return the top fuzzy search result
  const topResult = matchingCourses[0].item;

  return {
    courseId: topResult.courseId,
    courseName: topResult.courseName,
  };
}

async function findInstructor(department: string, instructorSearchTerm: string) {
  // Find the department data
  const departmentData = instructorsData.find(
    (dept) => dept.department.toLowerCase() === department.toLowerCase()
  );

  if (!departmentData) {
    return null;
  }

  const instructorsDep = departmentData.instructors;

  // Set up Fuse.js options
  const options = {
    keys: ["instructor"],
    threshold: 0.4, // Adjust the threshold for matching
  };

  const fuse = new Fuse(instructorsDep, options);
  const matchingInstructors = fuse.search(instructorSearchTerm);

  if (matchingInstructors.length === 0) {
    return null;
  }

  // Find the maximum sectionsTaught among matching instructors
  const maxSectionsTaught = Math.max(
    ...matchingInstructors.map((result) => result.item.sectionsTaught || 0)
  );

  // Filter matching instructors to those with the maximum sectionsTaught
  const instructorsWithMaxSections = matchingInstructors.filter(
    (result) => (result.item.sectionsTaught || 0) === maxSectionsTaught
  );

  // Return the one with the highest Fuse.js ranking (first in the list)
  const topResult = instructorsWithMaxSections[0].item;

  return topResult.instructor;
}

async function findDegreeTrack(departmentName: string, degreeTrackSearchTerm: string) {
  // Check if degreeTrackSearchTerm is defined
  if (!degreeTrackSearchTerm) {
    return null;
  }

  // Find the department data
  const departmentData = degreeTracksData.find(
    (dept) => dept.name.toLowerCase() === departmentName.toLowerCase()
  );

  if (!departmentData || !departmentData.degreeTracks) {
    return null;
  }

  const degreeTracks = departmentData.degreeTracks; // This is an array of strings

  // Set up Fuse.js options for an array of strings
  const options = {
    isCaseSensitive: false,
    threshold: 0.4, // Adjust the threshold as needed
  };

  // Initialize Fuse with the degree tracks array (no keys needed)
  const fuse = new Fuse(degreeTracks, options);

  // Perform the search
  const matchingDegreeTracks = fuse.search(degreeTrackSearchTerm);

  if (matchingDegreeTracks.length === 0) {
    return null;
  }

  // Return the highest-ranking result (it's a string)
  const topResult = matchingDegreeTracks[0].item;

  return topResult;
}

async function findCourse(department: string, courseId: string, courseName: string) {

  // Try to find courses by courseId if courseId is provided
  if (courseId) {
    const coursesById = await findCourseId(department, courseId);
    if (coursesById && coursesById.length > 0) {
      return coursesById; // Return the list of courses found by ID
    }
  }

  // If no courses found by ID or courseId is null, try to find by courseName
  const courseByName = await findCourseName(department, courseName);
  if (courseByName) {
    return [courseByName]; // Return the course found by name as an array
  }

  // If no courses found by courseId or courseName, return null
  return null;
}


export { findCourseId, findCourseName, findInstructor, findDegreeTrack, findCourse}