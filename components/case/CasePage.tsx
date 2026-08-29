"use client";

import { useEffect } from "react";
import { useStage } from "@/components/media/stage";
import CaseDesktop from "./CaseDesktop";
import CaseMobile from "./CaseMobile";
import type { Project } from "@/lib/projects";

export default function CasePage({ project }: { project: Project }) {
  const { mobile, cp, stage } = useStage();

  // A fresh project page always starts on its intro screen.
  useEffect(() => {
    cp.set(0);
  }, [cp, project.slug]);

  if (stage.w === 0) return null;
  return mobile ? (
    <CaseMobile project={project} />
  ) : (
    <CaseDesktop project={project} />
  );
}
