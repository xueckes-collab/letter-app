export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Self-hosted login page - no external OAuth dependency.
export const getLoginUrl = (returnPath?: string) => {
  const base = "/login";
  if (returnPath) return `${base}?next=${encodeURIComponent(returnPath)}`;
  return base;
};
