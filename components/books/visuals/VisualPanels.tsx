'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CompositionPlan, Stage25dPlan, VisualForecast, VisualProfile } from '@/lib/story-types';
import type { EntityVisual } from '@/lib/visuals';
import { Badge, ModelSection, Panel, StatGrid } from '@/components/books/model/ModelPrimitives';

function Collapsible({ header, badges, children }: { header: string; badges?: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className='rounded-lg border border-border bg-background'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className='flex w-full items-center justify-between gap-3 px-3 py-2 text-left'
      >
        <span className='min-w-0 flex-1 truncate text-sm font-medium'>{header}</span>
        <span className='flex flex-wrap items-center justify-end gap-1'>
          {badges?.map((badge) => (
            <Badge key={badge}>{badge}</Badge>
          ))}
          <ChevronDown
            aria-hidden='true'
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && <div className='space-y-3 border-t border-border p-3 text-sm'>{children}</div>}
    </div>
  );
}

export function ProfilePanel({ profile, forecast, notes }: { profile: VisualProfile; forecast: VisualForecast; notes: string[] }) {
  const rows = [
    { label: 'Style', value: `${profile.artStyle} (${profile.medium})` },
    { label: 'Lens', value: profile.lens },
    { label: 'Lighting', value: profile.lighting },
    { label: 'Texture', value: profile.texture },
    { label: 'Era', value: profile.eraDetails },
  ].filter((row) => row.value);
  return (
    <Panel title={`Visual profile v${profile.version}`} description='One visual language for every image of the book.'>
      <dl className='space-y-2 text-sm'>
        {rows.map((row) => (
          <div key={row.label} className='grid gap-1 sm:grid-cols-[120px_1fr]'>
            <dt className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className='mt-4 flex flex-wrap gap-2'>
        {profile.palette.map((colour) => (
          <span key={colour} className='flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs'>
            {/^#[0-9a-f]{3,8}$/i.test(colour) && (
              <span className='h-3 w-3 rounded-full border border-border' style={{ backgroundColor: colour }} />
            )}
            {colour}
          </span>
        ))}
      </div>
      <p className='mt-3 text-xs text-muted-foreground'>Never: {profile.negativeRules.join(', ')}</p>
      <div className='mt-5'>
        <StatGrid
          stats={[
            { label: 'Compositions', value: String(forecast.compositions) },
            { label: 'Beats covered', value: String(forecast.shotsPlanned) },
            { label: 'Reuse rate', value: `${Math.round(forecast.reuseRate * 100)}%` },
            { label: 'Reference sheets', value: String(forecast.referenceSheets) },
            { label: 'State variants', value: String(forecast.stateVariants) },
            { label: 'Images to generate', value: String(forecast.imagesToGenerate) },
            { label: 'Cost / image', value: `$${forecast.costPerImageUsd.toFixed(3)}` },
            { label: 'Forecast cost', value: `$${forecast.estimatedCostUsd.toFixed(2)}` },
          ]}
        />
      </div>
      {notes.length > 0 && (
        <ul className='mt-3 space-y-1 text-xs text-muted-foreground'>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function EntityVisualCard({ entity }: { entity: EntityVisual }) {
  const variants = Object.entries(entity.stateVariants ?? {});
  return (
    <Collapsible header={entity.name} badges={[entity.type, entity.importance]}>
      <p>{entity.spec}</p>
      {entity.sourceFacts.length > 0 && (
        <ModelSection title='From the book' count={entity.sourceFacts.length}>
          <ul className='space-y-1 text-xs'>
            {entity.sourceFacts.map((fact) => (
              <li key={`${fact.key}-${fact.value}`}>
                <span className='font-medium'>{fact.key}:</span> {fact.value}{' '}
                <span className='font-mono text-primary'>{fact.paragraphIds.slice(0, 3).join(', ')}</span>
              </li>
            ))}
          </ul>
        </ModelSection>
      )}
      {entity.fills.length > 0 && (
        <ModelSection title='Invented where the book is silent' count={entity.fills.length}>
          <ul className='space-y-1 text-xs'>
            {entity.fills.map((fill) => (
              <li key={`${fill.key}-${fill.value}`}>
                <Badge tone='warn'>fill</Badge> <span className='font-medium'>{fill.key}:</span> {fill.value}
                <span className='text-muted-foreground'> — {fill.reason}</span>
              </li>
            ))}
          </ul>
        </ModelSection>
      )}
      {variants.length > 0 && (
        <ModelSection title='State variants' count={variants.length}>
          <ul className='space-y-1 text-xs'>
            {variants.map(([stateId, variant]) => (
              <li key={stateId}>
                <span className='font-medium'>{variant.label}</span>
                <span className='text-muted-foreground'> (from seq {variant.validFromSeq})</span>: {variant.spec}
              </li>
            ))}
          </ul>
        </ModelSection>
      )}
      {entity.preRevealSpec && (
        <p className='text-xs'>
          <span className='font-semibold'>Before the reveal:</span> {entity.preRevealSpec}
        </p>
      )}
      {entity.layout && (
        <p className='text-xs'>
          <span className='font-semibold'>Layout:</span> {entity.layout}
        </p>
      )}
      <ModelSection title='Reference sheet'>
        <p className='text-xs text-muted-foreground'>{entity.referenceSheet.views.join(' · ')}</p>
        <p className='wrap-anywhere rounded-md bg-muted p-2 font-mono text-[11px]'>{entity.referenceSheet.prompt}</p>
      </ModelSection>
    </Collapsible>
  );
}

function Stage25dSummary({ stage }: { stage: Stage25dPlan }) {
  const envelope = stage.cameraEnvelope;
  const safe = stage.plannedSafeCamera;
  return (
    <ModelSection title='2.5D plan'>
      <dl className='grid gap-2 text-xs sm:grid-cols-3'>
        <div>
          <dt className='font-semibold uppercase tracking-wider text-muted-foreground'>Beats ask for</dt>
          <dd className='mt-1'>
            pan {envelope.maxPanX} × {envelope.maxPanY} · zoom {envelope.maxZoom} · tilt {envelope.maxTilt}
          </dd>
        </div>
        <div>
          <dt className='font-semibold uppercase tracking-wider text-muted-foreground'>Planned safe camera</dt>
          <dd className='mt-1'>
            pan {safe.maxPanX} × {safe.maxPanY} · zoom {safe.maxZoom} · tilt {safe.maxTilt}
          </dd>
        </div>
        <div>
          <dt className='font-semibold uppercase tracking-wider text-muted-foreground'>Background canvas</dt>
          <dd className='mt-1'>
            {stage.backgroundCanvas.width} × {stage.backgroundCanvas.height} of frame (overscan{' '}
            {Math.round(stage.backgroundOverscan.x * 100)}% / {Math.round(stage.backgroundOverscan.y * 100)}%)
          </dd>
        </div>
      </dl>
    </ModelSection>
  );
}

export function CompositionCard({
  composition,
  nameOf,
}: {
  composition: CompositionPlan;
  nameOf: (entityId: string) => string;
}) {
  const shot = composition.shotSnapshot;
  return (
    <Collapsible
      header={shot.description}
      badges={[`${composition.usedIn.length} beats`, shot.framing, shot.timeOfDay]}
    >
      <p className='text-xs text-muted-foreground'>
        {composition.compositionId} · first in {composition.originEpisodeId}
        {composition.locationId ? ` · ${nameOf(composition.locationId)}` : ''}
      </p>
      <div className='flex flex-wrap gap-1'>
        {composition.entityStatesUsed.map((state) => (
          <Badge key={state.entityId}>{nameOf(state.entityId)}</Badge>
        ))}
      </div>
      {composition.stage25d && <Stage25dSummary stage={composition.stage25d} />}
      <ModelSection title='Layers' count={composition.layers.length}>
        {composition.layers.map((layer) => (
          <div key={layer.layerId} className='rounded-md border border-border p-2'>
            <div className='flex flex-wrap gap-1'>
              <Badge>{layer.role}</Badge>
              {layer.transparent && <Badge>transparent</Badge>}
              {layer.entityId && <Badge>{nameOf(layer.entityId)}</Badge>}
              {layer.depthRange && (
                <Badge>
                  depth {layer.depthRange[0]}–{layer.depthRange[1]}
                </Badge>
              )}
              {layer.renderMode && <Badge>{layer.renderMode}</Badge>}
              {composition.stage25d?.parallax[layer.layerId] !== undefined && (
                <Badge>parallax ×{composition.stage25d.parallax[layer.layerId]}</Badge>
              )}
            </div>
            <p className='mt-1 wrap-anywhere font-mono text-[11px]'>{layer.prompt}</p>
          </div>
        ))}
      </ModelSection>
      <ModelSection title='Used in'>
        <p className='wrap-anywhere font-mono text-[11px] text-primary'>
          {composition.usedIn.map((usage) => usage.beatId).join(', ')}
        </p>
      </ModelSection>
    </Collapsible>
  );
}
