/*
 * Retries a dynamic import that failed to load (a dropped connection, or a chunk replaced by
 * a new deploy while the page was open), waiting a little longer each time.
 */
export async function retryImport<T>(load: () => Promise<T>, attempts = 3, delayMs = 400): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
