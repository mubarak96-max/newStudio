'use client';

import type { Episode, StoryMap } from '@/lib/story-types';
import { Badge, ModelSection, Panel } from '@/components/books/model/ModelPrimitives';

type Props = {
  storyMap: StoryMap;
  episodes: Episode[];
  paragraphCount: number;
  nameOf: (entityId: string) => string;
};

/** Widths are proportional to paragraph span so the timeline reads as the book's shape. */
function Timeline({
  items,
  total,
  tone,
}: {
  items: { key: string; label: string; seqStart: number; seqEnd: number }[];
  total: number;
  tone: string;
}) {
  return (
    <div className='flex h-8 w-full overflow-hidden rounded-md border border-border'>
      {items.map((item, index) => (
        <div
          key={item.key}
          title={`${item.label} (seq ${item.seqStart}–${item.seqEnd})`}
          style={{ width: `${((item.seqEnd - item.seqStart + 1) / Math.max(1, total)) * 100}%` }}
          className={`flex items-center justify-center truncate border-r border-background px-1 text-[10px] font-medium ${
            index % 2 === 0 ? tone : 'bg-muted text-muted-foreground'
          }`}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

export function StoryMapPanel({ storyMap, episodes, paragraphCount, nameOf }: Props) {
  return (
    <Panel
      title='Story Map'
      description={`${storyMap.acts.length} acts · ${storyMap.arcs.length} arcs · ${episodes.length} episodes · ${storyMap.chronology.length} points in story time`}
    >
      <div className='space-y-6'>
        <div className='space-y-2'>
          <Timeline
            items={storyMap.acts.map((act) => ({ key: `act-${act.order}`, label: act.title, ...act }))}
            total={paragraphCount}
            tone='bg-primary/20 text-primary'
          />
          <Timeline
            items={episodes.map((episode) => ({
              key: episode.episodeId,
              label: String(episode.order),
              seqStart: episode.seqStart,
              seqEnd: episode.seqEnd,
            }))}
            total={paragraphCount}
            tone='bg-purple-500/20 text-purple-600'
          />
        </div>

        {storyMap.planning.notes.length > 0 && (
          <ul className='space-y-1 text-xs text-muted-foreground'>
            {storyMap.planning.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        <ModelSection title='Acts' count={storyMap.acts.length}>
          {storyMap.acts.map((act) => (
            <div key={act.order} className='rounded-lg border border-border bg-background p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-sm font-medium'>
                  {act.order}. {act.title}
                </p>
                <span className='text-xs text-muted-foreground'>
                  seq {act.seqStart}–{act.seqEnd} · {act.eventIds.length} events
                </span>
              </div>
              {act.summary && <p className='mt-1 text-sm text-muted-foreground'>{act.summary}</p>}
            </div>
          ))}
        </ModelSection>

        {storyMap.arcs.length > 0 && (
          <ModelSection title='Arcs' count={storyMap.arcs.length}>
            {storyMap.arcs.map((arc) => (
              <div key={arc.arcId} className='rounded-lg border border-border bg-background p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='text-sm font-medium'>{arc.title}</p>
                  <span className='text-xs text-muted-foreground'>{arc.eventIds.length} events</span>
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>{arc.summary}</p>
                {arc.entityIds.length > 0 && (
                  <div className='mt-2 flex flex-wrap gap-1'>
                    {arc.entityIds.map((id) => (
                      <Badge key={id}>{nameOf(id)}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </ModelSection>
        )}
      </div>
    </Panel>
  );
}
