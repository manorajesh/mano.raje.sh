// Generic types for script learning system

export interface Character {
  // Main character display (can be script-specific property name)
  character?: string;
  // Alternative character representations (for diacritics, matras, etc.)
  [key: string]: any;
  // Core properties
  romanization: string;
  type: string;
  meaning?: string;
}

export interface ScriptConfig {
  name: string;
  displayName: string;
  direction: "ltr" | "rtl";
  characterProperty: string; // The main property name for character display
  alternativeProperties?: string[]; // Alternative properties to check for character display
  categories: {
    [key: string]: {
      displayName: string;
      description: string;
    };
  };
  specialFeatures?: {
    hasDiacritics?: boolean;
    hasConjuncts?: boolean;
    hasMatras?: boolean;
    generateCombinations?: boolean;
  };
}

export interface ScriptData {
  [category: string]: Character[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  icon: string;
}

export interface GameState {
  currentCard: Character | null;
  score: number;
  streak: number;
  bestStreak: number;
  totalAnswered: number;
  correctAnswers: number;
  showAnswer: boolean;
  gameMode: "multiple-choice" | "typed-input" | "flashcard";
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  rapidFire: boolean;
  achievements: Achievement[];
  sessionStats: {
    [key: string]: number;
  };
  selectedScript: string;
}
