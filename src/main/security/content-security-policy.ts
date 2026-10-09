export function buildContentSecurityPolicy(isDevelopment: boolean): string {
  const connectSources = isDevelopment ? "'self' http://localhost:* ws://localhost:*" : "'self'"

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}
