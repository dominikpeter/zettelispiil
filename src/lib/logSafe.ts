/** an error for the server log without what users wrote: AI SDK errors carry the whole request (the prompt, with players'
 *  words and a player's "about me") and the model's text, so only the error's name and message are logged */
export const logSafe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : typeof e);
