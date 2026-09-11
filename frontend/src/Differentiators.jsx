import React, { useEffect, useState } from "react";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";
const FONT_IMPORT = `@import url('https://fonts.cdnfonts.com/css/cmu-serif'); @import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;1,400&display=swap');`;

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const ACCENT = "#5C8A94";

const PAPER = "#FBF9F4";
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.16'/%3E%3C/svg%3E\")";

const CARD_SHADOW = "0 3px 6px -2px rgba(27,27,24,0.08), 0 22px 44px -22px rgba(27,27,24,0.22)";

/* ---------------------------------------------------------------------------
   Four small, always-playing diagrams — one per card, each purpose-built for
   its own claim rather than a generic node graph. Native SVG animate /
   animateMotion throughout, the same technique already proven reliable in
   the What section's diagrams.
--------------------------------------------------------------------------- */

const DIAGRAM_H = 168;
const DIAGRAM_W = 220;

// every diagram fills from the same teal gradient — no white, no labels,
// just enough shape to carry the idea
const TEAL_LIGHT = "#8FBFC9";
const TEAL_DEEP = "#3F6670";

// gradientUnits must be userSpaceOnUse, not the objectBoundingBox default:
// a perfectly horizontal or vertical <line> has a zero-height (or zero-width)
// bounding box, and an objectBoundingBox gradient on one resolves to nothing
// at all — the stroke simply doesn't paint. Mapping the gradient to the
// viewBox instead makes it work on every shape, and has the nicer side effect
// of running one continuous ramp across the whole diagram.
function TealDefs({ id }) {
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={DIAGRAM_W} y2={DIAGRAM_H}>
        <stop offset="0%" stopColor={TEAL_LIGHT} />
        <stop offset="100%" stopColor={TEAL_DEEP} />
      </linearGradient>
    </defs>
  );
}

// 01 — a full page of company data being encrypted: every row is a real
// field, its value replaced by churning ciphertext, with the lock sitting
// on top of the whole thing rather than off to one side.
function NonInvasiveDiagram() {
  const CIPHER_CHARS = "ABCDEF0123456789#$%&*/<>+=?!~^abcdef";
  const PLAIN = [
    "user.email",
    "invoice_id",
    "amount",
    "vendor.name",
    "due_date",
    "approver",
    "po_number",
    "tax_rate",
    "account_id",
  ];
  const rows = [20, 36, 52, 68, 84, 100, 116, 132, 148];

  const lockX = DIAGRAM_W / 2;
  const bodyW = 46;
  const bodyH = 36;
  const bodyTop = 80;

  // the ciphertext re-scrambles on a timer — that churn is the whole point
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 220);
    return () => clearInterval(id);
  }, []);

  const cipher = rows.map(() =>
    Array.from({ length: 26 }, () => CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)]).join("")
  );

  return (
    <svg width={DIAGRAM_W} height={DIAGRAM_H} viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}>
      <TealDefs id="g1" />

      {/* the field names — plainly readable */}
      {PLAIN.map((s, r) => (
        <text key={`p${r}`} x={8} y={rows[r]} fontFamily={MONO} fontSize={8} fill="url(#g1)" opacity={0.4}>
          {s}
        </text>
      ))}

      {/* their values — letters, digits and symbols, constantly re-scrambling */}
      {cipher.map((s, r) => (
        <text key={`c${r}`} x={78} y={rows[r]} fontFamily={MONO} fontSize={8} fill="url(#g1)" opacity={0.85}>
          {s}
        </text>
      ))}

      {/* the lock, sitting over the whole page */}
      <path
        d={`M${lockX - 13} ${bodyTop} v-17 a13,13 0 0 1 26,0 v17`}
        fill="none"
        stroke="url(#g1)"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <rect x={lockX - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} rx={6} fill="url(#g1)" />
      <circle cx={lockX} cy={bodyTop + 14} r={4} fill={PAPER} />
      <path
        d={`M${lockX - 2} ${bodyTop + 17} L${lockX + 2} ${bodyTop + 17} L${lockX + 1.1} ${bodyTop + 26} L${lockX - 1.1} ${bodyTop + 26} Z`}
        fill={PAPER}
      />
    </svg>
  );
}

