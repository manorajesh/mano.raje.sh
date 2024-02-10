import React from "react";

interface Props {
  errorNumber: number;
}

export function ErrorPage({ errorNumber }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black">
      <div className="relative">
        <img
          src="oppie.jpg"
          decoding="async"
          loading="lazy"
          alt="Oppenheimer"
          className="w-1/2 justify-center items-center flex mx-auto"
        />
        <h1
          className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center text-white opacity-40"
          style={{
            fontSize: "30vh",
          }}
        >
          {errorNumber}
        </h1>
      </div>
      <h1 className="text-4xl font-bold p-6 bg-[conic-gradient(at_top,_var(--tw-gradient-stops))] from-pink-100 from-10% to-sky-400 text-transparent bg-clip-text opacity-75 font-serif italic">
        Now I am become Error, the destroyer of pages.
      </h1>
    </div>
  );
}
