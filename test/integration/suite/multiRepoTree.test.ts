import * as assert from 'node:assert';
import { keyFor } from '../support/extensionApi';
import { flattenTree, getSnapshot, getTree, waitForFileKeys } from '../support/extensionApi';
import { ensureMultiRepoBaseline } from '../support/baseline';

describe('multi-repo discovery and pruned tree', function () {
  let repoA = '';
  let repoB = '';
  let expected: string[] = [];

  before(async () => {
    const baseline = await ensureMultiRepoBaseline();
    repoA = baseline.repoA;
    repoB = baseline.repoB;
    expected = baseline.expected;
  });

  it('lists changed files from both repos', async () => {
    const snapshot = await waitForFileKeys(expected);
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'lib/utils/random.ts')));
    assert.ok(snapshot.fileKeys.includes(keyFor(repoB, 'src/index.ts')));
  });

  it('excludes untouched siblings outside the window', async () => {
    const snapshot = await getSnapshot();
    assert.ok(!snapshot.fileKeys.includes(keyFor(repoA, 'lib/untouched/skip.ts')));
    assert.ok(!snapshot.fileKeys.includes(keyFor(repoA, 'other/nope.ts')));
  });

  it('shows repo badges on file nodes', async () => {
    const tree = await getTree();
    const files = flattenTree(tree).filter((node) => node.kind === 'file');
    assert.ok(files.length > 0);
    for (const file of files) {
      assert.ok(file.description === 'repoA' || file.description === 'repoB', `missing repo badge on ${file.label}`);
    }
  });

  it('keeps pruned hierarchy without untouched directories', async () => {
    const tree = await getTree();
    const all = flattenTree(tree);
    const labels = all.map((node) => node.label);
    assert.ok(!labels.includes('untouched'));
    assert.ok(!labels.includes('other'));
    assert.ok(all.some((node) => node.kind === 'repo'));
  });

  it('shows both repos at the top level', async () => {
    const tree = await getTree();
    const repos = tree.filter((node) => node.kind === 'repo').map((node) => node.label);
    assert.ok(repos.includes('repoA'));
    assert.ok(repos.includes('repoB'));
  });
});
