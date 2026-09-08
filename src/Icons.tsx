import type { CSSProperties } from 'react';

export type IconName = 'plus' | 'chat' | 'search' | 'link' | 'arrow' | 'chevron' | 'menu' | 'close' | 'refresh' | 'check' | 'alert' | 'lock' | 'logout' | 'copy' | 'book' | 'server';
const paths: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14', chat: 'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-5 3V11.5A7.5 7.5 0 0 1 10.5 4H13a7 7 0 0 1 7 7.5Z',
  search: 'M20 20l-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  link: 'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l2-2',
  arrow: 'M12 19V5m-6 6 6-6 6 6', chevron: 'm9 5 7 7-7 7', menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M6 18 18 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 6.1a8 8 0 0 1 13.2 3.3M4.7 14.6a8 8 0 0 0 13.2 3.3',
  check: 'm5 12 4 4L19 6', alert: 'M12 8v5m0 3v.01M10.3 3.8 2.4 18a1.4 1.4 0 0 0 1.2 2h16.8a1.4 1.4 0 0 0 1.2-2L13.7 3.8a2 2 0 0 0-3.4 0Z',
  lock: 'M6 10h12v10H6ZM8 10V7a4 4 0 0 1 8 0v3m-4 4v2', logout: 'M9 4H4v16h5m5-13 5 5-5 5M9 12h10',
  copy: 'M9 8h11v13H9ZM5 16H3V3h11v2', book: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1Zm0 0v15',
  server: 'M3 3h18v7H3Zm0 11h18v7H3ZM7 6.5h.01M7 17.5h.01',
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Mark({ large = false }: { large?: boolean }) {
  return <span className={`brand-mark${large ? ' brand-mark-large' : ''}`} aria-hidden="true"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 21V11a5 5 0 0 1 5-5h3v15M15 7h3a5 5 0 0 1 5 5v9M5 15h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const colors = ['rose', 'sage', 'blue', 'sand'];
  const index = Array.from(name).reduce((n, c) => n + (c.codePointAt(0) ?? 0), 0) % colors.length;
  return <span className={`avatar avatar-${colors[index]}${large ? ' avatar-large' : ''}`} aria-hidden="true" style={{ '--avatar-index': index } as CSSProperties}>{Array.from(name.trim())[0]?.toLocaleUpperCase() || <Icon name="plus" />}</span>;
}
