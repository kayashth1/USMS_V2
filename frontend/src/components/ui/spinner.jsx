const SIZE = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
  xl: "h-12 w-12 border-4",
};

/**
 * Inline spinning ring.
 * Usage: <Spinner /> · <Spinner size="lg" /> · <Spinner className="text-indigo-600" />
 */
export const Spinner = ({ size = "md", className = "" }) => (
  <span
    className={`inline-block rounded-full border-gray-200 border-t-indigo-500 animate-spin ${SIZE[size]} ${className}`}
    role="status"
    aria-label="Loading"
  />
);

/**
 * Centred loader for full-page or full-section states.
 * Usage: <PageLoader /> · <PageLoader label="Loading fees…" />
 */
export const PageLoader = ({ label = "Loading…", className = "" }) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-16 text-gray-400 ${className}`}>
    <Spinner size="xl" />
    {label && <p className="text-sm">{label}</p>}
  </div>
);

/**
 * One-liner for tight spaces (table cells, small sections).
 * Usage: <InlineLoader />
 */
export const InlineLoader = ({ label = "Loading…" }) => (
  <span className="inline-flex items-center gap-1.5 text-gray-400 text-xs">
    <Spinner size="sm" />
    {label}
  </span>
);
