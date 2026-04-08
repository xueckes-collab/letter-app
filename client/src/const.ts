export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Self-hosted login page - no external OAuth dependency.
export const getLoginUrl = (returnPath?: string) => {
  const base = "/login";
  if (returnPath) return `${base}?next=${encodeURIComponent(returnPath)}`;
  return base;
};
