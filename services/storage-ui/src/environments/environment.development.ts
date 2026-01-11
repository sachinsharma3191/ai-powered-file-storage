export const environment = {
  production: false,
  apiUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_API_URL']) || 'http://localhost:3000'
};
