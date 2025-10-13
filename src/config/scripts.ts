import { ScriptConfig } from "../types/script-learning";

export const SCRIPT_CONFIGS: { [key: string]: ScriptConfig } = {
  devanagari: {
    name: "devanagari",
    displayName: "Devanagari (देवनागरी)",
    direction: "ltr",
    characterProperty: "devanagari",
    alternativeProperties: ["matra"],
    categories: {
      vowels: {
        displayName: "Vowels (स्वर)",
        description: "Independent vowel characters",
      },
      consonants: {
        displayName: "Consonants (व्यंजन)",
        description: "Consonant characters",
      },
      matras: {
        displayName: "Matras (मात्राएं)",
        description: "Vowel diacritics",
      },
      conjuncts: {
        displayName: "Conjuncts (संयुक्त)",
        description: "Combined consonant characters",
      },
      words: {
        displayName: "Words (शब्द)",
        description: "Common words",
      },
      phrases: {
        displayName: "Phrases (वाक्य)",
        description: "Common phrases",
      },
      all: {
        displayName: "All Mixed",
        description: "All categories combined",
      },
    },
    specialFeatures: {
      hasDiacritics: true,
      hasConjuncts: true,
      hasMatras: true,
      generateCombinations: true,
    },
  },
  arabic: {
    name: "arabic",
    displayName: "Arabic (العربية)",
    direction: "rtl",
    characterProperty: "arabic",
    alternativeProperties: ["isolated", "initial", "medial", "final"],
    categories: {
      letters: {
        displayName: "Letters (حروف)",
        description: "Arabic alphabet letters",
      },
      diacritics: {
        displayName: "Diacritics (تشكيل)",
        description: "Vowel marks and other diacritics",
      },
      words: {
        displayName: "Words (كلمات)",
        description: "Common words",
      },
      phrases: {
        displayName: "Phrases (عبارات)",
        description: "Common phrases",
      },
      all: {
        displayName: "All Mixed",
        description: "All categories combined",
      },
    },
    specialFeatures: {
      hasDiacritics: true,
      hasConjuncts: false,
      hasMatras: false,
      generateCombinations: false,
    },
  },
};

export const getScriptConfig = (scriptName: string): ScriptConfig => {
  return SCRIPT_CONFIGS[scriptName] || SCRIPT_CONFIGS.devanagari;
};

export const getAvailableScripts = (): string[] => {
  return Object.keys(SCRIPT_CONFIGS);
};
