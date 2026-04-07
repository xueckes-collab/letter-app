/**
 * Snov.io API Service
 * Handles authentication, email finding, and domain search
 */
import { ENV } from "../_core/env";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getSnovioToken(clientId?: string, clientSecret?: string): Promise<string> {
  const cid = clientId || ENV.snovioClientId;
  const csecret = clientSecret || ENV.snovioClientSecret;

  // Only use cache for default credentials
  if (!clientId && cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch("https://api.snov.io/v1/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: cid,
      client_secret: csecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Snov.io auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Expire 5 minutes early to be safe
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

export async function validateSnovioCredentials(): Promise<{ valid: boolean; error?: string }> {
  try {
    const token = await getSnovioToken();
    return { valid: !!token };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

/**
 * Domain search - find company info and emails by domain
 */
export async function domainSearch(domain: string): Promise<{
  companyName?: string;
  industry?: string;
  size?: string;
  prospectsCount?: number;
  emailsCount?: number;
}> {
  const token = await getSnovioToken();

  // Start the search
  const startRes = await fetch("https://api.snov.io/v2/domain-search/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domain }),
  });

  if (!startRes.ok) {
    throw new Error(`Domain search start failed: ${startRes.status}`);
  }

  const startData = await startRes.json();
  const resultUrl = startData.links?.result;

  if (!resultUrl) {
    return {};
  }

  // Wait a moment then get results
  await new Promise((r) => setTimeout(r, 2000));

  const resultRes = await fetch(resultUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resultRes.ok) {
    return {};
  }

  const resultData = await resultRes.json();
  return {
    companyName: resultData.data?.company_name,
    industry: resultData.data?.industry,
    size: resultData.data?.size,
    prospectsCount: resultData.meta?.prospects_count,
    emailsCount: resultData.meta?.emails_count,
  };
}

/**
 * Find email by first name, last name, and domain
 */
export async function findEmailByName(
  firstName: string,
  lastName: string,
  domain: string
): Promise<{ email?: string; status?: string }> {
  const token = await getSnovioToken();

  const res = await fetch("https://api.snov.io/v1/get-emails-from-names", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      firstName,
      lastName,
      domain,
    }),
  });

  if (!res.ok) {
    return {};
  }

  const data = await res.json();
  if (data.data?.emails?.length > 0) {
    const best = data.data.emails[0];
    return { email: best.email, status: best.emailStatus };
  }

  return {};
}

/**
 * Verify an email address
 */
export async function verifyEmail(email: string): Promise<{
  status?: string;
  result?: string;
}> {
  const token = await getSnovioToken();

  // Add to verification
  const addRes = await fetch("https://api.snov.io/v1/add-emails-to-verification", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emails: [email] }),
  });

  if (!addRes.ok) {
    return {};
  }

  // Wait for verification
  await new Promise((r) => setTimeout(r, 3000));

  // Check result
  const checkRes = await fetch("https://api.snov.io/v1/get-emails-verification-status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emails: [email] }),
  });

  if (!checkRes.ok) {
    return {};
  }

  const checkData = await checkRes.json();
  if (checkData.data?.length > 0) {
    return {
      status: checkData.data[0].status,
      result: checkData.data[0].result,
    };
  }

  return {};
}
