/**
 * Whether the browser keeps what this site stores until the person clears it, or may clear it on its own: when space
 * runs low, or (Safari) after a week without a visit, unless the app is installed. Asking is free in most browsers;
 * Firefox asks the person.
 */
export const storageKept = async (): Promise<boolean | undefined> => {
  try {
    return await navigator.storage?.persisted?.();
  } catch {
    return undefined;
  }
};

export const askToKeepStorage = async (): Promise<boolean> => {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
};
