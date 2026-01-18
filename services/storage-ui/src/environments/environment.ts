export const environment = {
  production: false,
  // Storage Control Plane (Rails API)
  apiUrl: (typeof window !== 'undefined' && (window as any).__env?.API_URL) || 'http://localhost:3000',
  
  // MCP Server (Python)
  mcpUrl: (typeof window !== 'undefined' && (window as any).__env?.MCP_URL) || 'http://localhost:8080',
  
  // WebSocket (Rails Action Cable)
  websocketUrl: (typeof window !== 'undefined' && (window as any).__env?.WEBSOCKET_URL) || 'ws://localhost:3000/cable',
  
  // Chunk Gateway (Rust)
  chunkGatewayUrl: (typeof window !== 'undefined' && (window as any).__env?.CHUNK_GATEWAY_URL) || 'http://localhost:4000',
  
  // Notification Service (Python)
  notificationServiceUrl: (typeof window !== 'undefined' && (window as any).__env?.NOTIFICATION_URL) || 'http://localhost:5000',
  
  // Agent Service (Python)
  agentServiceUrl: (typeof window !== 'undefined' && (window as any).__env?.AGENT_URL) || 'http://localhost:6000',
  
  // S3 Compatible API (via Storage Control Plane)
  s3ApiUrl: (typeof window !== 'undefined' && (window as any).__env?.S3_API_URL) || 'http://localhost:3000/s3',
  
  // Outbox Worker (Python)
  outboxWorkerUrl: (typeof window !== 'undefined' && (window as any).__env?.OUTBOX_URL) || 'http://localhost:7000'
};
