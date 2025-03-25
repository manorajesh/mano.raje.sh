export interface Guess {
  letterPair: string[];
  numWrongGuesses: number;
  instantWhenStarted: Date;
}

export interface LetterPair {
  hindi: string;
  english: string;
}

export type Mode = "hindiToEnglish" | "englishToHindi";
