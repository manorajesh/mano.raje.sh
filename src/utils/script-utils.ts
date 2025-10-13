import { Character, ScriptConfig } from "../types/script-learning";

// Get the display character from a character object
export const getCharacterDisplay = (
  character: Character,
  config: ScriptConfig
): string => {
  // Try main character property first
  if (character[config.characterProperty]) {
    return character[config.characterProperty];
  }

  // Try alternative properties
  if (config.alternativeProperties) {
    for (const prop of config.alternativeProperties) {
      if (character[prop]) {
        return character[prop];
      }
    }
  }

  // Fallback to any available character property
  const charProps = [
    "character",
    "devanagari",
    "arabic",
    "matra",
    "isolated",
    "initial",
    "medial",
    "final",
  ];
  for (const prop of charProps) {
    if (character[prop]) {
      return character[prop];
    }
  }

  return "?"; // Fallback
};

// Generate combinations for scripts that support it (like Devanagari matras)
export const generateCombinations = (
  baseCharacters: Character[],
  diacritics: Character[],
  config: ScriptConfig
): Character[] => {
  const combinations: Character[] = [];

  if (!config.specialFeatures?.generateCombinations) {
    return combinations;
  }

  baseCharacters.forEach((base) => {
    diacritics.forEach((diacritic) => {
      const baseDisplay = getCharacterDisplay(base, config);
      const diacriticDisplay = getCharacterDisplay(diacritic, config);

      // For Devanagari: remove inherent 'a' and add matra
      if (config.name === "devanagari") {
        const baseRomanization = base.romanization.replace(/a$/, "");
        combinations.push({
          [config.characterProperty]: baseDisplay + diacriticDisplay,
          romanization: baseRomanization + diacritic.romanization,
          type: "combination",
        });
      }
      // For other scripts, different combination logic can be added here
    });
  });

  return combinations;
};

// Filter characters by difficulty level
export const filterByDifficulty = (
  characters: Character[],
  difficulty: "beginner" | "intermediate" | "advanced"
): Character[] => {
  if (difficulty === "beginner") {
    return characters.filter((char) =>
      ["vowel", "consonant", "letter", "matra", "diacritic"].includes(char.type)
    );
  }
  return characters;
};

// Get progress storage key for a specific script
export const getProgressStorageKey = (scriptName: string): string => {
  return `script-learning-progress-${scriptName}`;
};
