
import React from 'react';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from 'next/link';
import ExponentialGraph from '@/components/ui/exponential-graph';
import ArrowDown from "@/public/svgs/down-arrow.svg";
import Image from 'next/image';

const Page = () => {

  const features = [
    {
      category: "Core Curriculum",
      items: [
        "Tell me about the Core Curriculum requirements",
        "What does the Biological Sciences Core requirement involve?",
        "Suggest some core classes based on my interest in history",
        "What courses satisfy the Mathematical Sciences requirement?",
        "Tell me about the Social Sciences Core requirement",
      ]
    },
    {
      category: "Course Information and Feedback",
      items: [
        "What is the Overall Course Feedback for MATH 162 in Mathematics?",
        "How difficult is CMSC 151?",
        "What is the weekly time commitment for PHYS 131? in Computer Science department",
        "What are common suggestions for improving CHEM 121? in Chemistry",
        "Show me student engagement metrics for BIOS 20234 in the Biological Sciences",
      ]
    },
    {
      category: "Course Planning",
      items: [
        "What are all the sections of MATH 153 offered this quarter?",
        "What courses can I take after completing PHYS 141?",
        "What are the prerequisites for CHEM 201?",
        "Show me biology courses offered in Winter 2025",
        "Which professors are teaching Economics in Winter 2025?",
        "Suggest some courses based on my interest in machine learning",
        "What classes are similar to MATH 207?"
      ]
    },
    {
      category: "Instructor Information",
      items: [
        "Can I have professor feedback on Professor Panagiotis Souganidis from Mathematics",
        "How many classes has Professor Min Sok Lee taught?",
        "Compare the teaching styles of professors teaching MATH 152 in Winter 2025",
      ]
    },
    {
      category: "Degree Information",
      items: [
        "What are all the degree tracks in Computer Science?",
        "Tell me about the Mathematics major requirements",
        "Does PHYS 141 count towards the Physics major?",
        "What are the requirements for a Biology minor?",
        "Suggest a degree track based on my interest in data science",
      ]
    }
  ];
  

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-4 sm:p-8">
      <Link href="/">
        <Button variant="ghost" className="mb-6 sm:mb-12 hover:bg-gray-100">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Chat
        </Button>
      </Link>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold mb-6">
          <span className="text-black">About</span>{" "}
          <span className="text-[#800000]">UChicago Genie</span>
        </h1>
        <section className="mb-12 sm:mb-16 flex flex-col">
          <p className="text-base sm:text-lg mb-6 leading-relaxed text-justify">
            UChicago Genie is your personal companion ready to answer questions about professor and course feedback, core curriculum, majors, degree paths, course requirements, content, and schedules for <span className="font-bold">undergraduate classes</span> with <span className="font-bold">no hallucinations</span>—at most, it may be unhelpful.
          </p>

          <p className="text-lg sm:text-xl font-semibold text-[#800000] text-center mt-8 mb-8 animate-pulse">
            The more questions you ask me, the smarter I will get.
          </p>

          <Image
            src={ArrowDown}
            alt="UChicago Logo "
            width={25}
            height={25}
            className="self-center "
          />

          {/* Add the id="questions" here */}
          <h2  className="text-xl sm:text-2xl font-semibold mb-4 mt-10" >
            I can answer these sort of questions for now... many more to come!
          </h2>
          <ul className="space-y-4">
            {features.map((feature, index) => (
              <li key={index}>
                <h3 className="text-lg font-bold text-[#800000] mb-2">{feature.category}</h3>
                <ul className="list-disc pl-6">
                  {feature.items.map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700">{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>



          <p className="text-base sm:text-lg mt-6 leading-relaxed text-justify">
            Course feedback data spans from 2019 to 2024. Currently, it includes information for Winter 2025's schedule.
          </p>
         

          <ExponentialGraph/>


          <p className="text-base sm:text-lg leading-relaxed text-justify mb-8">
            We are <span className="text-[#800000]">building the ship as we sail it</span>. The model is continuously training and improving.
          </p>

        </section>
      </div>
    </div>
  );
};

export default Page;