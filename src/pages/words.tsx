import React, { useState, useEffect } from "react";
import data from "../data/snippets3.json";

interface Match {
  text: string;
  indices: [number, number];
}

interface TextMatch {
  fragment: string;
  matches: Match[];
}

interface Snippet {
  html_url: string;
  name: string;
  repository_owner: {
    avatar_url: string;
    html_url: string;
    login: string;
  };
  search_term: string;
  sha: string;
  text_matches: TextMatch[];
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function highlightMatches(fragment: string, matches: Match[]) {
  const sorted = [...matches].sort((a, b) => a.indices[0] - b.indices[0]);
  let pieces: (string | JSX.Element)[] = [];
  let current = 0;

  sorted.forEach((match, i) => {
    const [start, end] = match.indices;
    if (current < start) {
      pieces.push(fragment.slice(current, start));
    }
    pieces.push(
      <mark key={`${match.text}-${i}`} className="bg-yellow-200">
        {fragment.slice(start, end)}
      </mark>
    );
    current = end;
  });

  if (current < fragment.length) {
    pieces.push(fragment.slice(current));
  }
  return pieces;
}

function Words() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);

  useEffect(() => {
    setSnippets(shuffleArray(data as unknown as Snippet[]));
  }, []);

  return (
    <div className="no-scrollbar">
      <div className="bg-dark-blue flex min-h-screen items-center justify-center p-6 font-sans">
        <div className="max-w-prose text-white max-h-[100vh] overflow-y-auto pr-2 no-scrollbar">
          <div className="pb-6 text-left font-serif text-5xl italic">
            <h1>// what the fuck?</h1>
          </div>

          <div className="pb-6 text-left font-serif text-1xl">
            <h2 className="text-gray-400">
              /* peculiar and vulgar code on github */
            </h2>
          </div>

          <hr className="pb-6 text-gray-100" />

          {snippets.length === 0 && (
            <div className="flex items-center justify-center h-screen">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-teal-500"></div>
            </div>
          )}

          {snippets.map((snippet, idx) => (
            <div key={idx} className="mb-8 no-scrollbar">
              <h2 className="text-xl font-semibold mb-1">{snippet.name}</h2>
              <p className="text-sm text-gray-300 mb-2">
                <a
                  href={snippet.repository_owner.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-300 hover:underline ml-1 items-center"
                >
                  <img
                    src={snippet.repository_owner.avatar_url}
                    alt={`${snippet.repository_owner.login}'s avatar`}
                    className="w-4 h-4 rounded-full inline mr-1"
                  />
                  {snippet.repository_owner.login}
                </a>{" "}
                |{" "}
                <a
                  href={snippet.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-300 hover:underline"
                >
                  View File
                </a>
              </p>

              {snippet.text_matches.map((matchItem, mIdx) => (
                <pre
                  key={mIdx}
                  className="mb-4 bg-gray-700 rounded p-3 overflow-x-auto text-sm"
                >
                  {highlightMatches(matchItem.fragment, matchItem.matches)}
                </pre>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Words;