// 02 — four real puzzle pieces, tabs and blanks and all, drifting in from
// their own corners and interlocking into one finished square, then coming
// apart to do it again.
function BuildsDiagram() {
  const L = 62; // piece size — big, fills most of the frame
  const ox = DIAGRAM_W / 2 - L;
  const oy = DIAGRAM_H / 2 - L;

  // one edge of a piece: straight run, knob (k=+1 tab, -1 blank, 0 flat), run
  const edge = (sx, sy, dx, dy, k) => {
    const ex = sx + dx * L;
    const ey = sy + dy * L;
    if (!k) return `L ${ex} ${ey}`;
    const nx = dy;
    const ny = -dx;
    const at = (t, o = 0) => `${sx + dx * t * L + nx * k * o * L} ${sy + dy * t * L + ny * k * o * L}`;
    return `L ${at(0.38)} C ${at(0.26, 0.36)} ${at(0.74, 0.36)} ${at(0.62)} L ${ex} ${ey}`;
  };

  // a full piece outline: top edge L→R, right edge T→B, bottom R→L, left B→T
  const piece = (x, y, t, r, b, l) =>
    `M ${x} ${y} ` +
    edge(x, y, 1, 0, t) +
    edge(x + L, y, 0, 1, r) +
    edge(x + L, y + L, -1, 0, b) +
    edge(x, y + L, 0, -1, l) +
    " Z";

  // tabs and blanks are paired across every internal seam so they mesh
  const pieces = [
    { d: piece(ox, oy, 0, 1, -1, 0), dx: -62, dy: -46, delay: 0 }, // top-left
    { d: piece(ox + L, oy, 0, 0, 1, -1), dx: 66, dy: -50, delay: 0.14 }, // top-right
    { d: piece(ox, oy + L, 1, -1, 0, 0), dx: -66, dy: 52, delay: 0.28 }, // bottom-left
    { d: piece(ox + L, oy + L, -1, 0, 0, 1), dx: 62, dy: 56, delay: 0.42 }, // bottom-right
  ];

  const cycle = 5;
  const keyTimes = "0;0.1;0.42;0.78;1";

  return (
    <svg width={DIAGRAM_W} height={DIAGRAM_H} viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}>
      <TealDefs id="g2" />
      {pieces.map((p, i) => (
        <path key={i} d={p.d} fill="url(#g2)" stroke={PAPER} strokeWidth={1.6}>
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`${p.dx},${p.dy}; ${p.dx},${p.dy}; 0,0; 0,0; ${p.dx},${p.dy}`}
            keyTimes={keyTimes}
            dur={`${cycle}s`}
            begin={`${p.delay}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.5;0.5;1;1;0.5"
            keyTimes={keyTimes}
            dur={`${cycle}s`}
            begin={`${p.delay}s`}
            repeatCount="indefinite"
          />
        </path>
      ))}
    </svg>
  );
}

// 03 — a web across the whole company: scattered nodes, a mesh of faint
// teal connections between them, several pulses travelling different
// strands at once.
function CompanyDiagram() {
  const nodes = [
    [110, 20], [46, 46], [176, 42], [22, 100], [198, 96],
    [70, 138], [150, 148], [110, 84], [40, 160], [186, 150],
  ];
  const edges = [
    [0, 1], [0, 2], [0, 7], [1, 3], [1, 7], [2, 4], [2, 7],
    [3, 5], [3, 8], [4, 6], [4, 9], [5, 6], [5, 8], [6, 9], [7, 5], [7, 6],
  ];
  const pulses = [
    { edge: [0, 7], delay: 0 },
    { edge: [3, 5], delay: 0.9 },
    { edge: [2, 4], delay: 1.8 },
    { edge: [6, 9], delay: 0.4 },
    { edge: [1, 3], delay: 2.3 },
  ];
  return (
    <svg width={DIAGRAM_W} height={DIAGRAM_H} viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}>
      <TealDefs id="g3" />
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="url(#g3)" strokeWidth={0.8} opacity={0.22} />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 7 ? 5 : 3} fill="url(#g3)" />
      ))}
      {pulses.map((p, i) => {
        const a = nodes[p.edge[0]];
        const b = nodes[p.edge[1]];
        return (
          <circle key={i} r={3} fill="url(#g3)">
            <animateMotion path={`M${a[0]},${a[1]} L${b[0]},${b[1]}`} dur="2.4s" begin={`${p.delay}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.4s" begin={`${p.delay}s`} repeatCount="indefinite" />
          </circle>
        );
      })}
    </svg>
  );
}

