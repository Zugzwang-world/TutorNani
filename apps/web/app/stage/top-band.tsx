// The band across the top of the stage's right half, kept at a fixed height so the layout never moves (R1).
// R4.5 fills it: Nani's five files as a strip (versions, pulse and toast on a change), then the demo clock and the jobs
// board with live countdowns. The toast overlays the chat below, so the band's height never changes.
import "./stage.css";
import "./band.css";
import { FileStrip } from "./file-strip";
import { JobsBoard } from "./jobs-board";

export function StageTopBand() {
  return (
    <section className="stg-band tb-band" aria-label="Nani's files and jobs">
      <div className="tb-inner">
        <FileStrip />
        <JobsBoard />
      </div>
    </section>
  );
}
