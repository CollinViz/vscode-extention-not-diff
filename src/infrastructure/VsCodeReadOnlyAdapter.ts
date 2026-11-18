import type { IReadOnlyAdapter } from '../domain/ports';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export class VsCodeReadOnlyAdapter implements IReadOnlyAdapter {
  constructor(private readonly vscodeApi: VscodeLike) {}

  async setSessionReadOnly(readOnly: boolean): Promise<void> {
    if (readOnly) {
      await this.vscodeApi.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
      return;
    }
    try {
      await this.vscodeApi.commands.executeCommand('workbench.action.files.resetActiveEditorReadonlyInSession');
    } catch {
      await this.vscodeApi.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
    }
  }
}
