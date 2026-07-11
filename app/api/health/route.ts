import { NextResponse } from 'next/server';
import {
  getServerProviders,
  getServerWebSearchProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';
import { getMongo } from '@/lib/server/mongodb';
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

export async function GET() {
  const database = await checkMongo();
  const healthy = database === 'ok';

  return NextResponse.json(
    {
      success: healthy,
      status: healthy ? 'ok' : 'degraded',
      version,
      checks: { database },
      capabilities: {
        llm: Object.keys(getServerProviders()).length > 0,
        webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
        tts: Object.keys(getServerTTSProviders()).length > 0,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
