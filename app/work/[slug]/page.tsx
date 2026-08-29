import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CasePage from "@/components/case/CasePage";
import { projectBySlug, projects } from "@/lib/projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = projectBySlug(slug);
  if (!project) return {};
  return {
    title: `${project.title} — Remington McElhaney`,
    description: project.overview,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = projectBySlug(slug);
  if (!project) notFound();
  return <CasePage project={project} />;
}
