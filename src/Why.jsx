import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";
import ProblemStatement from "./ProblemStatement";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";
const FONT_IMPORT = `@import url('https://fonts.cdnfonts.com/css/cmu-serif'); @import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;1,400&display=swap');`;

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";

const PALE_TEAL = "#7FAEB8";

// per-card teal, stepping lighter -> darker down the stack
const TEALS = ["#8FBFC9", "#6FA3AF", "#527F8A"];

// every sheet matches the landing demo container's warm paper; layers read
// via edge lines and contact shadows instead of tint
const PAPER = "#FBF9F4";
const EDGE_TONES = ["rgba(27,27,24,0.08)", "rgba(27,27,24,0.14)", "rgba(27,27,24,0.20)"];

// fine matte grain — tiled SVG noise, transparent between speckles
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.16'/%3E%3C/svg%3E\")";

const CARD = 340;

// same shadow recipe as the landing demo container (tight edge + soft lift);
// under-sheets get a reduced version, all sharing the 2-part structure so
// framer-motion can interpolate rest <-> lifted
const SHADOW_TOP_REST = "0 3px 6px -2px rgba(27,27,24,0.10), 0 32px 64px -28px rgba(27,27,24,0.22)";
const SHADOW_UNDER_REST = "0 2px 4px -2px rgba(27,27,24,0.14), 0 8px 16px -10px rgba(27,27,24,0.20)";
const SHADOW_LIFT = "0 22px 32px -8px rgba(27,27,24,0.10), 0 54px 88px -30px rgba(27,27,24,0.30)";

// titles are pre-broken into block/nowrap spans — deterministic lines, no rewrapping
const STATS = [
  {
    id: "copy-paste",
    tag: "Tedium",
    title: (color) => (
      <>
        <span style={{ display: "block", whiteSpace: "nowrap" }}>Twice the Work,</span>
        <span style={{ display: "block", whiteSpace: "nowrap" }}>
          <em style={{ color, fontStyle: "italic" }}>Once Done.</em>
        </span>
      </>
    ),
    line: "The average employee copy-pastes data more than 1,000 times a week — the same information, moved by hand, over and over.",
    source: "~ ProcessMaker, 2024",
  },
  {
    id: "rebuilt",
    tag: "Rework",
    title: (color) => (
      <>
        <span style={{ display: "block", whiteSpace: "nowrap" }}>Rebuilt from scratch.</span>
        <span style={{ display: "block", whiteSpace: "nowrap" }}>
          <em style={{ color, fontStyle: "italic" }}>Every week.</em>
        </span>
      </>
    ),
    line: "The average knowledge worker spends 209 hours a year redoing work that was already done once.",
    source: "~ Asana, Anatomy of Work Index, 2023",
  },
  {
    id: "handoff",
    tag: "Leakage",
    title: (color) => (
      <span style={{ display: "block", whiteSpace: "nowrap" }}>
        Lost in the <em style={{ color, fontStyle: "italic" }}>handoff.</em>
      </span>
    ),
    line: "Employees lose nearly a fifth of their week searching for information or waiting on someone else before they can move forward.",
    source: "~ McKinsey Global Institute, 2012",
  },
];

// each sheet gets its own scroll band to lift, straighten flat, and settle
// back. The first band opens almost immediately so the top card begins
// lifting the moment the scene pins — no dead scroll.
const BANDS = [
  [0.02, 0.3],
  [0.35, 0.63],
  [0.68, 0.96],
];

// compact pile: sheets share one horizontal axis, each lower sheet peeking out
// a few px directly below the one above. Top sheet floats a hair higher —
// the one about to peel up.
const REST_Y = [-24, 20, 64];

// the scene sits low in the viewport so the pinned quote stays clear at the
// top and the cards lift up into the open middle beneath it
const SCENE_DROP = 150;

