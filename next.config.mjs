/**
 * The site is fully static — every route is prerendered and there is no server
 * code — so it can be exported to plain files and served from anywhere.
 *
 * Both switches are off by default so local development is untouched: `npm run
 * dev` and `npm start` behave exactly as before. The deploy workflow turns them
 * on, because a project page on GitHub Pages is served from a subdirectory
 * rather than the root of a domain.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.STATIC_EXPORT === "1"
    ? { output: "export", trailingSlash: true }
    : {}),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
