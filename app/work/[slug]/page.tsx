import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CasePage from "@/components/case/CasePage";
import {
  PLACEHOLDER_OVERVIEW,
  projectBySlug,
  projects,
} from "@/lib/projects";
import { absolute, site } from "@/lib/site";

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
  /*
   * The name is appended by the title template in the root layout, so it is
   * deliberately absent here — spelling it out again produced "Airbnb Setup —
   * Remington McElhaney — Remington McElhaney".
   *
   * `openGraph` replaces the parent's rather than merging into it, so a page
   * that sets none at all is shared under the site's generic title. A case
   * study link is the one most likely to be sent to someone, so it gets its
   * own.
   */
  /* Never index the stand-in. See the note on PLACEHOLDER_OVERVIEW. */
  const description =
    project.overview === PLACEHOLDER_OVERVIEW
      ? `${project.title} — motion design work by ${site.name}.`
      : project.overview;

  return {
    title: project.title,
    description,
    alternates: { canonical: `/work/${project.slug}/` },
    openGraph: {
      type: "article",
      siteName: site.name,
      title: `${project.title} — ${site.name}`,
      description,
      url: absolute(`/work/${project.slug}/`),
      locale: "en_US",
      images: [{ url: site.ogImage, width: 1200, height: 630, alt: site.ogImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${project.title} — ${site.name}`,
      description,
      images: [site.ogImage],
    },
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