// 04 — a maze. The ball runs its usual route, and partway through a wall
// runs into a wall at the end of the corridor it took. It doesn't die
// there — it backs out, finds another way through, and still reaches the
// exit.
function DoesntRotDiagram() {
  // 7 x 5 cells of 28px. Grid lines at x = 12 + 28i, y = 14 + 28j;
  // corridor centres sit mid-cell.
  const C = 28;
  const X0 = 12;
  const Y0 = 14;
  const COLS = 7;
  const ROWS = 5;
  const gx = (i) => X0 + C * i;
  const gy = (j) => Y0 + C * j;
  const px = (i) => gx(i) + C / 2;
  const py = (j) => gy(j) + C / 2;

  // A maze is defined by where the openings are, not where the walls are —
  // listing walls by hand just produces a grid of closed boxes. So: declare
  // every passage, then draw a wall on every grid segment that isn't one.
  // "i,j" in HPASS opens the wall between (i,j) and (i+1,j); in VPASS,
  // between (i,j) and (i,j+1).
  const HPASS = new Set([
    "0,0", "1,0", "3,0", "4,0", "5,0",
    "2,1", "3,1", "5,1",
    "0,2",
    "0,3", "2,3", "3,3", "4,3", "5,3",
    "0,4", "1,4", "5,4",
  ]);
  const VPASS = new Set([
    "0,0", "0,1", "0,3",
    "1,2",
    "2,0", "2,1", "2,2",
    "3,0", "3,3",
    "4,1",
    "5,3",
    "6,1", "6,2",
  ]);

  const walls = [];
  // internal verticals
  for (let i = 0; i < COLS - 1; i++) {
    for (let j = 0; j < ROWS; j++) {
      if (!HPASS.has(`${i},${j}`)) walls.push([gx(i + 1), gy(j), gx(i + 1), gy(j + 1)]);
    }
  }
  // internal horizontals
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS - 1; j++) {
      if (!VPASS.has(`${i},${j}`)) walls.push([gx(i), gy(j + 1), gx(i + 1), gy(j + 1)]);
    }
  }
  // border, with a single exit gap on the right at row 3
  walls.push([gx(0), gy(0), gx(COLS), gy(0)]);
  walls.push([gx(0), gy(ROWS), gx(COLS), gy(ROWS)]);
  walls.push([gx(0), gy(0), gx(0), gy(ROWS)]);
  walls.push([gx(COLS), gy(0), gx(COLS), gy(3)]);
  walls.push([gx(COLS), gy(4), gx(COLS), gy(ROWS)]);

  // the route runs along the top, down, and right along the middle corridor
  // — which dead-ends. Then: back out the way it came, down the open column,
  // and across the bottom corridor to the exit.
  const route =
    `M${px(0)},${py(0)} L${px(2)},${py(0)} L${px(2)},${py(1)} L${px(4)},${py(1)} ` +
    `L${px(2)},${py(1)} L${px(2)},${py(3)} L${px(6)},${py(3)} L${gx(COLS)},${py(3)}`;

  // stops are distance-proportional along that path, so the pause lands
  // exactly at the blocked wall
  const keyPoints = "0;0.148;0.222;0.370;0.370;0.519;0.667;0.963;1;1";
  const keyTimes = "0;0.09;0.14;0.28;0.42;0.56;0.66;0.90;0.95;1";
  const cycle = 7;

  return (
    <svg width={DIAGRAM_W} height={DIAGRAM_H} viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}>
      <TealDefs id="g4" />

      {walls.map((w, i) => (
        <line key={i} x1={w[0]} y1={w[1]} x2={w[2]} y2={w[3]} stroke="url(#g4)" strokeWidth={2} opacity={0.5} strokeLinecap="square" />
      ))}

      {/* the exit */}
      <circle cx={gx(COLS)} cy={py(3)} r={4} fill="url(#g4)" opacity={0.6} />

      {/* the ball — blocked, backs out, reroutes, still gets there */}
      <circle r={5.5} fill="url(#g4)">
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.04;0.94;1" dur={`${cycle}s`} repeatCount="indefinite" />
        <animateMotion
          path={route}
          keyPoints={keyPoints}
          keyTimes={keyTimes}
          calcMode="linear"
          dur={`${cycle}s`}
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

