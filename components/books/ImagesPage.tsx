'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { AssetCard, type AssetDependency } from '@/components/books/images/AssetCard';
import { StageFrame } from '@/components/books/pipeline/StageFrame';
import { useBookData } from '@/components/books/pipeline/useBookData';
import { Badge } from '@/components/books/model/ModelPrimitives';
import type { Book } from '@/lib/books';
import { BatchPanel } from '@/components/books/images/BatchPanel';
import {
  approveVersion,
  assetTargetId,
  requestImage,
  requestImageBatch,
  subscribeImageBatches,
  subscribeVisualAssets,
  type AssetTarget,
  type ImageBatch,
  type VisualAsset,
} from '@/lib/images';
import { loadStoryPlan } from '@/lib/story';
import type { CompositionPlan } from '@/lib/story-types';
import { loadVisualPlan } from '@/lib/visuals';

const noTarget = { entityId: null, stateId: null, compositionId: null, layerId: null };
const referenceTarget = (entityId: string): AssetTarget => ({ ...noTarget, kind: 'reference', entityId });
const variantTarget = (entityId: string, stateId: string): AssetTarget => ({ ...noTarget, kind: 'variant', entityId, stateId });
const layerTarget = (compositionId: string, layerId: string): AssetTarget => ({ ...noTarget, kind: 'layer', compositionId, layerId });

