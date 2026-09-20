'use client';

import type {
  BookModelEvent,
  BookWorld,
  ChapterSummary,
  ModelCoverage,
  ModelDiagnostics,
} from '@/lib/book-pipeline';
import { Badge, EvidenceRow, Panel, StatGrid } from './ModelPrimitives';

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

export function CoveragePanel({ coverage }: { coverage: ModelCoverage }) {
  const complete = coverage.stubbed === 0 && coverage.missingAnnotationIds.length === 0;
  return (
    <Panel
      title='Paragraph coverage'
      description='Every story paragraph carries an annotation. Placeholders mark the ones the model never described.'
    >
      <StatGrid
        stats={[
          { label: 'Story paragraphs', value: String(coverage.storyParagraphs) },
          {
            label: 'Annotated by model',
            value: `${coverage.annotatedByModel} (${percent(coverage.annotatedByModel, coverage.storyParagraphs)})`,
          },
          { label: 'Placeholders', value: String(coverage.stubbed) },
          { label: 'Content-filtered', value: String(coverage.filtered) },
          {
            label: 'With an event',
            value: `${coverage.withEvent} (${percent(coverage.withEvent, coverage.storyParagraphs)})`,
          },
          {
            label: 'With an entity',
            value: `${coverage.withEntity} (${percent(coverage.withEntity, coverage.storyParagraphs)})`,
          },
          {
            label: 'With a location',
            value: `${coverage.withLocation} (${percent(coverage.withLocation, coverage.storyParagraphs)})`,
          },
          { label: 'Missing', value: String(coverage.missingAnnotationIds.length) },
        ]}
      />
      {!complete && (
        <p className='mt-3 text-xs text-amber-600'>
          {coverage.stubbed} paragraphs carry placeholder annotations. Re-running the job retries
          them.
        </p>
      )}
    </Panel>
  );
}

export function WorldPanel({ world }: { world: BookWorld }) {
  const rows = [
    { label: 'Setting', value: world.setting },
    { label: 'Era', value: world.era },
    { label: 'Premise', value: world.premise },
    { label: 'Narration', value: world.narration },
    { label: 'Tone', value: world.tone },
  ].filter((row) => row.value);
  return (
    <Panel title='World'>
      <dl className='space-y-3'>
        {rows.map((row) => (
          <div key={row.label}>
            <dt className='text-[11px] uppercase tracking-wider text-muted-foreground'>
              {row.label}
            </dt>
            <dd className='mt-1 text-sm leading-relaxed'>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function ChapterPanel({ chapters }: { chapters: ChapterSummary[] }) {
  return (
    <Panel title='Chapters' description={`${chapters.length} chapters summarised from annotations.`}>
      <div className='space-y-3'>
        {chapters.map((chapter) => (
          <details key={chapter.chapterId} className='rounded-lg border border-border bg-background p-3'>
            <summary className='cursor-pointer text-sm font-medium'>
              {chapter.title}
              <span className='ml-2 text-xs font-normal text-muted-foreground'>
                seq {chapter.seqStart}–{chapter.seqEnd}
              </span>
            </summary>
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>{chapter.summary}</p>
          </details>
        ))}
      </div>
    </Panel>
  );
}

export function EventPanel({
  events,
  nameOf,
}: {
  events: BookModelEvent[];
  nameOf: (entityId: string) => string;
}) {
  return (
    <Panel
      title='Event chronology'
      description={`${events.length} source-grounded events in narration order; story order is shown where it differs.`}
    >
      <div className='space-y-3'>
        {events.map((event) => (
          <EvidenceRow
            key={event.eventId}
            title={`${event.order}. ${event.summary}`}
            detail={[
              `seq ${event.seqStart}–${event.seqEnd}`,
              `story order ${event.storyOrder}`,
              event.locationId ? `at ${nameOf(event.locationId)}` : null,
              event.participants.length > 0
                ? `with ${event.participants.map(nameOf).join(', ')}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            paragraphIds={event.paragraphIds}
            badges={[
              { label: event.kind },
              ...(event.isFlashback ? [{ label: 'flashback' }] : []),
              ...(event.verified ? [] : [{ label: 'quote unmatched', tone: 'warn' as const }]),
            ]}
          />
        ))}
      </div>
    </Panel>
  );
}

export function DiagnosticsPanel({
  diagnostics,
  nameOf,
}: {
  diagnostics: ModelDiagnostics;
  nameOf: (entityId: string) => string;
}) {
  return (
    <Panel
      title='Extraction diagnostics'
      description='What the merge step rejected or repaired while building this model.'
    >
      <StatGrid
        stats={[
          { label: 'Model calls', value: String(diagnostics.modelCalls) },
          { label: 'Repair rounds', value: String(diagnostics.repairRoundsRun) },
          { label: 'Dropped items', value: String(diagnostics.droppedItems) },
          { label: 'Unverified quotes', value: String(diagnostics.unverifiedItems) },
          { label: 'Re-pointed IDs', value: String(diagnostics.remappedEntityIds) },
          { label: 'Merges', value: String(diagnostics.merges.length) },
        ]}
      />
      {diagnostics.merges.length > 0 && (
        <div className='mt-3 space-y-2'>
          {diagnostics.merges.map((merge) => (
            <div
              key={`${merge.keepEntityId}-${merge.mergedEntityIds.join('-')}`}
              className='rounded-lg border border-border bg-background p-3 text-xs'
            >
              <span className='font-medium'>{nameOf(merge.keepEntityId)}</span>
              <span className='text-muted-foreground'>
                {' '}
                absorbed {merge.mergedEntityIds.join(', ')}
              </span>
              {merge.reason && <p className='mt-1 text-muted-foreground'>{merge.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function AliasConflictPanel({
  conflicts,
  nameOf,
}: {
  conflicts: { alias: string; entityIds: string[]; paragraphIds: string[] }[];
  nameOf: (entityId: string) => string;
}) {
  return (
    <div className='rounded-xl border border-amber-500/40 bg-amber-500/10 p-6'>
      <h3 className='text-sm font-semibold'>Alias conflicts requiring review</h3>
      <div className='mt-3 space-y-2'>
        {conflicts.map((conflict) => (
          <EvidenceRow
            key={`${conflict.alias}-${conflict.entityIds.join('-')}`}
            title={conflict.alias}
            detail={conflict.entityIds.map(nameOf).join(' or ')}
            paragraphIds={conflict.paragraphIds}
          />
        ))}
      </div>
    </div>
  );
}

export function SceneStrip({
  scenes,
  nameOf,
}: {
  scenes: { sceneId: string; seqStart: number; seqEnd: number; locationId: string | null; summary: string }[];
  nameOf: (entityId: string) => string;
}) {
  return (
    <Panel
      title='Scenes'
      description={`${scenes.length} contiguous runs of paragraphs sharing a location — the starting ranges for Moment planning.`}
    >
      <div className='flex flex-wrap gap-2'>
        {scenes.map((scene) => (
          <span
            key={scene.sceneId}
            title={scene.summary}
            className='rounded-lg border border-border bg-background px-3 py-2 text-xs'
          >
            <span className='font-medium'>
              {scene.seqStart}–{scene.seqEnd}
            </span>
            <span className='ml-2 text-muted-foreground'>
              {scene.locationId ? nameOf(scene.locationId) : 'unplaced'}
            </span>
          </span>
        ))}
      </div>
      {scenes.length === 0 && <Badge>no scenes derived</Badge>}
    </Panel>
  );
}
