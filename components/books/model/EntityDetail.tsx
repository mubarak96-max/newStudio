'use client';

import type { BookModelEntity } from '@/lib/book-pipeline';
import { Badge, EvidenceRow, ModelSection } from './ModelPrimitives';

function changesLine(changes: Record<string, string>): string {
  return Object.entries(changes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

export function EntityDetail({
  entity,
  nameOf,
}: {
  entity: BookModelEntity;
  nameOf: (entityId: string) => string;
}) {
  const profile = entity.profile;
  return (
    <div className='space-y-5 rounded-xl border border-border bg-card p-6'>
      <div>
        <div className='flex flex-wrap items-center gap-2'>
          <h3 className='text-xl font-semibold'>{entity.canonicalName}</h3>
          <Badge>{entity.type}</Badge>
          <Badge>{entity.importance}</Badge>
          {entity.parentLocationId && <Badge>in {nameOf(entity.parentLocationId)}</Badge>}
        </div>
        <p className='mt-1 text-xs text-muted-foreground'>
          {entity.entityId} · seq {entity.firstSeq}–{entity.lastSeq} · {entity.mentionCount}{' '}
          mentions
        </p>
      </div>

      {profile && (profile.description || profile.role) && (
        <div className='rounded-lg border border-border bg-background p-4'>
          {profile.role && <p className='text-sm font-medium'>{profile.role}</p>}
          {profile.description && (
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              {profile.description}
            </p>
          )}
          {profile.appearance && profile.appearance.toLowerCase() !== 'unknown' && (
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              <span className='font-medium text-foreground'>Appearance. </span>
              {profile.appearance}
            </p>
          )}
          {profile.arc && (
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              <span className='font-medium text-foreground'>Arc. </span>
              {profile.arc}
            </p>
          )}
        </div>
      )}

      {!profile && entity.description && (
        <p className='text-sm leading-relaxed text-muted-foreground'>{entity.description}</p>
      )}

      {entity.aliases.length > 0 && (
        <ModelSection title='Aliases' count={entity.aliases.length}>
          <div className='flex flex-wrap gap-2'>
            {entity.aliases.map((alias) => (
              <Badge key={`${alias.name}-${alias.firstSeq}`}>{alias.name}</Badge>
            ))}
          </div>
        </ModelSection>
      )}

      {entity.facts.length > 0 && (
        <ModelSection title='Facts' count={entity.facts.length}>
          {entity.facts.map((fact) => (
            <EvidenceRow
              key={`${fact.key}-${fact.value}`}
              title={`${fact.key}: ${fact.value}`}
              detail={fact.quote ? `“${fact.quote}”` : undefined}
              paragraphIds={fact.paragraphIds}
              badges={[
                ...(fact.certainty !== 'stated'
                  ? [
                      {
                        label: fact.claimedBy
                          ? `${fact.certainty} by ${nameOf(fact.claimedBy)}`
                          : fact.certainty,
                      },
                    ]
                  : []),
                ...(fact.verified ? [] : [{ label: 'quote unmatched', tone: 'warn' as const }]),
              ]}
            />
          ))}
        </ModelSection>
      )}

      {entity.states.length > 0 && (
        <ModelSection title='States' count={entity.states.length}>
          {entity.states.map((state) => (
            <EvidenceRow
              key={state.stateId}
              title={state.label}
              detail={`From seq ${state.validFromSeq}${
                Object.keys(state.changes).length > 0 ? ` · ${changesLine(state.changes)}` : ''
              }`}
              paragraphIds={state.paragraphIds}
              badges={state.verified ? [] : [{ label: 'quote unmatched', tone: 'warn' }]}
            />
          ))}
        </ModelSection>
      )}

      {entity.reveals.length > 0 && (
        <ModelSection title='Reveals' count={entity.reveals.length}>
          {entity.reveals.map((reveal) => (
            <EvidenceRow
              key={`${reveal.seq}-${reveal.what}`}
              title={reveal.what}
              detail={`Revealed at seq ${reveal.seq}`}
              paragraphIds={reveal.paragraphIds}
              badges={reveal.verified ? [] : [{ label: 'quote unmatched', tone: 'warn' }]}
            />
          ))}
        </ModelSection>
      )}

      {entity.relationships.length > 0 && (
        <ModelSection title='Relationships' count={entity.relationships.length}>
          {entity.relationships.map((relationship) => (
            <EvidenceRow
              key={`${relationship.toEntityId}-${relationship.type}`}
              title={`${relationship.type} → ${nameOf(relationship.toEntityId)}`}
              detail={`From seq ${relationship.validFromSeq}`}
              paragraphIds={relationship.paragraphIds}
              badges={relationship.verified ? [] : [{ label: 'quote unmatched', tone: 'warn' }]}
            />
          ))}
        </ModelSection>
      )}
    </div>
  );
}
