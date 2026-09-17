import { initials } from "../lib/format.js";

// The wordmark shown when the gym hasn't uploaded a logo.
function DefaultEmblem() {
  return (
    <svg className="w-10 h-10" fill="none" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect fill="#181B22" height="100" rx="24" width="100" />
      <path d="M28 68V32H38V68H28ZM62 68V32H72V68H62ZM38 46H62V54H38V46Z" fill="currentColor" />
      <circle cx="50" cy="50" r="16" stroke="#FFFFFF" strokeDasharray="8 4" strokeWidth="4" />
      <path d="M50 24L56 36H44L50 24Z" fill="currentColor" />
    </svg>
  );
}

export default function BrandHeader({ gymName, logo }) {
  return (
    <div className="flex flex-col items-center text-center pt-2">
      <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-white border border-primary/20 shadow-lg shadow-primary/10 mb-2 p-1.5">
        <div className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center bg-gray-950 text-primary">
          {logo ? (
            <img alt={`${gymName} logo`} className="w-full h-full object-cover" src={logo} />
          ) : gymName && gymName !== "Gym Check-in" ? (
            <span className="font-headline-lg text-lg font-bold tracking-tight text-white">
              {initials(gymName)}
            </span>
          ) : (
            <DefaultEmblem />
          )}
        </div>
      </div>
      <div className="text-[12px] font-bold uppercase tracking-widest text-primary font-headline-sm">
        {gymName}
      </div>
      <h1 className="text-2xl font-bold font-headline-lg text-gray-900 mt-1 tracking-tight">
        Members App
      </h1>
    </div>
  );
}
