export function appScrollBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    ? 'smooth'
    : 'instant';
}
