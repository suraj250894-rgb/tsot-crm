/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  webpack: (config) => {
    // pdfjs-dist v5 tries to resolve the optional 'canvas' Node module at build
    // time. Aliasing it to false prevents the "Object.defineProperty called on
    // non-object" error that fires when Next.js bundles the client component.
    config.resolve.alias.canvas = false;

    // Tell webpack to treat .mjs files inside node_modules as plain JS modules
    // (not ES modules that require special handling). Without this, importing
    // pdfjs-dist in a Next.js client component throws "Object.defineProperty
    // called on non-object" because webpack tries to apply CJS transforms.
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    });

    return config;
  },
};

module.exports = nextConfig;
