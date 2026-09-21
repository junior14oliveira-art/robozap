/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
  },
  async rewrites() {
    const rawBackendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://robozap-xsno.onrender.com';
    const backendUrl = rawBackendUrl.startsWith('http') ? rawBackendUrl : `https://${rawBackendUrl}`;
    const cleanBackendUrl = backendUrl.replace(/\/+$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${cleanBackendUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${cleanBackendUrl}/uploads/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
