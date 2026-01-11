export const environment = {
  production: false,
  // Storage Control Plane (Rails API)
  apiUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_API_URL']) || 'http://localhost:3000',
  
  // MCP Server (Python)
  mcpUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_MCP_URL']) || 'http://localhost:8080',
  
  // WebSocket (Rails Action Cable)
  websocketUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_WEBSOCKET_URL']) || 'ws://localhost:3000/cable',
  
  // Chunk Gateway (Rust)
  chunkGatewayUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_CHUNK_GATEWAY_URL']) || 'http://localhost:4000',
  
  // Notification Service (Python)
  notificationServiceUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_NOTIFICATION_URL']) || 'http://localhost:5000',
  
  // Agent Service (Python)
  agentServiceUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_AGENT_URL']) || 'http://localhost:6000',
  
  // S3 Compatible API (via Storage Control Plane)
  s3ApiUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_S3_API_URL']) || 'http://localhost:3000/s3',
  
  // Outbox Worker (Python)
  outboxWorkerUrl: (typeof process !== 'undefined' && process.env?.['NG_APP_OUTBOX_URL']) || 'http://localhost:7000'
};
