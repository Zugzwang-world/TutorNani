// The progress report (REFINE R7). Entry points only need these:
//   openReport("week")  → opens the full-screen report on that view (default today)
//   prefetchReport()    → warms today's report (the 📈 card calls it when it appears)
//   <ReportHost />      → mounted once (MessageList does)
//   <ProgressCard view /> and <ProgressButton /> → the 📈 card under Memory's replies and the 📈 header button
export { openReport, closeReport } from "./store";
export { prefetchReport } from "./data";
export { ReportHost } from "./report-host";
export { ProgressButton, ProgressCard } from "./progress-card";
export type { ReportView } from "./types";
