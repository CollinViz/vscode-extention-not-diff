import * as path from 'node:path';
import Mocha from 'mocha';
import { INTEGRATION_TIMEOUT_MS } from '../../src/config/constants';

const SUITE_FILES = [
  'multiRepoTree.test.js',
  'flatListToggle.test.js',
  'scopeSwitching.test.js',
  'readOnlyAndEdit.test.js',
  'diffEscapeHatch.test.js',
  'changeNavigation.test.js',
  'branchScope.test.js'
];

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: INTEGRATION_TIMEOUT_MS });
  const suiteDir = path.resolve(__dirname, 'suite');
  for (const file of SUITE_FILES) {
    mocha.addFile(path.join(suiteDir, file));
  }
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
