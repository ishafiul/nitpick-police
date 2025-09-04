import fetch from 'node-fetch';
import { ConfigManager } from '../config';

export type QdrantValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  serverInfo?: {
    status: string;
    version?: string | undefined;
    collections?: number | undefined;
    url?: string | undefined;
  };
};

export async function testQdrantConnection(url: string, timeoutMs: number = 5000): Promise<{ success: boolean; responseTime: number; version?: string | undefined; error?: string | undefined; }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url.replace(/\/$/, '')}/`, { signal: controller.signal as any });
    clearTimeout(id);
    const responseTime = Date.now() - start;
    if (!(res as any).ok) return { success: false, responseTime, error: (res as any).statusText };
    let version: string | undefined;
    try {
      const data: any = await (res as any).json();
      version = (data && (data.version || data.app || data.status)) as string | undefined;
    } catch {}
    return { success: true, responseTime, version };
  } catch (e) {
    return { success: false, responseTime: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchCollectionsCount(url: string, timeoutMs: number = 5000): Promise<number | undefined> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url.replace(/\/$/, '')}/collections`, { signal: controller.signal as any });
    clearTimeout(id);
    if (!(res as any).ok) return undefined;
    const data: any = await (res as any).json();
    if (Array.isArray(data?.result?.collections)) return data.result.collections.length;
    if (Array.isArray(data?.collections)) return data.collections.length;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function validateQdrantEnvironment(): Promise<QdrantValidationResult> {
  const result: QdrantValidationResult = { isValid: true, errors: [], warnings: [] };

  // Resolve URL: env override, then config, then localhost
  const env: Record<string, string | undefined> = process.env as any;
  let url = env['QDRANT_URL'];
  try {
    if (!url) {
      const cm = new ConfigManager();
      await cm.loadConfig();
      url = cm.get('qdrant.url') || undefined;
    }
  } catch {
    // ignore config load errors here; fall back below
  }
  url = url || 'http://localhost:6333';

  const health = await testQdrantConnection(url, 5000);
  if (!health.success) {
    result.isValid = false;
    result.errors.push(`Cannot reach Qdrant at ${url}: ${health.error || 'unknown error'}`);
    result.serverInfo = { status: 'unreachable', version: undefined, collections: undefined, url };
    return result;
  }

  const collectionsCount = await fetchCollectionsCount(url, 5000);
  result.serverInfo = { status: 'ok', version: health.version, collections: collectionsCount, url };

  if (collectionsCount === 0) {
    result.warnings.push('No collections found. You may need to initialize collections.');
  }

  return result;
}

export function printValidationResults(result: QdrantValidationResult): void {
  const url = result.serverInfo?.url ? ` (${result.serverInfo.url})` : '';
  if (result.isValid) {
    console.log(`✅ Qdrant environment valid${url}`);
  } else {
    console.log(`❌ Qdrant environment invalid${url}`);
  }
  if (result.serverInfo) {
    console.log(`   Status: ${result.serverInfo.status}`);
    if (result.serverInfo.version) console.log(`   Version: ${result.serverInfo.version}`);
    if (typeof result.serverInfo.collections === 'number') console.log(`   Collections: ${result.serverInfo.collections}`);
  }
  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }
  if (result.warnings.length > 0) {
    console.log('Warnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }
}
