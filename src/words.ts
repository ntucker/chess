/** `n` with `noun`, plural unless one: "1 point", "3 points". */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
