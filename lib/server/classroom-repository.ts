import { ObjectId } from 'mongodb';
import { getCollections, getMongo } from '@/lib/server/mongodb';
import type { ChatSession } from '@/lib/types/chat';
import type { Scene, Stage } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import type { StageListItem, StageStoreData } from '@/lib/utils/stage-storage';

export interface PersistClassroomInput {
  id: string;
  stage: Stage;
  scenes: Scene[];
  currentSceneId?: string | null;
  chats?: ChatSession[];
  outlines?: SceneOutline[];
}

function firstSlideFromScenes(scenes: Scene[]) {
  const firstSlide = scenes.find((s) => s.content?.type === 'slide');
  return firstSlide?.content?.type === 'slide' ? firstSlide.content.canvas : undefined;
}

export async function saveClassroomForUser(
  userId: ObjectId,
  input: PersistClassroomInput,
): Promise<StageStoreData> {
  const { db } = await getMongo();
  const c = getCollections(db);
  const now = new Date();
  const stageId = input.id || input.stage.id;
  const stage: Stage = {
    ...input.stage,
    id: stageId,
    createdAt: input.stage.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  const scenes = input.scenes.map((scene, index) => ({
    ...scene,
    stageId,
    order: scene.order ?? index,
    createdAt: scene.createdAt || Date.now(),
    updatedAt: scene.updatedAt || Date.now(),
  }));

  await c.classrooms.updateOne(
    { userId, stageId },
    {
      $set: {
        userId,
        stageId,
        stage,
        currentSceneId: input.currentSceneId ?? scenes[0]?.id ?? null,
        outlines: input.outlines || [],
        sceneCount: scenes.length,
        firstSlide: firstSlideFromScenes(scenes),
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        createdAt: now,
      },
    },
    { upsert: true },
  );

  await c.classroomScenes.deleteMany({ userId, stageId });
  if (scenes.length > 0) {
    await c.classroomScenes.insertMany(
      scenes.map((scene) => ({
        _id: new ObjectId(),
        userId,
        stageId,
        sceneId: scene.id,
        order: scene.order,
        scene,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  await c.chatSessions.deleteMany({ userId, stageId });
  const chats = input.chats || [];
  if (chats.length > 0) {
    await c.chatSessions.insertMany(
      chats.map((session) => ({
        _id: new ObjectId(),
        userId,
        stageId,
        sessionId: session.id,
        session,
        createdAt: new Date(session.createdAt || Date.now()),
        updatedAt: new Date(session.updatedAt || Date.now()),
      })),
    );
  }

  return {
    stage,
    scenes,
    currentSceneId: input.currentSceneId ?? scenes[0]?.id ?? null,
    chats,
  };
}

export async function listClassroomsForUser(userId: ObjectId): Promise<StageListItem[]> {
  const { db } = await getMongo();
  const classrooms = await getCollections(db)
    .classrooms.find({ userId })
    .sort({ updatedAt: -1 })
    .toArray();

  return classrooms.map((record) => ({
    id: record.stageId,
    name: record.stage.name,
    description: record.stage.description,
    sceneCount: record.sceneCount,
    createdAt: record.stage.createdAt,
    updatedAt: record.stage.updatedAt,
    interactiveMode: record.stage.interactiveMode,
  }));
}

export async function readClassroomForUser(
  userId: ObjectId,
  stageId: string,
): Promise<(StageStoreData & { outlines: SceneOutline[] }) | null> {
  const { db } = await getMongo();
  const c = getCollections(db);
  const classroom = await c.classrooms.findOne({ userId, stageId });
  if (!classroom) return null;

  const [sceneDocs, chatDocs] = await Promise.all([
    c.classroomScenes.find({ userId, stageId }).sort({ order: 1 }).toArray(),
    c.chatSessions.find({ userId, stageId }).sort({ createdAt: 1 }).toArray(),
  ]);

  const scenes = sceneDocs.map((doc) => doc.scene);
  return {
    stage: classroom.stage,
    scenes,
    currentSceneId: classroom.currentSceneId ?? scenes[0]?.id ?? null,
    chats: chatDocs.map((doc) => doc.session),
    outlines: classroom.outlines || [],
  };
}

export async function deleteClassroomForUser(userId: ObjectId, stageId: string): Promise<void> {
  const { db } = await getMongo();
  const c = getCollections(db);
  await Promise.all([
    c.classrooms.deleteOne({ userId, stageId }),
    c.classroomScenes.deleteMany({ userId, stageId }),
    c.chatSessions.deleteMany({ userId, stageId }),
  ]);
}

export async function renameClassroomForUser(
  userId: ObjectId,
  stageId: string,
  name: string,
): Promise<void> {
  const { db } = await getMongo();
  await getCollections(db).classrooms.updateOne(
    { userId, stageId },
    {
      $set: {
        'stage.name': name,
        'stage.updatedAt': Date.now(),
        updatedAt: new Date(),
      },
    },
  );
}
