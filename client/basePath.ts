const routeSegments = new Set(['chat', 'new', 'history', 'connections']);

/**
 * Home Assistant ingress serves the app under /api/hassio_ingress/<token>/, so
 * the origin root is not the application root. Every API path and route must be
 * resolved against the prefix the page itself was served from.
 */
export function basePath(pathname: string): string {
  const segments = pathname.split('/');
  if (routeSegments.has(segments[segments.length - 1] ?? '')) segments.pop();
  const base = segments.join('/');
  return base.endsWith('/') ? base : `${base}/`;
}
