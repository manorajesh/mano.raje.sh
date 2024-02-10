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
          className="justify-center items-center flex mx-auto"
          style={{
            width: "clamp(300px, 100rem, 100vw)",
          }}
        />
        <h1
          className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center text-white opacity-20 font-serif"
          style={{
            fontSize: "30vw",
          }}
        >
          {errorNumber}
        </h1>
      </div>
      <h1
        className="font-bold p-6 bg-custom-gradient text-transparent bg-clip-text"
        style={{
          fontSize: "clamp(1vw, 2rem, 75%)",
        }}
      >
        Now I am become Error, the destroyer of pages.
      </h1>
      <a
        href="/"
        style={{
          textDecoration: "none",
          fontFamily: "serif",
          fontStyle: "italic",
          color: "gray",
        }}
      >
        &laquo; back to safety
      </a>
    </div>
  );
}
