/**
 * scraper-advanced.ts
 *
 * Calls the Python Scrapling wrapper (~/.hermes/scripts/scrapling_fetch.py)
 * for fast, Cloudflare-aware web scraping.
 *
 * Modes:
 *   - fast    : TLS impersonation via curl_cffi (default, fastest)
 *   - stealth : Cloudflare/Turnstile bypass
 *   - dynamic : Full Playwright/Chrome via DynamicFetcher
 *
 * Falls back to the existing Playwright-based Scraper if Scrapling fails.
 */

import { spawn } from 'child_process';

const SCRAPLING_SCRIPT = '/home/alexanderh/.hermes/scripts/scrapling_fetch.py';
const SCRAPLING_PYTHON = '/home/alexanderh/ai-tools/venv/bin/python3';
const SCRAPLING_TIMEOUT_MS = 20000;

export type ScrapingMode = 'fast' | 'stealth' | 'dynamic';

interface ScraplingResult {
  ok: boolean;
  title?: string;
  content?: string;
  url?: string;
  mode?: string;
  error?: string;
}

export interface AdvancedScrapingResult {
  content: string;
  title: string;
  method: 'scrapling-fast' | 'scrapling-stealth' | 'scrapling-dynamic' | 'playwright';
}

/**
 * Fetch a single URL using Scrapling.
 * Returns null on failure so callers can fall back to Playwright.
 */
export async function scrapeWithScrapling(
  url: string,
  mode: ScrapingMode = 'stealth',
): Promise<AdvancedScrapingResult | null> {
  return new Promise((resolve) => {
    const proc = spawn(SCRAPLING_PYTHON, [SCRAPLING_SCRIPT, '--url', url, '--mode', mode], {
      timeout: SCRAPLING_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      console.error(`[scraper-advanced] spawn error: ${err.message}`);
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[scraper-advanced] non-zero exit ${code}: ${stderr}`);
        resolve(null);
        return;
      }

      try {
        const parsed: ScraplingResult = JSON.parse(stdout.trim());
        if (!parsed.ok || !parsed.content) {
          console.error(`[scraper-advanced] Scrapling returned ok=false for ${url}: ${parsed.error}`);
          resolve(null);
          return;
        }

        resolve({
          content: `# ${parsed.title ?? 'No title'} - ${url}\n\n${parsed.content}`,
          title: parsed.title ?? 'Untitled',
          method: `scrapling-${mode}` as AdvancedScrapingResult['method'],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scraper-advanced] JSON parse error for ${url}: ${message}`);
        console.error(`[scraper-advanced] stdout: ${stdout.slice(0, 200)}`);
        resolve(null);
      }
    });

    // Safety timeout
    setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      resolve(null);
    }, SCRAPLING_TIMEOUT_MS + 1000);
  });
}

/**
 * Try Scrapling with escalating modes, then fall back to Playwright.
 * Returns the result from the first successful method.
 *
 * Priority order:
 *   1. Scrapling stealth (Cloudflare-aware) — best for most protected sites
 *   2. Scrapling fast (TLS impersonation) — fast for normal sites
 *   3. Scrapling dynamic (Playwright) — for JS-heavy sites
 *   4. Playwright fallback — last resort, expensive but handles everything
 */
export async function scrapeSmart(
  url: string,
  playwrightScrapeFn: () => Promise<{ content: string; title: string }>,
): Promise<AdvancedScrapingResult> {
  // Try stealth first (Cloudflare/Turnstile bypass, good for Reddit, HN, news)
  const stealthResult = await scrapeWithScrapling(url, 'stealth');
  if (stealthResult) return stealthResult;

  // Try fast mode (TLS impersonation, fastest)
  const fastResult = await scrapeWithScrapling(url, 'fast');
  if (fastResult) return fastResult;

  // Try dynamic (full JS rendering via Playwright)
  const dynamicResult = await scrapeWithScrapling(url, 'dynamic');
  if (dynamicResult) return dynamicResult;

  // All Scrapling modes failed — fall back to Playwright
  try {
    const playwrightResult = await playwrightScrapeFn();
    return {
      ...playwrightResult,
      method: 'playwright',
    };
  } catch (err: any) {
    throw new Error(`All scraping methods failed for ${url}: ${err.message}`);
  }
}
