
// Configuration file to handle environment-specific settings

// Determine the API base URL
// 1. If VITE_API_URL is explicitly set in .env, use it.
// 2. If running in production (PROD is true), use relative path '' so Nginx proxies it.
// 3. If running in development, default to localhost:3001.
export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');
