import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const SERIF = "'Playfair Display', serif";

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";

const INACTIVE_FILL = "#FAFAF9";
const INACTIVE_LINE = "#D8D6CE";

const PALETTE = {
  mint: { primary: "#45A98A", soft: "#DFF5EC" },
  yellow: { primary: "#D9A441", soft: "#FBF1D9" },
  pink: { primary: "#D97BA0", soft: "#FBE5EE" },
};

// Timeline of the section's scroll progress (0 -> 1). Quote 1 is visible
// immediately on entry (no fade-in); each paper then gets its own band to
// lift, expand into a readable card, and settle back tinted.
const T = {
  quote1Out: [0.08, 0.14],
  paper1: [0.14, 0.34],
  paper2: [0.34, 0.54],
  paper3: [0.54, 0.74],
  quote2In: [0.82, 0.92],
};

function bandPoints([s, e]) {
  const span = e - s;
  return [s, s + 0.35 * span, s + 0.65 * span, e];
}

function Quote({
  scrollYProgress,
  immediate,
  inRange = [0, 0.001],
  outRange = [0.995, 1],
  children,
  attribution,
}) {
  // Both variants are computed unconditionally (rules of hooks), then
  // selected below — `immediate` never changes across a given instance's
  // lifetime, so this stays consistent per component.
  const opacityFadeIn = useTransform(
    scrollYProgress,
    [inRange[0], inRange[1], outRange[0], outRange[1]],
    [0, 1, 1, 0]
  );
  const opacityImmediate = useTransform(scrollYProgress, [outRange[0], outRange[1]], [1, 0]);
  const opacity = immediate ? opacityImmediate : opacityFadeIn;

  const yFadeIn = useTransform(scrollYProgress, [inRange[0], inRange[1]], [30, 0]);
  const y = immediate ? 0 : yFadeIn;

  return (
    <motion.div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        y,
        pointerEvents: "none",
      }}
    >
      <div style={{ maxWidth: 680, textAlign: "center", padding: "0 24px" }}>
        <p
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontStyle: "italic",
            fontSize: 34,
            color: INK,
            lineHeight: 1.35,
            margin: 0,
          }}
        >
          &ldquo;{children}&rdquo;
        </p>
        <p style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, marginTop: 20 }}>
          {attribution}
        </p>
      </div>
    </motion.div>
  );
}

const PLATE_SIZE = 190;
const PLATE_TILT = "rotateX(58deg) rotateZ(45deg)";

