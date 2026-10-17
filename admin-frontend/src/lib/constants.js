export const TRAINERS_STORAGE_KEY = "gym-admin-trainers-v1";
export const AUTH_TOKEN_KEY = "gym-admin-token";
export const ACTIVE_GYM_KEY = "gym-admin-active-gym";

// Keep in sync with EXPENSE_CATEGORIES in backend/src/utils/expense.js.
export const EXPENSE_CATEGORIES = [
  { value: "trainer-payment", label: "Trainer payment" },
  { value: "rent", label: "Rent" },
  { value: "equipment", label: "Equipment" },
  { value: "utilities", label: "Utilities" },
  { value: "maintenance", label: "Maintenance" },
  { value: "miscellaneous", label: "Miscellaneous" },
  { value: "other", label: "Other" },
];

// Keep in sync with PAYMENT_MODES in backend/src/config/constants.js.
export const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export const DEFAULT_SETTINGS = {
  gymName: "Gym Admin",
  logo: "",
  billingCycleMode: "30-days",
  customBillingDays: 25,
  defaultCollectionTiming: "at-join",
  allowExpiredCheckin: true,
  weeklyHolidays: [0],
  holidayDates: [],
  theme: {
    primary: "#11784a",
    primaryDark: "#073f2d",
    accent: "#4f46e5",
    danger: "#c43d32",
    background: "#f6f8f5",
    panel: "#ffffff",
    text: "#17201b",
  },
};

export const VIEW_COPY = {
  dashboard: ["Dashboard", "Today at your gym."],
  attendance: ["Mark Attendance", "Mark attendance for any date."],
  checkin: ["QR Check-in", "Members scan the desk QR to check in."],
  history: ["Attendance History", "Attendance records by date."],
  members: ["Members", "Search and manage members."],
  payments: ["Payment History", "Payment records by member."],
  expenses: ["Expense Tracker", "Expenses and earnings in one ledger."],
  insights: ["Detailed Insights", "Income and spending for any period."],
  trainers: ["Trainers", "Trainer profiles and shifts."],
  plan: ["Plan & Billing", "Your plan and payment history."],
  notifications: ["Send Notification", "Send reminders and announcements to members."],
  settings: ["Settings", "Gym profile and logo."],
  help: ["Help", "Video tutorials and step-by-step guide."],
};

// Short labels used by the mobile app bar — the sidebar link text for each view.
export const VIEW_SHORT_TITLE = {
  dashboard: "Dashboard",
  attendance: "Mark Attendance",
  checkin: "QR Check-in",
  history: "Attendance History",
  members: "Members",
  trainers: "Trainers",
  payments: "Payments",
  plan: "Plan & Billing",
  expenses: "Expense Tracker",
  insights: "Detailed Insights",
  notifications: "Send Notification",
  settings: "Settings",
  help: "Help",
};

export const CHECKIN_STATUS_COPY = {
  checking: ["Connecting…", "Checking the check-in server."],
  online: ["Check-in is live", "Attendance updates automatically."],
  offline: [
    "Check-in is offline",
    "Check your connection, then press Retry.",
  ],
};
