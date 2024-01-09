import React from "react";
import BallPool from "./BallPool";

function App() {
  return (
    <div>
      <BallPool />
      <div className="flex justify-center items-center min-h-screen font-sans bg-dark-blue p-6">
        <div className="text-white max-w-prose">
          <div className="text-left text-5xl pb-6">
            <h1>hello</h1>
          </div>

          <div>
            <p className="text-base">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris
              vitae mattis risus. Suspendisse eu scelerisque nunc, faucibus
              auctor ante. Morbi hendrerit auctor fermentum. Curabitur porta
              ultrices malesuada. In fringilla elementum pellentesque. Nunc
              viverra at ex non dapibus. In eget ex at leo ultrices tempus.
              Fusce id urna et turpis vehicula condimentum eget a ligula. Nam
              porta condimentum leo at faucibus. In commodo nisi ut aliquet
              placerat. Mauris consectetur viverra sapien eget iaculis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
