// Tiny classname helper (like clsx but zero-dependency)
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
