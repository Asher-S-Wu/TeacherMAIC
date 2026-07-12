import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: ['mongodb'],
  outputFileTracingIncludes: {
    '/*': ['./lib/prompts/**/*.md'],
  },
  experimental: {
    proxyClientMaxBodySize: '5mb',
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured.
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
