import type {
  DatabaseSnapshot,
  PointSource,
} from "@/lib/local-db";

export type SearchResultKind = "project" | "feature" | "point";

export interface SearchFilters {
  projectId?: string;
  featureId?: string;
  source?: PointSource | "all";
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  projectId: string;
  projectName: string;
  featureId?: string;
  featureName?: string;
  targetId: string;
  text: string;
  date: string;
  source?: PointSource;
}

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
}

function matchesQuery(values: string[], queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return false;
  const words = values.flatMap(tokenize);
  return queryTokens.every((queryToken) => words.some((word) => word.startsWith(queryToken)));
}

export function searchDocumentation(
  snapshot: DatabaseSnapshot,
  query: string,
  filters: SearchFilters = {},
): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const activeProjects = snapshot.projects.filter((project) => project.deletedAt === null);
  const projectById = new Map(activeProjects.map((project) => [project.id, project]));
  const activeFeatures = snapshot.features.filter(
    (feature) => feature.deletedAt === null && projectById.has(feature.projectId),
  );
  const featureById = new Map(activeFeatures.map((feature) => [feature.id, feature]));
  const results: SearchResult[] = [];

  for (const project of activeProjects) {
    if (filters.projectId && filters.projectId !== project.id) continue;
    if (filters.featureId || filters.source && filters.source !== "all" || filters.dateFrom || filters.dateTo) continue;
    const searchable = [project.name, project.customerName, project.description, project.processFlow];
    if (matchesQuery(searchable, queryTokens)) {
      results.push({
        id: project.id,
        kind: "project",
        projectId: project.id,
        projectName: project.name,
        targetId: `project-${project.id}`,
        text: searchable.find((value) => matchesQuery([value], queryTokens)) ?? project.name,
        date: project.updatedAt,
      });
    }
  }

  for (const feature of activeFeatures) {
    const project = projectById.get(feature.projectId);
    if (!project || filters.projectId && filters.projectId !== project.id) continue;
    if (filters.featureId && filters.featureId !== feature.id) continue;
    if (filters.source && filters.source !== "all" || filters.dateFrom || filters.dateTo) continue;
    const searchable = [feature.name, feature.flowNotes];
    if (matchesQuery(searchable, queryTokens)) {
      results.push({
        id: feature.id,
        kind: "feature",
        projectId: project.id,
        projectName: project.name,
        featureId: feature.id,
        featureName: feature.name,
        targetId: `feature-${feature.id}`,
        text: searchable.find((value) => matchesQuery([value], queryTokens)) ?? feature.name,
        date: feature.updatedAt,
      });
    }
  }

  for (const point of snapshot.points) {
    if (point.deletedAt !== null) continue;
    const feature = featureById.get(point.featureId);
    const project = feature ? projectById.get(feature.projectId) : undefined;
    if (!feature || !project) continue;
    if (filters.projectId && filters.projectId !== project.id) continue;
    if (filters.featureId && filters.featureId !== feature.id) continue;
    if (filters.source && filters.source !== "all" && filters.source !== point.source) continue;
    if (filters.dateFrom && point.mentionedOn < filters.dateFrom) continue;
    if (filters.dateTo && point.mentionedOn > filters.dateTo) continue;
    if (!matchesQuery([point.content], queryTokens)) continue;
    results.push({
      id: point.id,
      kind: "point",
      projectId: project.id,
      projectName: project.name,
      featureId: feature.id,
      featureName: feature.name,
      targetId: `point-${point.id}`,
      text: point.content,
      date: point.mentionedOn,
      source: point.source,
    });
  }

  return results.sort((left, right) => {
    const byDate = right.date.localeCompare(left.date);
    if (byDate !== 0) return byDate;
    return left.kind.localeCompare(right.kind);
  });
}