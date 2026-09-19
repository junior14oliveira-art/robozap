// Force all pages to be dynamically rendered (no SSG/SSR prerender)
// This is necessary because our app uses socket.io-client which requires the browser
export const dynamic = 'force-dynamic';
