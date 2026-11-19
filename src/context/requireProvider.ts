/**
 * A context's value, or an error naming the provider it was read outside of.
 * The root layout (src/app/_layout.tsx) renders every provider; their
 * contexts default to null.
 */
export function requireProvider<T>(value: T | null, provider: string): T {
  if (value === null) throw new Error(`Read inside ${provider} (src/app/_layout.tsx)`);
  return value;
}