export function ImagesPage({ bookId }: { bookId: string }) {
  const load = useCallback(async (book: Book) => {
    const lineage = { sourceId: book.activeSourceId, canonicalHash: book.canonical?.hash };
    const [visuals, story] = await Promise.all([loadVisualPlan(bookId, lineage), loadStoryPlan(bookId, lineage)]);
    return { visuals, episodes: story.episodes };
  }, [bookId]);
  const { book, data, loading, error, nameOf } = useBookData(bookId, load);
  const [assets, setAssets] = useState<Map<string, VisualAsset>>(new Map());
  const [assetError, setAssetError] = useState<string | null>(null);
  const [view, setView] = useState<string>('references');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const sourceId = book?.activeSourceId;
  const canonicalHash = book?.canonical?.hash;
  const [batches, setBatches] = useState<ImageBatch[]>([]);
  const [selection, setSelection] = useState<Map<string, { target: AssetTarget; note: string | null }>>(new Map());
  useEffect(() => {
    if (!sourceId || !canonicalHash) return;
    const onError = (err: unknown) => setAssetError(err instanceof Error ? err.message : 'Could not read images.');
    const stopAssets = subscribeVisualAssets(bookId, { sourceId, canonicalHash }, setAssets, onError);
    const stopBatches = subscribeImageBatches(bookId, { sourceId, canonicalHash }, setBatches, onError);
    return () => {
      stopAssets();
      stopBatches();
    };
  }, [bookId, sourceId, canonicalHash]);

  const toggleBatch = (target: AssetTarget) => (note: string | null) =>
    setSelection((current) => {
      const next = new Map(current);
      const id = assetTargetId(target);
      if (next.has(id)) next.delete(id);
      else next.set(id, { target, note });
      return next;
    });
  const batchProps = (target: AssetTarget) => ({
    inBatch: selection.has(assetTargetId(target)),
    onToggleBatch: toggleBatch(target),
  });
  const selectTargets = (targets: AssetTarget[]) =>
    setSelection((current) => {
      const next = new Map(current);
      for (const target of targets) {
        const id = assetTargetId(target);
        if (!next.has(id) && assets.get(id)?.status !== 'batched') next.set(id, { target, note: null });
      }
      return next;
    });
  const submitBatch = async () => {
    if (!sourceId || !canonicalHash) throw new Error('The book has no active source.');
    await requestImageBatch(bookId, [...selection.values()], { sourceId, canonicalHash });
    setSelection(new Map());
  };

  const isApproved = useCallback((targetId: string) => Boolean(assets.get(targetId)?.approvedVersionId), [assets]);
  const generate = (target: AssetTarget) => async (note: string | null) => {
    if (!sourceId || !canonicalHash) throw new Error('The book has no active source.');
    await requestImage(bookId, target, { sourceId, canonicalHash }, note);
  };
  const approve = (target: AssetTarget) => (versionId: string) => approveVersion(bookId, assetTargetId(target), versionId);

  const entities = useMemo(() => data?.visuals.entities ?? [], [data]);
  const episodes = useMemo(() => data?.episodes ?? [], [data]);
  const compositions = useMemo(() => data?.visuals.compositions ?? [], [data]);

  const referenceTargets = useMemo(
    () =>
      entities.flatMap((entity) => [
        referenceTarget(entity.entityId),
        ...Object.keys(entity.stateVariants ?? {}).map((stateId) => variantTarget(entity.entityId, stateId)),
      ]),
    [entities]
  );
  const approvedReferences = referenceTargets.filter((target) => isApproved(assetTargetId(target))).length;

  // Reading order inside an episode: by the first Beat that shows each composition.
  const episodeCompositions = useMemo(() => {
    const byEpisode = new Map<string, CompositionPlan[]>();
    for (const episode of episodes) {
      const used = compositions
        .map((composition) => ({ composition, first: composition.usedIn.find((usage) => usage.episodeId === episode.episodeId) }))
        .filter((item) => item.first)
        .sort((left, right) => left.first!.beatId.localeCompare(right.first!.beatId))
        .map((item) => item.composition);
      byEpisode.set(episode.episodeId, used);
    }
    return byEpisode;
  }, [episodes, compositions]);

  const layerDependencies = (composition: CompositionPlan, layerId: string): AssetDependency[] => {
    const layer = composition.layers.find((item) => item.layerId === layerId);
    if (!layer?.entityId) return [];
    if (layer.role === 'background') {
      return [{ label: `${nameOf(layer.entityId)} reference`, approved: isApproved(assetTargetId(referenceTarget(layer.entityId))) }];
    }
    const stateId = composition.entityStatesUsed.find((state) => state.entityId === layer.entityId)?.stateId ?? null;
    const variantApproved = stateId ? isApproved(assetTargetId(variantTarget(layer.entityId, stateId))) : false;
    return [
      {
        label: variantApproved ? `${nameOf(layer.entityId)} state variant` : `${nameOf(layer.entityId)} reference`,
        approved: variantApproved || isApproved(assetTargetId(referenceTarget(layer.entityId))),
      },
    ];
  };

  const selectedEpisode = episodes.find((episode) => episode.episodeId === view) ?? null;
  const shown = selectedEpisode ? (episodeCompositions.get(selectedEpisode.episodeId) ?? []) : [];
  const episodeLayerTargets = shown
    .filter((composition) => composition.originEpisodeId === view)
    .flatMap((composition) => composition.layers.map((layer) => layerTarget(composition.compositionId, layer.layerId)));
  const episodeLayers = episodeLayerTargets.map(assetTargetId);
  // What "select all" means on the current tab: the cards on screen.
  const viewTargets: AssetTarget[] = selectedEpisode
    ? episodeLayerTargets
    : entities
        .filter((entity) => typeFilter === 'all' || entity.type === typeFilter)
        .flatMap((entity) => [
          referenceTarget(entity.entityId),
          ...Object.keys(entity.stateVariants ?? {}).map((stateId) => variantTarget(entity.entityId, stateId)),
        ]);

  return (
    <StageFrame
      bookId={bookId}
      book={book}
      loading={loading}
      title='Images'
      icon={ImageIcon}
      subtitle={`${approvedReferences} of ${referenceTargets.length} references approved · Gemini 3.1 Flash Lite Image, now through OpenRouter or in half-price Gemini batches`}
      error={error ?? assetError}
      actions={null}
    >
      {entities.length === 0 ? (
        <div className='rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground'>
          No visual plan yet. Images become available once Visual planning finishes.
        </div>
      ) : (
        <>
          <div className='flex flex-wrap gap-2'>
            {[{ id: 'references', label: 'References' }, ...episodes.map((episode) => ({ id: episode.episodeId, label: `Episode ${episode.order}` }))].map((tab) => (
              <button
                key={tab.id}
                type='button'
                onClick={() => setView(tab.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  view === tab.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <BatchPanel
            selectedCount={selection.size}
            viewCount={viewTargets.length}
            onSelectAll={() => selectTargets(viewTargets)}
            onSelectUnapproved={() => selectTargets(viewTargets.filter((target) => !isApproved(assetTargetId(target))))}
            onClear={() => setSelection(new Map())}
            onSubmit={submitBatch}
            batches={batches}
          />

          {view === 'references' && (
            <>
              <p className='text-sm text-muted-foreground'>
                Approve reference sheets first: every scene layer is conditioned on the approved reference of what it shows.
              </p>
              <div className='flex flex-wrap gap-2'>
                {['all', 'character', 'location', 'object', 'group'].map((type) => (
                  <button
                    key={type}
                    type='button'
                    onClick={() => setTypeFilter(type)}
                    className={`rounded-full border px-3 py-1 text-xs capitalize ${
                      typeFilter === type ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <div className='grid gap-4 xl:grid-cols-2'>
                {entities
                  .filter((entity) => typeFilter === 'all' || entity.type === typeFilter)
                  .flatMap((entity) => [
                    <AssetCard
                      bookId={bookId}
                      key={`ref-${entity.entityId}`}
                      title={`${entity.name} — reference sheet`}
                      subtitle={`${entity.type} · ${entity.importance} · ${entity.referenceSheet.views.join(', ')}`}
                      asset={assets.get(assetTargetId(referenceTarget(entity.entityId)))}
                      plannedPrompt={entity.referenceSheet.prompt}
                      dependencies={[]}
                      onGenerate={generate(referenceTarget(entity.entityId))}
                      onApprove={approve(referenceTarget(entity.entityId))}
                      {...batchProps(referenceTarget(entity.entityId))}
                    />,
                    ...Object.entries(entity.stateVariants ?? {}).map(([stateId, variant]) => (
                      <AssetCard
                        bookId={bookId}
                        key={`var-${entity.entityId}-${stateId}`}
                        title={`${entity.name} — ${variant.label}`}
                        subtitle={`state variant from seq ${variant.validFromSeq}`}
                        asset={assets.get(assetTargetId(variantTarget(entity.entityId, stateId)))}
                        plannedPrompt={`${entity.spec} In this state: ${variant.spec}`}
                        dependencies={[
                          { label: `${entity.name} reference`, approved: isApproved(assetTargetId(referenceTarget(entity.entityId))) },
                        ]}
                        onGenerate={generate(variantTarget(entity.entityId, stateId))}
                        onApprove={approve(variantTarget(entity.entityId, stateId))}
                        {...batchProps(variantTarget(entity.entityId, stateId))}
                      />
                    )),
                  ])}
              </div>
            </>
          )}

          {selectedEpisode && (
            <>
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <span className='font-semibold'>{selectedEpisode.title}</span>
                <Badge>{shown.length} compositions</Badge>
                <Badge>
                  {episodeLayers.filter(isApproved).length} of {episodeLayers.length} new layers approved
                </Badge>
              </div>
              {shown.map((composition) => {
                const reused = composition.originEpisodeId !== selectedEpisode.episodeId;
                return (
                  <div key={composition.compositionId} className='space-y-3 rounded-xl border border-border p-4'>
                    <div className='flex flex-wrap items-start justify-between gap-2'>
                      <p className='text-sm'>{composition.shotSnapshot.description}</p>
                      <span className='flex flex-wrap gap-1'>
                        <Badge>{composition.usedIn.length} beats</Badge>
                        <Badge>{composition.shotSnapshot.framing}</Badge>
                        {reused && <Badge>made in {composition.originEpisodeId}</Badge>}
                      </span>
                    </div>
                    {reused ? (
                      <p className='text-xs text-muted-foreground'>
                        Reused from an earlier episode; generate and approve its layers there.
                      </p>
                    ) : (
                      <div className='grid gap-4 xl:grid-cols-2'>
                        {composition.layers.map((layer) => {
                          const target = layerTarget(composition.compositionId, layer.layerId);
                          return (
                            <AssetCard
                              bookId={bookId}
                              key={layer.layerId}
                              title={layer.entityId ? `${layer.role}: ${nameOf(layer.entityId)}` : layer.role}
                              subtitle={`depth ${layer.depthRange[0]}–${layer.depthRange[1]} · ${layer.renderMode}${layer.transparent ? ' · cut-out' : ''}`}
                              asset={assets.get(assetTargetId(target))}
                              plannedPrompt={layer.prompt}
                              dependencies={layerDependencies(composition, layer.layerId)}
                              onGenerate={generate(target)}
                              onApprove={approve(target)}
                              {...batchProps(target)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </StageFrame>
  );
}
