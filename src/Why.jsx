import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const SERIF = "'Playfair Display', serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap');`;

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";

const PALE_TEAL = "#7FAEB8";

// per-card teal, stepping lighter -> darker down the stack
const TEALS = ["#8FBFC9", "#6FA3AF", "#527F8A"];

// every sheet matches the landing demo container's white; layers read via
// edge lines and contact shadows instead of tint
const PAPER = "#FFFFFF";
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
      <span style={{ display: "block", whiteSpace: "nowrap" }}>
        Copy. Paste. <em style={{ color, fontStyle: "italic" }}>Repeat.</em>
      </span>
    ),
    line: "The average employee copy-pastes data over 1,000 times a week — 52,000 times a year.",
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
    line: "The second-biggest time sink in operations: rebuilding reports that already exist.",
  },
  {
    id: "handoff",
    tag: "Leakage",
    title: (color) => (
      <span style={{ display: "block", whiteSpace: "nowrap" }}>
        Lost in the <em style={{ color, fontStyle: "italic" }}>handoff.</em>
      </span>
    ),
    line: "A third of operations leaders say their biggest slowdown is what gets lost in the handoff.",
  },
];

// each sheet gets its own scroll band to lift, straighten flat, and settle back
const BANDS = [
  [0.1, 0.34],
  [0.38, 0.62],
  [0.66, 0.9],
];

// compact pile: sheets share one horizontal axis, each lower sheet peeking out
// a few px directly below the one above. Top sheet floats a hair higher —
// the one about to peel up.
const REST_Y = [-24, 20, 64];

// how far the scene sits below the viewport's vertical center — gives the
// lifted card breathing room under the fixed nav
const SCENE_DROP = 70;

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
              fontWeight: 700,
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
              fontWeight: 600,
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
              fontSize: 15,
              color: INK,
              lineHeight: 1.65,
              margin: 0,
              maxWidth: 250,
            }}
          >
            {stat.line}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function QuoteBreak() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px 20px",
        background: "#FFFFFF",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, amount: 0.6 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        style={{ textAlign: "center" }}
      >
        <p
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 38,
            color: INK,
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          <span style={{ display: "block", whiteSpace: "nowrap" }}>
            &ldquo;There is nothing so useless as doing efficiently
          </span>
          <span style={{ display: "block", whiteSpace: "nowrap" }}>
            that which <span style={{ color: PALE_TEAL, fontStyle: "italic" }}>should not be done</span> at
            all.&rdquo;
          </span>
        </p>
        <p style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, marginTop: 24 }}>
          ~ <span style={{ fontStyle: "italic" }}>Peter Drucker</span>, Goodreads
        </p>
      </motion.div>
    </div>
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

      <QuoteBreak />

      <section ref={sectionRef} style={{ position: "relative", height: "340vh", background: "#FFFFFF" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
          {/* faint cutting-mat grid, fading out toward the edges */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: [
                "linear-gradient(rgba(27,27,24,0.055) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(27,27,24,0.055) 1px, transparent 1px)",
                "linear-gradient(rgba(27,27,24,0.03) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(27,27,24,0.03) 1px, transparent 1px)",
              ].join(", "),
              backgroundSize: "280px 280px, 280px 280px, 56px 56px, 56px 56px",
              WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 58%, black 30%, transparent 80%)",
              maskImage: "radial-gradient(ellipse 75% 65% at 50% 58%, black 30%, transparent 80%)",
              pointerEvents: "none",
            }}
          />

          {/* heading shares the stack's horizontal axis */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: `calc(50% + ${SCENE_DROP}px)`,
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 28,
            }}
          >
            <div
              style={{
                width: 140,
                height: 2,
                borderRadius: 2,
                background: `linear-gradient(90deg, rgba(127,174,184,0), ${PALE_TEAL})`,
              }}
            />
            <h2
              style={{
                fontFamily: SERIF,
                fontWeight: 500,
                fontSize: 88,
                color: INK,
                margin: 0,
                lineHeight: 1,
              }}
            >
              Why
            </h2>
          </div>

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
