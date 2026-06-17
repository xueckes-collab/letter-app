import { describe, expect, it } from "vitest";
import {
  discoverCorePages,
  inferPageType,
  normalizeWebsiteUrl,
} from "./scrapling-crawler";

describe("crawler helper pure rules", () => {
  it("normalizes website URLs without requiring callers to include a protocol", () => {
    expect(normalizeWebsiteUrl(" Example.com/products/#intro ")).toBe(
      "https://example.com/products/",
    );
    expect(normalizeWebsiteUrl("HTTPS://ACME-FLOORING.COM/About-Us/#team")).toBe(
      "https://acme-flooring.com/About-Us/",
    );
  });

  it("rejects non-http website URLs during normalization", () => {
    expect(normalizeWebsiteUrl("")).toBeNull();
    expect(normalizeWebsiteUrl("mailto:sales@example.com")).toBeNull();
    expect(normalizeWebsiteUrl("tel:+15551234567")).toBeNull();
  });

  it("classifies key page types from URL path and anchor text", () => {
    expect(inferPageType("https://acme-flooring.com/").pageType).toBe("homepage");
    expect(inferPageType("https://acme-flooring.com/about-us").pageType).toBe("about");
    expect(inferPageType("https://acme-flooring.com/collections/lvt").pageType).toBe("products");
    expect(inferPageType("https://acme-flooring.com/case-studies/hotel").pageType).toBe("projects");
    expect(inferPageType("https://acme-flooring.com/sustainability").pageType).toBe("certifications");
    expect(inferPageType("https://acme-flooring.com/support", "Contact us").pageType).toBe("contact");
    expect(inferPageType("https://acme-flooring.com/news/market-trends").pageType).toBe("news");
    expect(inferPageType("https://acme-flooring.com/privacy-policy").pageType).toBe("other");
  });

  it("discovers and filters useful same-domain sources from static HTML", () => {
    const html = [
      '<a href="/products/lvt?utm_source=linkedin#intro">Luxury vinyl collections</a>',
      '<a href="https://www.acme-flooring.com/about-us">About our company</a>',
      '<a href="/case-studies/hotel-renovation">Hotel projects</a>',
      '<a href="https://competitor-flooring.com/products/lvt">Competitor product</a>',
      '<a href="/brochure.pdf">Download catalog</a>',
      '<a href="/cart">Cart</a>',
      '<a href="/login">Login</a>',
      '<a href="mailto:sales@acme-flooring.com">Email sales</a>',
    ].join("\n");

    const pages = discoverCorePages(html, "https://acme-flooring.com", 10);
    const urls = pages.map((page) => page.url);
    const pageTypes = pages.map((page) => page.pageType);

    expect(urls).toContain("https://acme-flooring.com/");
    expect(urls).toContain("https://acme-flooring.com/products/lvt");
    expect(urls).toContain("https://www.acme-flooring.com/about-us");
    expect(urls).toContain("https://acme-flooring.com/case-studies/hotel-renovation");
    expect(pageTypes).toEqual(expect.arrayContaining(["homepage", "products", "about", "projects"]));

    expect(urls.some((url) => url.includes("competitor-flooring.com"))).toBe(false);
    expect(urls.some((url) => url.endsWith(".pdf"))).toBe(false);
    expect(urls.some((url) => url.includes("/cart"))).toBe(false);
    expect(urls.some((url) => url.includes("/login"))).toBe(false);
    expect(urls.some((url) => url.startsWith("mailto:"))).toBe(false);
  });
});
