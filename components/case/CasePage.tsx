"use client";

import { useEffect } from "react";
import { useStage } from "@/components/media/stage";
import CaseView from "./CaseView";
import type { Project } from "@/lib/projects";

export default function CasePage({ project }: { project: Project }) {
  const { cp, stage } = useStage();

  // A fresh project page always starts on its intro screen.
  useEffect(() => {
    cp.set(0);
  }, [cp, project.slug]);

  if (stage.w === 0) return null;
  return <CaseView project={project} />;
}
