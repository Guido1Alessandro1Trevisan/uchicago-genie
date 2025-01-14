
"use client";

import TypeIt from "typeit-react";

export function TypewriterText({
  phrases,
  options = {},
  onComplete,
}: {
  phrases: string[];
  options?: any;
  onComplete?: () => void;
}) {
  console.log(phrases);

  return (
    <TypeIt
      options={{
        ...options,
        speed: 20,
        deleteSpeed: 40,
        afterComplete: onComplete,
      }}
      getBeforeInit={(instance) => {
        phrases.forEach((phrase, index) => {
          const baseText = "Ask me about";
          const extraText = phrase.replace(baseText, "").trim();

          instance.type(phrase);
          if (index < phrases.length - 1) {
            instance
              .pause(2000)
              .delete(extraText.length);
          }
        });
        return instance;
      }}
    />
  );
}
