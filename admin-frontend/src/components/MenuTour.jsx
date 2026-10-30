import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp, useDialogs, useShell } from "../store/AppContext.jsx";
import Icon from "./Icon.jsx";

/**
 * Menu walkthrough: spotlights each menu item in turn with one plain sentence
 * about what it does. Runs once per user after their first sign-in on this
 * device; replay it with `window.dispatchEvent(new Event("gymboo:menu-tour"))`
 * (Help page, phone app tour button).
 */

const SEEN_KEY = "gym-menu-tour-done-v1:";
export const MENU_TOUR_EVENT = "gymboo:menu-tour";

const nav = (view) => `#adminSidebar .nav-link[data-view="${view}"]`;

// Order follows the menu. Items the user can't see (staff) are skipped.
const STEPS = [
  { target: "#menuToggle", mobileOnly: true, icon: "menu", title: "Your menu", text: "Tap here any time to open the menu. Every part of the app is in it." },
  { target: nav("dashboard"), icon: "dashboard", title: "Dashboard", text: "Today at a glance: who checked in, fees collected and who is due." },
  { target: nav("attendance"), icon: "productivity", title: "Mark Attendance", text: "Mark members present for any day with a single tap." },
  { target: nav("checkin"), icon: "qr_code_scanner", title: "QR Check-in", text: "Put this QR at your desk. Members scan it to check themselves in." },
  { target: nav("history"), icon: "calendar_month", title: "Attendance History", text: "See who came on which day, for any dates you pick." },
  { target: nav("members"), icon: "groups_3", title: "Members", text: "Your member list. Search, edit details, change plans and see dues." },
  { target: nav("trainers"), icon: "exercise", title: "Trainers", text: "Keep your trainers, their shifts and their attendance." },
  { target: "#sideAddMember", icon: "person_add", title: "Add Member", text: "Register a new member with their plan, fee and start date." },
  { target: nav("payments"), icon: "payments", title: "Payments", text: "Collect fees, see who has paid and who is due, and share receipts." },
  { target: nav("expenses"), icon: "account_balance_wallet", title: "Expense Tracker", text: "Note down rent, salaries and other spending." },
  { target: nav("insights"), icon: "insights", title: "Detailed Insights", text: "Money in, money out and every plan change, for any month." },
  { target: nav("plan"), icon: "workspace_premium", title: "Plan & Billing", text: "Your app subscription and its payments." },
  { target: nav("notifications"), icon: "notifications_active", title: "Send Notification", text: "Send fee reminders or announcements to your members' phones." },
  { target: nav("settings"), icon: "settings", title: "Settings", text: "Gym name, phone, logo, billing cycle and holidays." },
  { target: nav("help"), icon: "help", title: "Help", text: "Video guides and answers. You can replay this tour from here." },
];

const MOBILE = "(max-width: 900px)";
const GAP = 14;
const MARGIN = 12;

function seenKey(user) {
  return SEEN_KEY + (user?.id || "anon");
}

function readSeen(user) {
  try {
    return localStorage.getItem(seenKey(user)) === "1";
  } catch {
    return true; // no storage: never auto-start rather than every time
  }
}

