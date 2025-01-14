import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import Image from 'next/image';
import LectureIcon from "@/public/images/lecture.png";
import BookIcon from "@/public/images/book.png";
import ClockIcon from "@/public/images/clock.png";
import WandIcon from "@/public/images/wand.png";

interface SuggestionButtonsProps {
    handleSuggestionSelected: (suggestion: { type: 'set' | 'append'; text: string }) => void;
    handleCallToAction: (actionText: string) => void;
    inChat: boolean;
}

const initialSuggestions = [
    { text: "Professor feedback", icon: LectureIcon },
    { text: "Course feedback", icon: BookIcon },
    { text: "Suggest Course", icon: WandIcon },
    { text: "Weekly Commitment", icon: ClockIcon },
    { text: "Degree Info", icon: LectureIcon }
];

const pretypedPrefixes: { [key: string]: string } = {
    "Professor feedback": "Can I have professor feedback on ",
    "Course feedback": "Can I have the overall course feedback on ",
    "Suggest Course": "Tell me about a cool class if I am interested in ",
    "Weekly Commitment": "What is the weekly commitment of ",
    "Degree Info": "Tell me the degrees in the department of ",
};

const subSuggestionsMapping: { [key: string]: string[] } = {
    "Professor feedback": [
        "Professor Panagiotis Souganidis from Mathematics",
        "Professor Susan Stephan Palmie from Anthropology",
        "Professor Erik Shirokoff from Astronomy and Astrophysics"
    ],
    "Course feedback": ["MATH 20700 in the Mathematics Department", "SOSC 11500  in the Social Sciences Department", "ECON 20100  in the Economics Department"],
    "Suggest Course": ["Second World War", "Medieval Studies", "Machine Learning"],
    "Weekly Commitment": ["MATH 20700 in the Mathematics Department", "SOSC 11500 in the Social Sciences Department", "ECON 20100 in the Economics Department"],
    "Degree Info": ["Economics", "Mathematics", "Anthropology"]
};

const SuggestionButtons: React.FC<SuggestionButtonsProps> = ({ handleSuggestionSelected, handleCallToAction, inChat }) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);
    const [showMore, setShowMore] = useState(false);
    const [selectedMainSuggestion, setSelectedMainSuggestion] = useState<string | null>(null);

    const handleMainSuggestionClick = (suggestion: string) => {
        const prefix = pretypedPrefixes[suggestion];
        if (prefix) {
            handleSuggestionSelected({ type: 'set', text: prefix });
        }

        if (!inChat) {
            const subs = subSuggestionsMapping[suggestion] || [];
            setCurrentSuggestions(subs);
            setShowSuggestions(true);
            setSelectedMainSuggestion(suggestion);
        }
    };

    const handleSubSuggestionClick = (subSuggestion: string) => {
        const fullQuery = (pretypedPrefixes[selectedMainSuggestion!] || '') + subSuggestion;
        handleSuggestionSelected({ type: 'set', text: fullQuery });
        setShowSuggestions(false);
        setCurrentSuggestions([]);
        setSelectedMainSuggestion(null);
        handleCallToAction(fullQuery);
    };

    return (
        <div className="mt-2">
            {showSuggestions ? (
                <div className="flex flex-col gap-2 p-2 rounded">
                    {currentSuggestions.map((suggestion, index) => (
                        <Button
                            key={index}
                            onClick={(e) => { e.preventDefault(); handleSubSuggestionClick(suggestion); }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-100 bg-transparent border-0 h-auto justify-start whitespace-wrap overflow-hidden"
                            variant="ghost"
                        >
                            <div className="flex items-center justify-start w-full">
                                <span className="text-slate-700">{suggestion}</span>
                            </div>
                        </Button>
                    ))}
                    <Button
                        onClick={(e) => {
                            e.preventDefault();
                            setShowSuggestions(false);
                            setCurrentSuggestions([]);
                            setSelectedMainSuggestion(null);
                        }}
                        className="px-4 text-sm h-auto whitespace-wrap text-center justify-center rounded-xl w-fit bg-slate-100 hover:bg-slate-200 border-0 text-slate-500"
                        variant="ghost"
                    >
                        Back
                    </Button>
                </div>
            ) : (
                <div className="flex flex-wrap justify-center gap-2 p-2 rounded">
                    {initialSuggestions.slice(0, showMore ? initialSuggestions.length : 3).map(({ text, icon }, index) => (
                        <Button
                            key={index}
                            onClick={(e) => { e.preventDefault(); handleMainSuggestionClick(text); }}
                            className="px-4 text-sm h-auto whitespace-wrap text-center justify-center rounded-xl w-auto bg-slate-100 hover:bg-slate-200 border-0 text-slate-500 flex items-center gap-2 overflow-hidden"
                            variant="outline"
                        >
                            <Image src={icon} alt="" width={20} height={20} className="text-slate-500" />
                            {text}
                        </Button>
                    ))}
                    {initialSuggestions.length > 3 && (
                        <Button
                            onClick={(e) => { e.preventDefault(); setShowMore(!showMore); }}
                            className="px-4 text-sm h-auto whitespace-wrap text-center justify-center rounded-xl w-auto bg-slate-100 hover:bg-slate-200 border-0 text-slate-500"
                            variant="outline"
                        >
                            {showMore ? "Less" : "More"}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

export default SuggestionButtons;