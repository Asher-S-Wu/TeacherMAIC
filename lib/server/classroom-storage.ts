import type { NextRequest } from 'next/server';
import type { ObjectId } from 'mongodb';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  saveClassroomForUser,
} from '@/lib/server/classroom-repository';

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function persistClassroom(
  userId: ObjectId,
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
    outlines?: SceneOutline[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const classroom = await saveClassroomForUser(userId, {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    outlines: data.outlines,
  });

  return {
    id: data.id,
    stage: classroom.stage,
    scenes: classroom.scenes,
    createdAt: new Date(classroom.stage.createdAt).toISOString(),
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
