// Non-critical helpers: formatters and feature-detection utils, loaded lazily
export function fancyFormat(input: string): string {
  // Simulate heavier formatting
  return input
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((w) => `«${w}»`)
    .join(' ');
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      // @ts-ignore
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    );
  } catch {
    return false;
  }
}

export function logEnvironment(): void {
  console.debug('[nc-helpers] env', {
    ua: navigator.userAgent,
    lang: navigator.language,
    online: navigator.onLine,
    width: window.innerWidth,
    height: window.innerHeight,
  });
}