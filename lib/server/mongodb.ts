import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';
import type { Stage, Scene } from '@/lib/types/stage';
import type { ChatSession } from '@/lib/types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation-types';

declare global {
  var __teacherMaicMongo:
    | {
        client: MongoClient;
        db: Db;
        indexesReady?: Promise<void>;
      }
    | undefined;
}

export type UserStatus = 'active' | 'disabled';

export interface UserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  status: UserStatus;
  profile: {
    nickname?: string;
    bio?: string;
    avatar?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface AuthSessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ClassroomDoc {
  _id: ObjectId;
  userId: ObjectId;
  stageId: string;
  stage: Stage;
  currentSceneId?: string | null;
  outlines: SceneOutline[];
  sceneCount: number;
  firstSlide?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassroomSceneDoc {
  _id: ObjectId;
  userId: ObjectId;
  stageId: string;
  sceneId: string;
  order: number;
  scene: Scene;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  stageId: string;
  sessionId: string;
  session: ChatSession;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuizStateDoc {
  _id: ObjectId;
  userId: ObjectId;
  sceneId: string;
  draft?: Record<string, string | string[]>;
  answers?: Record<string, string | string[]>;
  results?: unknown[];
  updatedAt: Date;
}

export interface UserSettingsDoc {
  _id: ObjectId;
  userId: ObjectId;
  key: string;
  value: unknown;
  updatedAt: Date;
}

export interface ClassroomJobDoc {
  _id: ObjectId;
  userId: ObjectId;
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  step: string;
  progress: number;
  message: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  inputSummary: {
    requirementPreview: string;
    hasPdf: boolean;
    pdfTextLength: number;
    pdfImageCount: number;
  };
  input: GenerateClassroomInput;
  classroomId?: string;
  scenesGenerated: number;
  totalScenes?: number;
  result?: {
    classroomId: string;
    url: string;
    scenesCount: number;
  };
  error?: string;
}

export interface AccountFileDoc {
  _id: ObjectId;
  userId: ObjectId;
  kind: string;
  filename: string;
  contentType: string;
  size: number;
  pathname: string;
  url: string;
  downloadUrl?: string;
  etag?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoCollections {
  users: Collection<UserDoc>;
  authSessions: Collection<AuthSessionDoc>;
  classrooms: Collection<ClassroomDoc>;
  classroomScenes: Collection<ClassroomSceneDoc>;
  chatSessions: Collection<ChatSessionDoc>;
  quizStates: Collection<QuizStateDoc>;
  userSettings: Collection<UserSettingsDoc>;
  classroomJobs: Collection<ClassroomJobDoc>;
  accountFiles: Collection<AccountFileDoc>;
}

function getMongoUri(): string {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    throw new Error('缺少 MONGO_URI 环境变量');
  }
  return uri;
}

function getMongoConfig(): { uri: string; dbName: string } {
  const uri = getMongoUri();
  const parsed = new URL(uri);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, '').trim());
  if (dbName) {
    return { uri, dbName };
  }

  return { uri, dbName: 'teachermaic' };
}

async function createMongo() {
  const { uri, dbName } = getMongoConfig();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  return {
    client,
    db,
  };
}

export async function getMongo() {
  if (!globalThis.__teacherMaicMongo) {
    globalThis.__teacherMaicMongo = await createMongo();
  }

  if (!globalThis.__teacherMaicMongo.indexesReady) {
    globalThis.__teacherMaicMongo.indexesReady = ensureMongoIndexes(
      globalThis.__teacherMaicMongo.db,
    );
  }

  await globalThis.__teacherMaicMongo.indexesReady;
  return globalThis.__teacherMaicMongo;
}

export function getCollections(db: Db): MongoCollections {
  return {
    users: db.collection<UserDoc>('users'),
    authSessions: db.collection<AuthSessionDoc>('authSessions'),
    classrooms: db.collection<ClassroomDoc>('classrooms'),
    classroomScenes: db.collection<ClassroomSceneDoc>('classroomScenes'),
    chatSessions: db.collection<ChatSessionDoc>('chatSessions'),
    quizStates: db.collection<QuizStateDoc>('quizStates'),
    userSettings: db.collection<UserSettingsDoc>('userSettings'),
    classroomJobs: db.collection<ClassroomJobDoc>('classroomJobs'),
    accountFiles: db.collection<AccountFileDoc>('accountFiles'),
  };
}

async function ensureMongoIndexes(db: Db): Promise<void> {
  const c = getCollections(db);
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.users.createIndex({ status: 1 }),
    c.authSessions.createIndex({ tokenHash: 1 }, { unique: true }),
    c.authSessions.createIndex({ userId: 1 }),
    c.authSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.classrooms.createIndex({ userId: 1, updatedAt: -1 }),
    c.classrooms.createIndex({ userId: 1, stageId: 1 }, { unique: true }),
    c.classroomScenes.createIndex({ userId: 1, stageId: 1, order: 1 }),
    c.classroomScenes.createIndex({ userId: 1, stageId: 1, sceneId: 1 }, { unique: true }),
    c.chatSessions.createIndex({ userId: 1, stageId: 1, sessionId: 1 }, { unique: true }),
    c.quizStates.createIndex({ userId: 1, sceneId: 1 }, { unique: true }),
    c.userSettings.createIndex({ userId: 1, key: 1 }, { unique: true }),
    c.classroomJobs.createIndex({ userId: 1, id: 1 }, { unique: true }),
    c.classroomJobs.createIndex({ id: 1 }, { unique: true }),
    c.accountFiles.createIndex({ userId: 1, createdAt: -1 }),
    c.accountFiles.createIndex({ pathname: 1 }, { unique: true }),
    c.accountFiles.createIndex({ url: 1 }, { unique: true }),
  ]);
}
