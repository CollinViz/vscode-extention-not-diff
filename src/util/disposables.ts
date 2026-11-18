export interface DisposableLike {
  dispose(): void;
}

export class DisposableStore implements DisposableLike {
  private readonly items: DisposableLike[] = [];

  add<T extends DisposableLike>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose(): void {
    for (const item of this.items.splice(0)) {
      item.dispose();
    }
  }
}
