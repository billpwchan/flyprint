import type { NextConfig } from "next";

// Addresses from the earlier workspace layout, kept working for old bookmarks.
const moved: [string, string][] = [
  ["/journeys", "/"],
  ["/global", "/"],
  ["/experience", "/"],
  ["/together", "/"],
  ["/atlas", "/places"],
  ["/insights", "/"],
  ["/flights", "/log"],
  // Years became a filter on every section.
  ["/years", "/"],
  // Three parts, as in the app: the overview and the trips became one
  // page, and the fleet went into the footprint.
  ["/trips", "/"],
  ["/fleet", "/places"],
];

const nextConfig: NextConfig = {
  // Keep production deployment self-contained so it can run in an isolated
  // container without sharing the host's Node.js installation or dependencies.
  output: "standalone",
  async redirects() {
    return [
      ...moved.map(([source, destination]) => ({ source, destination, permanent: true })),
      { source: "/years/:year(\\d{4})", destination: "/?year=:year", permanent: true },
    ];
  },
};

export default nextConfig;
