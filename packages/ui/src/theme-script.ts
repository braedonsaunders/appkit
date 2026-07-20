/** Script body for a framework's pre-hydration script facility (for example next/script). */
export function getThemeScript(storageKey = 'theme'): string {
  const key = JSON.stringify(storageKey).replaceAll('<', '\\u003c')
  return `(function(){try{var t=localStorage.getItem(${key});var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.classList.toggle('light',t==='light')}catch(_){}})()`
}