function StackPaper({ scrollYProgress, band, index, restX, restRotate, color, title, big, line, source }) {
  const bp = bandPoints(band);
  const baseZ = 5 + index;

  // The paper's own motion: rests in the fanned stack, lifts up + dims
  // partway through its band, then settles back down.
  const y = useTransform(scrollYProgress, bp, [0, -110, -110, 0]);
  const scale = useTransform(scrollYProgress, bp, [1, 1.08, 1.08, 1]);
  const paperOpacity = useTransform(scrollYProgress, bp, [1, 0.55, 1, 1]);
  const zIndex = useTransform(scrollYProgress, bp, [baseZ, 20, 20, baseZ]);

  // Color tints from the inactive grey/white outline to this paper's pastel
  // fill across its whole band, then holds — marking it as "seen".
  const fill = useTransform(scrollYProgress, band, [INACTIVE_FILL, color.soft]);
  const stroke = useTransform(scrollYProgress, band, [INACTIVE_LINE, color.primary]);
  const edgeFill = useTransform(scrollYProgress, band, [INACTIVE_LINE, color.primary]);

  // The readable content card expands above the paper mid-band and
  // collapses again as the paper settles back into the stack.
  const cardOpacity = useTransform(scrollYProgress, bp, [0, 1, 1, 0]);
  const cardY = useTransform(scrollYProgress, bp, [24, 0, 0, 24]);
  const cardScale = useTransform(scrollYProgress, bp, [0.92, 1, 1, 0.92]);

  return (
    <>
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: PLATE_SIZE,
          height: PLATE_SIZE,
          x: restX,
          y,
          rotate: restRotate,
          scale,
          opacity: paperOpacity,
          zIndex,
        }}
      >
        {/* base/edge layer — duplicate of the top face, offset down to read as thickness */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 14,
            transform: `${PLATE_TILT} translateY(10px)`,
            background: edgeFill,
          }}
        />
        {/* top face */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 14,
            transform: PLATE_TILT,
            background: fill,
            border: "2px solid",
            borderColor: stroke,
            boxShadow: "0 10px 24px rgba(27, 27, 24, 0.10)",
          }}
        />
      </motion.div>

      {/* readable content card — flat, not tilted, expands directly above this paper */}
      <motion.div
        style={{
          position: "absolute",
          top: -190,
          left: 0,
          width: 280,
          x: restX - (280 - PLATE_SIZE) / 2,
          opacity: cardOpacity,
          y: cardY,
          scale: cardScale,
          zIndex: 30,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "#FFFFFF",
            border: `1px solid ${color.primary}33`,
            borderRadius: 16,
            padding: "26px 28px",
            textAlign: "center",
            boxShadow: "0 20px 44px rgba(27, 27, 24, 0.16)",
          }}
        >
          <p
            style={{
              fontFamily: SERIF,
              fontWeight: 600,
              fontSize: 14,
              color: color.primary,
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontFamily: SERIF,
              fontWeight: 500,
              fontSize: 40,
              color: INK,
              margin: "10px 0 0",
              lineHeight: 1.05,
            }}
          >
            {big}
          </p>
          <p
            style={{
              fontFamily: BODY,
              fontSize: 13.5,
              color: INK_SOFT,
              lineHeight: 1.5,
              margin: "12px 0 0",
            }}
          >
            {line}
          </p>
          <p
            style={{
              fontFamily: BODY,
              fontStyle: "italic",
              fontSize: 11,
              color: INK_SOFT,
              opacity: 0.7,
              margin: "12px 0 0",
            }}
          >
            {source}
          </p>
        </div>
      </motion.div>
    </>
  );
}

export default function WhySection() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  return (
    <section ref={sectionRef} style={{ position: "relative", height: "300vh" }}>
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
        <Quote
          scrollYProgress={scrollYProgress}
          immediate
          outRange={T.quote1Out}
          attribution="— Eliyahu Goldratt, creator of the Theory of Constraints"
        >
          Automation is good, so long as you know exactly where to put the machine.
        </Quote>

        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: PLATE_SIZE, height: PLATE_SIZE }}>
            <StackPaper
              scrollYProgress={scrollYProgress}
              band={T.paper1}
              index={0}
              restX={-46}
              restRotate={-6}
              color={PALETTE.mint}
              title="The Inaction Tax"
              big="50% → 4%"
              line="50% of work activities can be automated. Only 4% are."
              source="McKinsey"
            />
            <StackPaper
              scrollYProgress={scrollYProgress}
              band={T.paper2}
              index={1}
              restX={0}
              restRotate={0}
              color={PALETTE.yellow}
              title="The Blind Spot Tax"
              big="40%"
              line="of automation projects get scrapped by 2027 — most because no one understood the workflow first."
              source="Gartner"
            />
            <StackPaper
              scrollYProgress={scrollYProgress}
              band={T.paper3}
              index={2}
              restX={46}
              restRotate={6}
              color={PALETTE.pink}
              title="The Manual Tax"
              big="52,000+"
              line="copy-paste actions. Per employee. Every year."
              source="ProcessMaker"
            />
          </div>
        </div>

        <Quote scrollYProgress={scrollYProgress} inRange={T.quote2In} attribution="— Bill Gates">
          Automation applied to an inefficient operation will magnify the inefficiency.
        </Quote>
      </div>
    </section>
  );
}
