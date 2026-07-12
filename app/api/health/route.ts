import { NextResponse } from 'next/server';
import {
  getServerProviders,
  getServerWebSearchProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';
import { getMongo } from '@/lib/server/mongodb';
import { getStorageHealth } from '@/lib/server/file-storage';
import packageJson from '@/package.json';

const version = packageJson.version;

async function checkMongo(): Promise<'ok' | 'error'> {
  try {
    const { db } = await getMongo();
    await db.command({ ping: 1 });
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkStorage(): Promise<{
  status: 'ok' | 'error';
  freeBytes?: number;
  totalBytes?: number;
}> {
  try {
    const capacity = await getStorageHealth();
    return { status: 'ok', ...capacity };
  } catch {
    return { status: 'error' };
  }
}

export async function GET() {
  const [database, storage] = await Promise.all([checkMongo(), checkStorage()]);
  const healthy = database === 'ok' && storage.status === 'ok';

  return NextResponse.json(
    {
      success: healthy,
      status: healthy ? 'ok' : 'degraded',
      version,
      checks: { database, storage: storage.status },
      storage: {
        ...(storage.freeBytes !== undefined ? { freeBytes: storage.freeBytes } : {}),
        ...(storage.totalBytes !== undefined ? { totalBytes: storage.totalBytes } : {}),
      },
      capabilities: {
        llm: Object.keys(getServerProviders()).length > 0,
        webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
        tts: Object.keys(getServerTTSProviders()).length > 0,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
