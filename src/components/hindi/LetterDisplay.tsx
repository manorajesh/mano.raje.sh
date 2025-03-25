import React from "react";

interface LetterDisplayProps {
  letter: string;
  hint?: string;
  showHint: boolean;
  isWrongGuess: boolean;
  onLetterClick: () => void;
}

export function LetterDisplay({
  letter,
  hint,
  showHint,
  isWrongGuess,
  onLetterClick,
}: LetterDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center mb-6 pt-4 pb-6">
      <h1
        onClick={onLetterClick}
        className={`text-[10rem] cursor-pointer transition-all duration-500 
          hover:scale-110 animate-[float_6s_ease-in-out_infinite]
          ${isWrongGuess ? "text-rose-500" : "text-slate-700"}`}
      >
        {letter}
      </h1>
      {showHint && hint && (
        <p className="mt-6 text-3xl text-slate-600/80 font-light animate-[fadeIn_0.5s_ease-out]">
          {hint}
        </p>
      )}
    </div>
  );
}
