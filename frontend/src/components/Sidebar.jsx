import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { logout } from "../auth/realAuth";
import { BODY, SERIF, INK, INK_SOFT, ACCENT_SOFT, LINE, PAPER_WARM } from "../theme";

const NAV_ITEMS = [
  { to: "/queue", label: "Queue" },
  { to: "/dashboard", label: "Threads" },
  { to: "/settings", label: "Settings" },
  { to: "/audit", label: "Log" },
];

function HamburgerIcon() {
  const bar = { width: 16, height: 1.6, background: INK, borderRadius: 1 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
      <div style={bar} />
      <div style={bar} />
      <div style={bar} />
    </div>
  );
}

// width of the sliding drawer - exported so a page that wants to shift
// its own layout out from under the drawer (see DashboardPage.jsx) uses
// the exact same number rather than a second, easy-to-drift copy of it.
export const SIDEBAR_DRAWER_WIDTH = 220;

// Collapsed by default — just a hamburger + the "Ori" wordmark, fixed
// top-left on every app page. Clicking it slides out a drawer with the
// full nav; it never reserves layout width itself, so pages don't need to
// account for a permanent sidebar column. `onOpenChange`, when given, is
// called with the drawer's open state - optional, so pages that don't
// care (Queue, Settings, Log) are completely unaffected.
export default function Sidebar({ user, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      <div style={{ position: "fixed", top: 20, left: 24, zIndex: 120, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Open navigation"
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, borderRadius: 8 }}
        >
          <HamburgerIcon />
        </button>
        <span style={{ fontFamily: SERIF, fontSize: 18, color: INK }}>Ori</span>
      </div>

      <AnimatePresence>
        {open && (
          <React.Fragment>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(27,27,24,0.15)", zIndex: 110 }}
            />
            <motion.div
              key="drawer"
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{
                position: "fixed", top: 0, left: 0, bottom: 0, width: 220, zIndex: 115,
                background: PAPER_WARM, borderRight: `1px solid ${LINE}`, boxShadow: "0 0 40px rgba(27,27,24,0.15)",
                display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 16px 20px",
              }}
            >
              <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    style={({ isActive }) => ({
                      display: "block",
                      textDecoration: "none",
                      fontFamily: BODY,
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? INK : INK_SOFT,
                      background: isActive ? ACCENT_SOFT : "transparent",
                      padding: "9px 14px",
                      borderRadius: 8,
                    })}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
                <span style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, padding: "0 2px" }}>{user?.name}</span>
                <button
                  onClick={handleLogout}
                  style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, background: "none", border: "none", cursor: "pointer", padding: "0 2px", textAlign: "left" }}
                >
                  Log out
                </button>
              </div>
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>
    </>
  );
}
