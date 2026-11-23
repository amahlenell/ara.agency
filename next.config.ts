import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['node-html-parser'],
  distDir:process.env.STUDIO_E2E==='true'?'work/redesign-e2e-build':'.next',
  poweredByHeader:false,
  turbopack:{root:process.cwd()},
  outputFileTracingRoot:process.cwd(),
  async headers(){return [
    {source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]},
    {source:'/studio/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'}]},
    {source:'/preview/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},{key:'Cache-Control',value:'private, no-store, max-age=0'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Content-Security-Policy',value:"base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'"}]},
  ];}
};

export default nextConfig;
