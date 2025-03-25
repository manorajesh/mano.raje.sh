import React from "react";
import { Mode } from "../../types/hindi";

interface HeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

export function Header({ mode, onModeChange }: HeaderProps) {
  return (
    <div className="flex justify-between items-center mb-12">
      <h2 className="text-3xl font-bold text-slate-700">
        {mode === "hindiToEnglish" ? "Hindi to English" : "English to Hindi"}
      </h2>
      <button
        onClick={() =>
          onModeChange(
            mode === "hindiToEnglish" ? "englishToHindi" : "hindiToEnglish"
          )
        }
        className="px-6 py-3 bg-white/40 text-slate-700 rounded-2xl hover:bg-white/60 
          transition-all duration-300 backdrop-blur-sm font-medium shadow-lg hover:shadow-xl
          hover:scale-105 active:scale-95"
      >
        {mode === "hindiToEnglish" ? "A" : "क"}
      </button>
    </div>
  );
}