const FEATURES = [
  {
    tag: "NON-INVASIVE, BY ARCHITECTURE",
    Diagram: NonInvasiveDiagram,
    title: "Access is layered, not assumed.",
    line: "Ori starts with APIs and audit logs and adds scoped extensions only where you opt in. Allowlisted sites, automatic redaction, and an audit trail mean you always know exactly what's being observed.",
  },
  {
    tag: "SHOWS, DOESN'T JUST TELL",
    Diagram: BuildsDiagram,
    title: "It builds the automation, end-to-end.",
    line: "Most tools stop at diagnosis. Ori closes the loop: the same tool that observes the bottleneck is what builds the workflow to remove it.",
  },
  {
    tag: "ONE PLUG-IN, THE ENTIRE COMPANY",
    Diagram: CompanyDiagram,
    title: "It watches the company, not one desk.",
    line: "A single desk software is blind to what happens between people. Ori watches work across the org, catching the handoffs, approvals and bottlenecks that no single desk ever could.",
  },
  {
    tag: "AUTOMATIONS THAT DON'T DIE QUIETLY",
    Diagram: DoesntRotDiagram,
    title: "It doesn't quietly die.",
    line: "Everything built by hand breaks the moment an API changes or a process shifts. Ori watches every run and repairs itself.",
  },
];

function FeatureCard({ index }) {
  const feat = FEATURES[index];
  const Diagram = feat.Diagram;

  return (
    <div
      style={{
        background: PAPER,
        backgroundImage: GRAIN,
        border: "1px solid rgba(27,27,24,0.08)",
        boxShadow: CARD_SHADOW,
        padding: "30px 32px 28px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <p
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.16em",
          color: ACCENT,
          margin: "0 0 14px",
        }}
      >
        0{index + 1} — {feat.tag}
      </p>

      <div
        style={{
          height: DIAGRAM_H + 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid rgba(27,27,24,0.10)",
        }}
      >
        <Diagram />
      </div>

      <h3
        style={{
          fontFamily: SERIF,
          fontWeight: 400,
          fontSize: 23,
          color: INK,
          margin: "18px 0 0",
          lineHeight: 1.25,
        }}
      >
        {feat.title}
      </h3>

      <p style={{ fontFamily: BODY, fontSize: 14, color: INK_SOFT, lineHeight: 1.6, margin: "12px 0 0" }}>
        {feat.line}
      </p>
    </div>
  );
}

export default function Differentiators() {
  return (
    <section id="how" style={{ position: "relative", background: "transparent", padding: "120px 24px 100px" }}>
      <style>{FONT_IMPORT}</style>

      {/* same treatment as the Offer section's heading — mono-caps eyebrow,
          big plain serif headline, then a printed-caption rule under it */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <p style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.24em", color: INK_SOFT, margin: "0 0 14px" }}>
          ORI'S CORE FEATURES
        </p>
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 76, color: INK, margin: 0, lineHeight: 1 }}>
          Ori&rsquo;s Operations
        </h2>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20 }}>
          <div style={{ width: 64, height: 1, background: "rgba(27,27,24,0.22)" }} />
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_SOFT }}>
            FIG. 05 — WHY IT'S DIFFERENT
          </span>
        </div>
      </div>

      {/* the grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          maxWidth: 920,
          margin: "32px auto 0",
        }}
      >
        {FEATURES.map((_, i) => (
          <FeatureCard key={i} index={i} />
        ))}
      </div>
    </section>
  );
}
