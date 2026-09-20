"use client";

import { useEffect } from "react";
import { useStage } from "@/components/media/stage";
import CaseView from "./CaseView";
import type { Project } from "@/lib/projects";
import { clipsToWarm, mayWarm, warmClips } from "@/lib/prefetch";

export default function CasePage({ project }: { project: Project }) {
  const { cp, stage } = useStage();

  // A fresh project page always starts on its intro screen.
  useEffect(() => {
    cp.set(0);
  }, [cp, project.slug]);

  /**
   * Opening a project is the signal that its clips are about to be wanted, so
   * they start arriving now rather than one at a time as each shot is reached.
   * See `lib/prefetch.ts`. Aborted on the way out, so stepping back to the deck
   * and into another project does not leave the first one's queue running
   * against the second one's.
   */
  useEffect(() => {
    if (!mayWarm()) return;
    const ac = new AbortController();
    warmClips(clipsToWarm(project), ac.signal);
    return () => ac.abort();
  }, [project]);

  if (stage.w === 0) return null;
  return <CaseView project={project} />;
}
