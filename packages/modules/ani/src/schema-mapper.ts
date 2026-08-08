export interface SchemaMapping {
  sourceApp: string;
  targetApp: string;
  fieldMap: Record<string, string>;
  transformations: Array<{ from: string; to: string; transform: string }>;
}

export class CrossAppSchemaMapper {
  private mappings: SchemaMapping[] = [];

  learn(sourceApp: string, targetApp: string, examples: Array<{ source: Record<string, unknown>; target: Record<string, unknown> }>): void {
    if (examples.length === 0) return;
    const fieldMap: Record<string, string> = {};
    const sourceKeys = Object.keys(examples[0]?.source ?? {});
    const targetKeys = Object.keys(examples[0]?.target ?? {});
    for (let i = 0; i < Math.min(sourceKeys.length, targetKeys.length); i++) {
      fieldMap[sourceKeys[i] ?? ""] = targetKeys[i] ?? "";
    }
    this.mappings.push({ sourceApp, targetApp, fieldMap, transformations: [] });
  }

  mapData(sourceApp: string, targetApp: string, data: Record<string, unknown>): Record<string, unknown> {
    const mapping = this.mappings.find((m) => m.sourceApp === sourceApp && m.targetApp === targetApp);
    if (!mapping) return data;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      const targetKey = mapping.fieldMap[key] ?? key;
      result[targetKey] = val;
    }
    return result;
  }
}
