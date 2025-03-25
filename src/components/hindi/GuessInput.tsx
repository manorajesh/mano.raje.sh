import React from "react";

interface GuessInputProps {
  onGuess: (guess: string) => void;
}

export function GuessInput({ onGuess }: GuessInputProps) {
  return (
    <input
      type="text"
      placeholder="Enter your guess..."
      className="w-full p-4 bg-white/50 border-2 border-white/50 rounded-2xl 
        text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-4 
        focus:ring-teal-200/30 text-xl backdrop-blur-sm transition-all duration-300
        hover:bg-white/60"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onGuess(e.currentTarget.value);
          e.currentTarget.value = "";
        }
      }}
    />
  );
}
