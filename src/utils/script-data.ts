import { ScriptData } from "../types/script-learning";

// Import script data files
import devanagariData from "../data/devanagari-script.json";
import arabicData from "../data/arabic-script.json";

const SCRIPT_DATA_MAP: { [key: string]: ScriptData } = {
  devanagari: devanagariData as ScriptData,
  arabic: arabicData as ScriptData,
};

export const getScriptData = (scriptName: string): ScriptData => {
  return SCRIPT_DATA_MAP[scriptName] || SCRIPT_DATA_MAP.devanagari;
};

export const getAvailableScriptData = (): { [key: string]: ScriptData } => {
  return SCRIPT_DATA_MAP;
};
