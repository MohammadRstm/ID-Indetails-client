/** Whether a typed address looks like an email: something, an @, a domain with a dot. The API checks it too. */
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
