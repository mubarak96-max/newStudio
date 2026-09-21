'use client';

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase';
import type { CompositionPlan, EntityVisualPlan, VisualPlanSummary } from './story-types';

export type EntityVisual = Omit<EntityVisualPlan, 'entityId'> & {
  entityId: string;
  name: string;
  type: string;
  importance: string;
};

export type VisualPlan = {
  summary: VisualPlanSummary | null;
  entities: EntityVisual[];
  compositions: CompositionPlan[];
};

const importanceRank: Record<string, number> = { major: 0, supporting: 1, minor: 2 };

export async function loadVisualPlan(
  bookId: string,
  lineage: { sourceId?: string; canonicalHash?: string }
): Promise<VisualPlan> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const store = db;
  const matches = (data: { sourceId?: string; canonicalHash?: string }) =>
    data.sourceId === lineage.sourceId && data.canonicalHash === lineage.canonicalHash;
  const [summarySnapshot, entitySnapshot, compositionSnapshot] = await Promise.all([
    getDoc(doc(store, 'books', bookId, 'derived', 'visualPlan')),
    getDocs(collection(store, 'books', bookId, 'entities')),
    getDocs(collection(store, 'books', bookId, 'compositions')),
  ]);
  const summary = summarySnapshot.data() as VisualPlanSummary | undefined;
  const entities = entitySnapshot.docs
    .map((item) => item.data())
    .filter((data) => matches(data) && typeof data.visual?.spec === 'string' && data.visual.spec)
    .map((data) => ({
      ...(data.visual as Omit<EntityVisualPlan, 'entityId' | 'fills'>),
      fills: (data.fills ?? []) as EntityVisualPlan['fills'],
      entityId: data.entityId as string,
      name: data.canonicalName as string,
      type: data.type as string,
      importance: data.importance as string,
    }))
    .sort(
      (left, right) =>
        (importanceRank[left.importance] ?? 3) - (importanceRank[right.importance] ?? 3) ||
        left.name.localeCompare(right.name)
    );
  const compositions = compositionSnapshot.docs
    .map((item) => item.data() as CompositionPlan)
    .filter(matches)
    .sort((left, right) => right.usedIn.length - left.usedIn.length);
  return { summary: summary && matches(summary) ? summary : null, entities, compositions };
}
