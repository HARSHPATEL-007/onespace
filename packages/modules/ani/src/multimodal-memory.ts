export type ModalityType =
  "text" | "chart" | "audio" | "video" | "tool_output" | "decision";

export interface ExperienceNode {
  id: string;
  modality: ModalityType;
  content: string;
  timestamp: string;
  links: string[];
  importance: number;
}

export class MultiModalMemory {
  private experiences: Map<string, ExperienceNode> = new Map();

  store(
    modality: ModalityType,
    content: string,
    links: string[] = [],
    importance = 0.5,
  ): ExperienceNode {
    const node: ExperienceNode = {
      id: "exp_" + Date.now().toString(36),
      modality,
      content,
      timestamp: new Date().toISOString(),
      links,
      importance,
    };
    this.experiences.set(node.id, node);
    return node;
  }

  linkExperiences(sourceId: string, targetId: string): void {
    const source = this.experiences.get(sourceId);
    if (source && !source.links.includes(targetId)) source.links.push(targetId);
  }

  getLinkedExperiences(nodeId: string): ExperienceNode[] {
    const node = this.experiences.get(nodeId);
    if (!node) return [];
    return node.links
      .map((id) => this.experiences.get(id))
      .filter(Boolean) as ExperienceNode[];
  }

  getByModality(modality: ModalityType): ExperienceNode[] {
    return [...this.experiences.values()].filter(
      (e) => e.modality === modality,
    );
  }
}
