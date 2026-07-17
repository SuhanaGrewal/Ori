import WorkflowBuildDemo from "./WorkflowBuildDemo";
import LandingPage from "./LandingPage";
import LandingPageWithDemo from "./LandingPageWithDemo";
import Why from "./Why";
import WhatSection from "./WhatSection";
import DraftingBackground from "./DraftingBackground";

const VIEW = "site"; // "site" = full page | "landingWithDemo" | "landing" | "demo"

const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const ACCENT = "#5C8A94";

const PAPER_WARM = "#FBF9F4";
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.14'/%3E%3C/svg%3E\")";

// hero, problem statement and Why share ONE continuous drafting-desk surface —
// same paper + grid + measurements throughout, no seam between them
function Site() {
  return (
    <>
      <div style={{ position: "relative", background: PAPER_WARM, backgroundImage: GRAIN }}>
        <DraftingBackground />
        <div style={{ position: "relative", zIndex: 1 }}>
          <LandingPageWithDemo />
          <Why />

          {/* bridge from the problem (Why) to the product (What) */}
          <div style={{ display: "flex", justifyContent: "center", padding: "76px 24px 8px" }}>
            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
              <p
                style={{
                  fontFamily: SERIF,
                  fontWeight: 400,
                  fontSize: 40,
                  color: INK,
                  lineHeight: 1.5,
                  textAlign: "left",
                  margin: 0,
                }}
              >
                The tools were never the problem.
                <br />
                Knowing <em style={{ fontStyle: "italic", color: ACCENT }}>what</em> to automate is.
              </p>

              {/* printed-caption rule, like FIG. 01 under the hero wordmark */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, paddingLeft: 2 }}>
                <div style={{ width: 64, height: 1, background: "rgba(27,27,24,0.22)" }} />
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_SOFT }}>
                  FIG. 03 — WHAT ORI DOES
                </span>
              </div>
            </div>
          </div>

          <WhatSection />
        </div>
      </div>
    </>
  );
}

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
    return <Site />;
  }
  return <LandingPage />;
}

export default App;
