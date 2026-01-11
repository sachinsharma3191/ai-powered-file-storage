export const environment = {
  production: false,
  apiUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_API_URL']) || 'http://localhost:3000',
  mcpUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_MCP_URL']) || 'http://localhost:8080',
  websocketUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_WEBSOCKET_URL']) || 'ws://localhost:3000/cable'
};
