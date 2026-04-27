import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRunDir } from '@/eval/shared/run-dir';

describe('createRunDir', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'run-dir-test-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates <base>/<sanitized-model>/<timestamp>/ and returns the path', () => {
    const runDir = createRunDir(tempRoot, 'kimi:moonshotai/kimi-k2.6');
    expect(runDir.startsWith(join(tempRoot, 'kimi-moonshotai-kimi-k2.6'))).toBe(true);
    expect(existsSync(runDir)).toBe(true);
  });

  it('sanitizes both : and / from the model string', () => {
    const runDir = createRunDir(tempRoot, 'kimi:moonshotai/kimi-k2.6/latest');
    expect(runDir).toContain('kimi-moonshotai-kimi-k2.6-latest');
    expect(runDir).not.toMatch(/[:/]kimi/);
  });

  it('timestamp segment has no colons or dots', () => {
    const runDir = createRunDir(tempRoot, 'x');
    const segments = runDir.split('/');
    const timestamp = segments[segments.length - 1];
    expect(timestamp).not.toContain(':');
    expect(timestamp).not.toContain('.');
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});