function PaperSheet({ scrollYProgress, band, index, stat }) {
  const [s, e] = band;
  const span = e - s;
  const bp = [s, s + 0.32 * span, s + 0.68 * span, e];

  const restY = REST_Y[index];
  const baseZ = 3 - index; // top sheet of the pile paints over the ones beneath
  const shadowRest = index === 0 ? SHADOW_TOP_REST : SHADOW_UNDER_REST;
  const teal = TEALS[index];

  const rotateX = useTransform(scrollYProgress, bp, [58, 0, 0, 58]);
  const rotateZ = useTransform(scrollYProgress, bp, [45, 0, 0, 45]);
  const y = useTransform(scrollYProgress, bp, [restY, -185, -185, restY]);
  const scale = useTransform(scrollYProgress, bp, [1, 1.06, 1.06, 1]);
  // stays behind the sheets above while rising, only coming forward once
  // it has cleared the pile — so lower sheets emerge from behind the stack
  const zIndex = useTransform(
    scrollYProgress,
    [s, s + 0.16 * span, s + 0.26 * span, e - 0.26 * span, e - 0.16 * span, e],
    [baseZ, baseZ, 30, 30, baseZ, baseZ]
  );
  const boxShadow = useTransform(scrollYProgress, bp, [shadowRest, SHADOW_LIFT, SHADOW_LIFT, shadowRest]);

  // the stat only becomes readable once the sheet is nearly flat
  const contentOpacity = useTransform(
    scrollYProgress,
    [s + 0.26 * span, s + 0.36 * span, s + 0.64 * span, s + 0.74 * span],
    [0, 1, 1, 0]
  );

  return (
    <motion.div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: CARD,
        height: CARD,
        y,
        rotateX,
        rotateZ,
        scale,
        zIndex,
        boxShadow,
        background: PAPER,
        border: `1px solid ${EDGE_TONES[index]}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: GRAIN,
          pointerEvents: "none",
        }}
      />

      <motion.div
        style={{
          opacity: contentOpacity,
          position: "absolute",
          inset: 0,
        }}
      >
        {/* sheet index + filing tag, stamped in the corner */}
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 22,
            display: "flex",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <p
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.02em",
              color: INK_SOFT,
              opacity: 0.5,
              margin: 0,
            }}
          >
            0{index + 1}
          </p>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 400,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: INK_SOFT,
              opacity: 0.55,
              margin: 0,
            }}
          >
            {stat.tag}
          </p>
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 36px",
          }}
        >
          <p
            style={{
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: 28,
              letterSpacing: "-0.01em",
              color: INK,
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {stat.title(teal)}
          </p>

          <div style={{ width: 30, height: 2, background: teal, opacity: 0.55, margin: "20px 0" }} />

          <p
            style={{
              fontFamily: BODY,
              fontSize: 14,
              color: INK,
              lineHeight: 1.6,
              margin: 0,
              maxWidth: 262,
            }}
          >
            {stat.line}
          </p>

          <p
            style={{
              fontFamily: BODY,
              fontStyle: "italic",
              fontSize: 11,
              color: INK_SOFT,
              margin: "16px 0 0",
              maxWidth: 262,
            }}
          >
            {stat.source}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChevronButton({ children, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        padding: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

export default function Why() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // chevrons step between the cards' reveal points (band centers)
  const jumpTo = (dir) => {
    const el = sectionRef.current;
    if (!el) return;
    const vh = window.innerHeight;
    const range = el.offsetHeight - vh;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const current = (window.scrollY - top) / range;
    const centers = BANDS.map(([a, b]) => (a + b) / 2);

    let target;
    if (dir > 0) {
      target = centers.find((c) => c > current + 0.03);
      window.scrollTo({ top: target !== undefined ? top + target * range : top + range + vh * 0.4, behavior: "smooth" });
    } else {
      target = [...centers].reverse().find((c) => c < current - 0.03);
      window.scrollTo({ top: target !== undefined ? top + target * range : top - vh * 0.6, behavior: "smooth" });
    }
  };

  return (
    <>
      <style>{FONT_IMPORT}</style>

      <section ref={sectionRef} style={{ position: "relative", height: "240vh", background: "transparent" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
          {/* the problem quote lives at the top of the pinned scene — visible
              the whole time the cards lift, then fades once the last card has
              had its reveal */}
          <motion.div
            style={{
              position: "absolute",
              top: 108,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              zIndex: 2,
              pointerEvents: "none",
              opacity: useTransform(scrollYProgress, [0.85, 0.95], [1, 0]),
            }}
          >
            <ProblemStatement />
          </motion.div>

          {/* the paper stack */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "relative",
                width: CARD,
                height: CARD,
                perspective: 1500,
                transform: `translateY(${SCENE_DROP}px)`,
              }}
            >
              {STATS.map((stat, i) => (
                <PaperSheet
                  key={stat.id}
                  scrollYProgress={scrollYProgress}
                  band={BANDS[i]}
                  index={i}
                  stat={stat}
                />
              ))}

              {/* card stepper, tucked in beside the pile */}
              <div
                style={{
                  position: "absolute",
                  left: CARD + 128,
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  color: INK_SOFT,
                  opacity: 0.55,
                  zIndex: 40,
                }}
              >
                <ChevronButton onClick={() => jumpTo(-1)}>
                  <ChevronUp size={16} strokeWidth={1.5} />
                </ChevronButton>
                <ChevronButton onClick={() => jumpTo(1)}>
                  <ChevronDown size={16} strokeWidth={1.5} />
                </ChevronButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
