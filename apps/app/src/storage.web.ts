// SecureStore doesn't exist on web - localStorage is the equivalent for a
// browser context. Same three-function interface as storage.native.ts.
export async function getItem(key: string): Promise<string | null> {
  return window.localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  window.localStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  window.localStorage.removeItem(key);
}
