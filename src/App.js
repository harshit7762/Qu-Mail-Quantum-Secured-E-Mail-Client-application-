import React, { useState } from "react";
import SplashAnimation from "./SplashAnimation";
import QuMailApp from "./QuMailApp";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return showSplash ? (
    <SplashAnimation 
      durationMs={2600}
      onFinish={() => setShowSplash(false)}
    />
  ) : (
    <QuMailApp />
  );
}
