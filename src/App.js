import WorkflowBuildDemo from "./WorkflowBuildDemo";
import LandingPage from "./LandingPage";
import LandingPageWithDemo from "./LandingPageWithDemo";
import Why from "./Why";
import WhatSection from "./WhatSection";

const VIEW = "site"; // "site" = hero + why | "landingWithDemo" | "landing" | "demo"

function App() {
  if (VIEW === "demo") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 40 }}>
        <WorkflowBuildDemo />
      </div>
    );
  }
  if (VIEW === "landingWithDemo") {
    return <LandingPageWithDemo />;
  }
  if (VIEW === "site") {
    return (
      <div>
        <LandingPageWithDemo />
        <Why />
        <WhatSection />
      </div>
    );
  }
  return <LandingPage />;
}

export default App;
