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
  dashboard: ["Welcome back, Admin!", "Here is what is happening at your gym today."],
  attendance: ["Mark Attendance", "Select a date and update daily member attendance."],
  checkin: ["QR Check-in", "Members scan the desk QR to mark their own attendance."],
  history: ["Attendance History", "Review attendance records for any selected date."],
  members: ["Members", "Search, edit, and manage all registered members."],
  payments: ["Payment History", "Review customer-wise payment records."],
  expenses: ["Expense Tracker", "Track every expense and earning of the gym in one ledger."],
  insights: ["Detailed Insights", "Pick any month, year or date range and see exactly where the money came from and went."],
  trainers: ["Trainers", "Manage trainer profiles, specialties, shifts, and contact details."],
  notifications: ["Send Notification", "Push fee reminders and announcements to your members' phones."],
  settings: ["Settings", "Update your gym profile and logo."],
  help: ["Need Help", "Video tutorials in Hindi & English, plus a step-by-step text guide."],
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
  expenses: "Expense Tracker",
  insights: "Detailed Insights",
  notifications: "Send Notification",
  settings: "Settings",
  help: "Need Help",
};

export const CHECKIN_STATUS_COPY = {
  checking: ["Checking check-in server...", "Looking for the shared backend service."],
  online: ["Check-in server is running", "Members can scan the QR to check in. Attendance updates automatically."],
  offline: [
    "Check-in server is offline",
    "Start it with: npm start - then press Retry.",
  ],
};
