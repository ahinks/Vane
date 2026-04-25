import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface HealthItem {
  name: string;
  status: 'ok' | 'fail' | 'warn';
  latency_ms?: number;
  detail?: string;
}

export const GET = async () => {
  const checks: HealthItem[] = [];
  const start = Date.now();

  // 1. Vane process
  try {
    const out = execSync(
      "systemctl --user show vane --property ActiveState --value",
      { timeout: 5000 },
    )
      .toString()
      .trim();
    checks.push({
      name: 'vane',
      status: out === 'active' ? 'ok' : 'fail',
      detail: `ActiveState=${out}`,
    });
  } catch {
    checks.push({ name: 'vane', status: 'fail', detail: 'systemctl failed' });
  }

  // 2. llama-server on 8081 (Vane model)
  const t0 = Date.now();
  try {
    const r = await axios.get('http://localhost:8081/v1/models', { timeout: 3000 });
    checks.push({
      name: 'llama-8081',
      status: r.status === 200 ? 'ok' : 'fail',
      latency_ms: Date.now() - t0,
      detail: `HTTP ${r.status}`,
    });
  } catch (e: any) {
    checks.push({
      name: 'llama-8081',
      status: 'fail',
      latency_ms: Date.now() - t0,
      detail: e.message,
    });
  }

  // 3. SearXNG (host network port 9083)
  const t1 = Date.now();
  try {
    const r = await axios.get('http://localhost:9083', { timeout: 3000 });
    checks.push({
      name: 'searxng',
      status: r.status === 200 ? 'ok' : 'warn',
      latency_ms: Date.now() - t1,
      detail: `HTTP ${r.status}`,
    });
  } catch (e: any) {
    checks.push({
      name: 'searxng',
      status: 'fail',
      latency_ms: Date.now() - t1,
      detail: e.message,
    });
  }

  // 4. Quick search endpoint (internal health)
  const t2 = Date.now();
  try {
    const r = await axios.get('http://localhost:3000/api/vane/quick?q=test', {
      timeout: 5000,
    });
    checks.push({
      name: 'vane-quick-api',
      status: r.status === 200 ? 'ok' : 'fail',
      latency_ms: Date.now() - t2,
      detail: `HTTP ${r.status}, results=${r.data.count ?? r.data.error}`,
    });
  } catch (e: any) {
    checks.push({
      name: 'vane-quick-api',
      status: 'fail',
      latency_ms: Date.now() - t2,
      detail: e.message,
    });
  }

  const all_ok = checks.every((c) => c.status === 'ok');
  const total_ms = Date.now() - start;

  return NextResponse.json(
    {
      status: all_ok ? 'ok' : 'degraded',
      total_ms,
      checks,
    },
    { status: all_ok ? 200 : 503 },
  );
};
