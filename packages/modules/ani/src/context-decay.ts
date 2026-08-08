export interface MemoryItem {
  id: string;
  content: string;
  importance: number;
  lastAccessed: string;
  accessCount: number;
  createdAt: string;
}

export class ContextDecayModel {
  private items: Map<string, MemoryItem> = new Map();

  addItem(content: string, importance: number): MemoryItem {
    const item: MemoryItem = {
      id: "mem_" + Date.now().toString(36),
      content,
      importance,
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.items.set(item.id, item);
    return item;
  }

  access(itemId: string): MemoryItem | null {
    const item = this.items.get(itemId);
    if (!item) return null;
    item.lastAccessed = new Date().toISOString();
    item.accessCount++;
    return item;
  }

  decay(threshold = 0.2): string[] {
    const pruned: string[] = [];
    const now = Date.now();
    for (const [id, item] of this.items) {
      const score = this._decayScore(item, now);
      if (score < threshold) {
        this.items.delete(id);
        pruned.push(id);
      }
    }
    return pruned;
  }

  private _decayScore(item: MemoryItem, now: number): number {
    const ageHours = (now - Date.parse(item.createdAt)) / (1000 * 60 * 60);
    const recencyHours =
      (now - Date.parse(item.lastAccessed)) / (1000 * 60 * 60);
    const accessBoost = Math.log2(item.accessCount + 1) * 0.1;
    return (
      item.importance *
        Math.exp(-ageHours / 168) *
        Math.exp(-recencyHours / 24) +
      accessBoost
    );
  }

  getActiveItems(): MemoryItem[] {
    return [...this.items.values()].sort((a, b) => b.importance - a.importance);
  }
}
