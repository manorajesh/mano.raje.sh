import React from "react";

const letterPairs = [
  ["क", "ka"],
  ["ख", "kha"],
  ["ग", "ga"],
  ["घ", "gha"],
  ["ङ", "nga"],
  ["च", "cha"],
  ["छ", "chha"],
  ["ज", "ja"],
  ["झ", "jha"],
  ["ञ", "nya"],
  ["ट", "ta"],
  ["ठ", "tha"],
  ["ड", "da"],
  ["ढ", "dha"],
  ["ण", "na"],
  ["त", "ta"],
  ["थ", "tha"],
  ["द", "da"],
  ["ध", "dha"],
  ["न", "na"],
  ["प", "pa"],
  ["फ", "pha"],
  ["ब", "ba"],
  ["भ", "bha"],
  ["म", "ma"],
  ["य", "ya"],
  ["र", "ra"],
  ["ल", "la"],
  ["व", "va"],
  ["श", "sha"],
  ["ष", "sa"],
  ["स", "sa"],
  ["ह", "ha"],
  ["ऋ", "ri"],
  ["अ", "a"],
  ["आ", "aa"],
  ["इ", "i"],
  ["ई", "ii"],
  ["उ", "u"],
  ["ऊ", "uu"],
  ["ऋ", "ri"],
  ["ए", "e"],
  ["ऐ", "ai"],
  ["ओ", "o"],
  ["औ", "au"],
  ["अं", "am"],
  ["अः", "ah"],
];

function Hindi() {
  const [currentLetterIdx, setCurrentLetterIdx] = React.useState(0);
  const [showHint, setShowHint] = React.useState(false);
  const [mode, setMode] = React.useState("hindiToEnglish"); // "hindiToEnglish" or "englishToHindi"

  function randomLetter() {
    const randomIndex = Math.floor(Math.random() * letterPairs.length);
    setCurrentLetterIdx(randomIndex);
  }

  function onGuess(guess: string) {
    const correctAnswer =
      mode === "hindiToEnglish"
        ? letterPairs[currentLetterIdx][1]
        : letterPairs[currentLetterIdx][0];
    if (guess.trim().toLowerCase() === correctAnswer.toLowerCase()) {
      randomLetter();
      setShowHint(false);
      return true;
    }
    return false;
  }

  const displayedLetter =
    mode === "hindiToEnglish"
      ? letterPairs[currentLetterIdx][0]
      : letterPairs[currentLetterIdx][1];

  const hintAnswer =
    mode === "hindiToEnglish"
      ? letterPairs[currentLetterIdx][1]
      : letterPairs[currentLetterIdx][0];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-800 to-indigo-900 p-6 font-sans">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            {mode === "hindiToEnglish"
              ? "Hindi to English"
              : "English to Hindi"}
          </h2>
          <button
            onClick={() => {
              setMode(
                mode === "hindiToEnglish" ? "englishToHindi" : "hindiToEnglish"
              );
              setShowHint(false);
              randomLetter();
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Switch Mode
          </button>
        </div>
        <div className="mb-6">
          <h1
            onClick={() => setShowHint(!showHint)}
            className="text-9xl cursor-pointer transition-transform transform hover:scale-105"
          >
            {displayedLetter}
          </h1>
          {showHint && (
            <p className="mt-2 text-xl text-gray-500">{hintAnswer}</p>
          )}
        </div>
        <input
          type="text"
          placeholder="Enter your guess"
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          onChange={(e) => {
            if (onGuess(e.target.value)) {
              e.target.value = "";
            }
          }}
        />
      </div>
    </div>
  );
}

export default Hindi;

// const letterPairs = [
//   ["क", "ka"],
//   ["ख", "kha"],
//   ["ग", "ga"],
//   ["घ", "gha"],
//   ["ङ", "nga"],
//   ["च", "cha"],
//   ["छ", "chha"],
//   ["ज", "ja"],
//   ["झ", "jha"],
//   ["ञ", "nya"],
//   ["ट", "ta"],
//   ["ठ", "tha"],
//   ["ड", "da"],
//   ["ढ", "dha"],
//   ["ण", "na"],
//   ["त", "ta"],
//   ["थ", "tha"],
//   ["द", "da"],
//   ["ध", "dha"],
//   ["न", "na"],
//   ["प", "pa"],
//   ["फ", "pha"],
//   ["ब", "ba"],
//   ["भ", "bha"],
//   ["म", "ma"],
//   ["य", "ya"],
//   ["र", "ra"],
//   ["ल", "la"],
//   ["व", "va"],
//   ["श", "sha"],
//   ["ष", "sa"],
//   ["स", "sa"],
//   ["ह", "ha"],
//   ["ऋ", "ri"],
// ];

// const vowels = [
//   ["अ", "a"],
//   ["आ", "aa"],
//   ["इ", "i"],
//   ["ई", "ii"],
//   ["उ", "u"],
//   ["ऊ", "uu"],
//   ["ऋ", "ri"],
//   ["ए", "e"],
//   ["ऐ", "ai"],
//   ["ओ", "o"],
//   ["औ", "au"],
//   ["अं", "am"],
//   ["अः", "ah"],
// ];

// const matras = [
//   ["ा", "aa"],
//   ["ि", "i"],
//   ["ी", "ii"],
//   ["ु", "u"],
//   ["ू", "uu"],
//   ["ृ", "ri"],
//   ["े", "e"],
//   ["ै", "ai"],
//   ["ो", "o"],
//   ["ौ", "au"],
//   ["ं", "am"],
//   ["ः", "ah"],
// ];
