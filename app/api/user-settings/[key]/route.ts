import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

function clearProviderSecrets(configMap: unknown): void {
  if (!configMap || typeof configMap !== 'object') return;
  for (const config of Object.values(configMap as Record<string, unknown>)) {
    if (!config || typeof config !== 'object') continue;
    const record = config as Record<string, unknown>;
    if ('apiKey' in record) record.apiKey = '';
    if ('baseUrl' in record) record.baseUrl = '';
  }
}

function stripSettingsSecrets(key: string, value: string): string {
  if (key !== 'settings-storage') return value;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const state =
      parsed.state && typeof parsed.state === 'object'
        ? (parsed.state as Record<string, unknown>)
        : parsed;

    for (const field of [
      'providersConfig',
      'ttsProvidersConfig',
      'webSearchProvidersConfig',
    ]) {
      clearProviderSecrets(state[field]);
    }

    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { key } = await context.params;
    const { db } = await getMongo();
    const setting = await getCollections(db).userSettings.findOne({
      userId: user._id,
      key,
    });
    const value = typeof setting?.value === 'string' ? setting.value : null;
    return apiSuccess({ value });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '设置读取失败',
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { key } = await context.params;
    const body = (await req.json()) as { value?: unknown };
    if (typeof body.value !== 'string') {
      return apiError('INVALID_REQUEST', 400, '设置内容不正确');
    }

    const sanitizedValue = stripSettingsSecrets(key, body.value);
    const { db } = await getMongo();
    await getCollections(db).userSettings.updateOne(
      { userId: user._id, key },
      {
        $set: {
          value: sanitizedValue,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId(),
          userId: user._id,
          key,
        },
      },
      { upsert: true },
    );
    return apiSuccess({ updated: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '设置保存失败',
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { key } = await context.params;
    const { db } = await getMongo();
    await getCollections(db).userSettings.deleteOne({ userId: user._id, key });
    return apiSuccess({ deleted: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '设置删除失败',
    );
  }
}