function markSeen(user) {
  try {
    localStorage.setItem(seenKey(user), "1");
  } catch {
    // ignore
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function MenuTour() {
  const { user, dataReady, toggleDrawer, closeDrawer } = useApp();
  const { drawerOpen } = useShell();
  const dialogs = useDialogs();
  const [steps, setSteps] = useState(null); // the steps for this run; null = closed
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [tipSize, setTipSize] = useState({ width: 300, height: 150 });
  const tipRef = useRef(null);
  const nextRef = useRef(null);
  const drawerRef = useRef(drawerOpen);
  drawerRef.current = drawerOpen;

  const anyDialogOpen = Boolean(
    dialogs?.memberDialog?.open ||
      dialogs?.feeDialog?.open ||
      dialogs?.planDialog?.open ||
      dialogs?.trainerDialog?.open ||
      dialogs?.expenseDialog?.open ||
      dialogs?.detailMemberId ||
      dialogs?.dayLedgerDate,
  );

  const start = useCallback(() => {
    const mobile = window.matchMedia(MOBILE).matches;
    const available = STEPS.filter((step) => (!step.mobileOnly || mobile) && document.querySelector(step.target));
    if (!available.length) return;
    // Phone: begin on the ☰ button with the drawer shut.
    if (mobile && drawerRef.current) closeDrawer();
    setRect(null);
    setIndex(0);
    setSteps(available);
  }, [closeDrawer]);

  const finish = useCallback(() => {
    markSeen(user);
    setSteps(null);
    setRect(null);
    if (window.matchMedia(MOBILE).matches) closeDrawer();
  }, [closeDrawer, user]);

  // First sign-in on this device: start once the dashboard has loaded.
  useEffect(() => {
    if (!user || !dataReady || steps || anyDialogOpen || readSeen(user)) return undefined;
    const timer = setTimeout(start, 900);
    return () => clearTimeout(timer);
  }, [user, dataReady, steps, anyDialogOpen, start]);

  // Replays from the Help page and the phone app.
  useEffect(() => {
    const onReplay = () => user && start();
    window.addEventListener(MENU_TOUR_EVENT, onReplay);
    return () => window.removeEventListener(MENU_TOUR_EVENT, onReplay);
  }, [start, user]);

  if (!user && steps) setSteps(null);

  const step = steps?.[index];

  // Bring the item on screen (opening the phone drawer when needed), then follow
  // it every frame so the spotlight tracks the drawer sliding in and scrolling.
  useEffect(() => {
    if (!step) return undefined;
    let cancelled = false;
    let frame = 0;
    (async () => {
      const mobile = window.matchMedia(MOBILE).matches;
      const inDrawer = step.target.startsWith("#adminSidebar");
      if (mobile && inDrawer && !drawerRef.current) {
        toggleDrawer();
        await wait(300);
      }
      if (cancelled) return;
      const element = document.querySelector(step.target);
      if (!element) {
        setRect(null);
        return;
      }
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      let last = "";
      const track = () => {
        if (cancelled) return;
        const box = element.getBoundingClientRect();
        const key = [box.top, box.left, box.width, box.height].map(Math.round).join(",");
        if (key !== last) {
          last = key;
          setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
        }
        frame = requestAnimationFrame(track);
      };
      track();
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [step, toggleDrawer]);

  useLayoutEffect(() => {
    if (!tipRef.current) return;
    const { offsetWidth: width, offsetHeight: height } = tipRef.current;
    if (width !== tipSize.width || height !== tipSize.height) setTipSize({ width, height });
  });

  useEffect(() => {
    if (step) nextRef.current?.focus({ preventScroll: true });
  }, [step]);

  const go = useCallback(
    (delta) => {
      if (!steps) return;
      const next = index + delta;
      if (next >= steps.length) finish();
      else if (next >= 0) setIndex(next);
    },
    [finish, index, steps],
  );

  useEffect(() => {
    if (!steps) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish, go, steps]);

  if (!steps || !step) return null;

  // Bubble placement: beside the item when there's room (desktop sidebar),
  // otherwise below it, or above when it's near the bottom of the screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 6;
  const spot = rect && {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  let placement = "below";
  let tip = { top: vh / 2 - tipSize.height / 2, left: vw / 2 - tipSize.width / 2 };
  let arrow = null;
  if (spot) {
    const midY = spot.top + spot.height / 2;
    const midX = spot.left + spot.width / 2;
    if (spot.left + spot.width + GAP + tipSize.width + MARGIN <= vw && !window.matchMedia(MOBILE).matches) {
      placement = "right";
      tip = { left: spot.left + spot.width + GAP, top: midY - tipSize.height / 2 };
    } else if (spot.top + spot.height + GAP + tipSize.height + MARGIN <= vh) {
      placement = "below";
      tip = { top: spot.top + spot.height + GAP, left: midX - tipSize.width / 2 };
    } else {
      placement = "above";
      tip = { top: spot.top - GAP - tipSize.height, left: midX - tipSize.width / 2 };
    }
    tip.left = Math.min(Math.max(tip.left, MARGIN), vw - tipSize.width - MARGIN);
    tip.top = Math.min(Math.max(tip.top, MARGIN), vh - tipSize.height - MARGIN);
    arrow =
      placement === "right"
        ? { top: Math.min(Math.max(midY - tip.top, 18), tipSize.height - 18) }
        : { left: Math.min(Math.max(midX - tip.left, 20), tipSize.width - 20) };
  }

  const last = index === steps.length - 1;

  return (
    <div className="menu-tour" role="dialog" aria-modal="true" aria-label="Menu tour">
      {spot ? (
        <div className="menu-tour-spot" style={spot} aria-hidden="true" />
      ) : (
        <div className="menu-tour-dim" aria-hidden="true" />
      )}
      <div
        ref={tipRef}
        className={"menu-tour-tip is-" + placement}
        style={{ top: tip.top, left: tip.left, visibility: spot ? "visible" : "hidden" }}
        aria-live="polite"
      >
        {arrow ? <span className="menu-tour-arrow" style={arrow} aria-hidden="true" /> : null}
        <div className="menu-tour-head">
          <span className="menu-tour-ico" aria-hidden="true">
            <Icon name={step.icon} />
          </span>
          <strong>{step.title}</strong>
          <button type="button" className="menu-tour-skip" onClick={finish}>
            Skip
          </button>
        </div>
        <p>{step.text}</p>
        <div className="menu-tour-foot">
          <span className="menu-tour-count">
            <b>{index + 1}</b>/{steps.length}
          </span>
          {index > 0 ? (
            <button type="button" className="menu-tour-back" aria-label="Previous" onClick={() => go(-1)}>
              <Icon name="arrow_back" />
            </button>
          ) : null}
          <button type="button" className="menu-tour-next" ref={nextRef} onClick={() => go(1)}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
