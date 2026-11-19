import * as vscode from 'vscode';
import { POLL_INTERVAL_MS, WAIT_TIMEOUT_MS } from '../../../src/config/constants';

export interface TestFileEntry {
  readonly repoRoot: string;
  readonly repoId: string;
  readonly repoName: string;
  readonly relativePath: string;
  readonly previousPath: string | null;
  readonly baseCommit: string;
  readonly kind: string;
}

export interface TestSnapshot {
  readonly viewMode: string;
  readonly scopeLabel: string;
  readonly scope: unknown;
  readonly fileCount: number;
  readonly fileKeys: string[];
  readonly reviewedKeys: string[];
  readonly errors: string[];
  readonly files: TestFileEntry[];
  readonly tree: TestTreeNode[];
  readonly activeEditor: {
    readonly uri: string;
    readonly scheme: string;
    readonly fsPath: string;
    readonly isReviewSession: boolean;
    readonly posture: string;
    readonly decorationLineCount: number;
  } | null;
}

export interface TestTreeNode {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: string;
  readonly additions: number;
  readonly deletions: number;
  readonly reviewed: boolean;
  readonly parentLabels: string[];
  readonly children: TestTreeNode[];
}

export async function getSnapshot(): Promise<TestSnapshot> {
  return (await vscode.commands.executeCommand('review-surface.internal.getSnapshot')) as TestSnapshot;
}

export async function getTree(): Promise<TestTreeNode[]> {
  return (await vscode.commands.executeCommand('review-surface.internal.getTree')) as TestTreeNode[];
}

export async function setScope(scope: unknown): Promise<TestSnapshot> {
  return (await vscode.commands.executeCommand('review-surface.internal.setScope', scope)) as TestSnapshot;
}

export async function refresh(): Promise<void> {
  await vscode.commands.executeCommand('review-surface.refresh');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await predicate()) {
      return;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function waitForFileKeys(expected: string[]): Promise<TestSnapshot> {
  const wanted = [...expected].sort();
  let latest: TestSnapshot | null = null;
  await waitFor(async () => {
    latest = await getSnapshot();
    const actual = [...(latest?.fileKeys ?? [])].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }).catch((error) => {
    const actual = latest ? [...latest.fileKeys].sort() : [];
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; expected=${JSON.stringify(wanted)} actual=${JSON.stringify(actual)} errors=${JSON.stringify(latest?.errors ?? null)}`
    );
  });
  if (!latest) {
    throw new Error('No snapshot observed');
  }
  return latest;
}

export function keyFor(repoRoot: string, relativePath: string): string {
  const posix = relativePath.replace(/\\/g, '/');
  return `${repoRoot}::${posix}`;
}

export function flattenTree(nodes: TestTreeNode[]): TestTreeNode[] {
  const out: TestTreeNode[] = [];
  const walk = (list: TestTreeNode[]): void => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
