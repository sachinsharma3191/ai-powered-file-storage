export const environment = {
  production: false,
  apiUrl: (typeof window !== 'undefined' && (window as any).__env?.API_URL) || 'http://localhost:3000'
};
