'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { CompositionAssembly } from '@/lib/story-types';
import type { PreviewBeat } from '@/lib/compose';
import { layerTransform, type CameraPose } from '@/lib/stage25d';

const easings: Record<PreviewBeat['camera']['easing'], string> = {
  linear: 'linear',
  easeInOut: 'cubic-bezier(0.45, 0, 0.55, 1)',
  spring: 'cubic-bezier(0.34, 1.3, 0.64, 1)',
};

/**
 * One composition moving through one Beat's camera. Each layer gets the same
 * transform the worker used to compute the safe camera (lib/stage25d), so a
 * clamped camera here can never show an edge of the background.
 */
export function Layers({
  assembly,
  beat,
  reducedMotion,
}: {
  assembly: CompositionAssembly;
  beat: PreviewBeat;
  reducedMotion: boolean;
}) {
  const [pose, setPose] = useState<CameraPose>(reducedMotion ? beat.camera.to : beat.camera.from);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    // Start at `from` without a transition, then glide to `to` on the next frame.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setMoving(true);
        setPose(beat.camera.to);
      })
    );
    return () => cancelAnimationFrame(frame);
  }, [beat, reducedMotion]);

  return (
    <>
      {assembly.layers.map((layer) => {
        const t = layerTransform(pose, layer.scale, layer.parallax);
        return (
          <Image
            key={layer.layerId}
            src={layer.url}
            alt=''
            width={layer.width || 768}
            height={layer.height || 1376}
            unoptimized
            priority
            draggable={false}
            className='pointer-events-none absolute inset-0 h-full w-full select-none object-cover'
            style={{
              transform: `translate(${t.x * 100}%, ${t.y * 100}%) scale(${t.scale}) rotate(${t.rotate}rad)`,
              transition: moving ? `transform ${beat.camera.durationMs}ms ${easings[beat.camera.easing]}` : 'none',
              willChange: 'transform',
            }}
          />
        );
      })}
    </>
  );
}

/** The HTML subtitles: the book's words in serif, speakers named, commentary visibly set apart. */
export function Subtitles({ beat }: { beat: PreviewBeat }) {
  const { quote, dialogue, commentary } = beat.text;
  if (!quote && !dialogue && !commentary) return null;
  return (
    <div className='pointer-events-none absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-5 pb-6 pt-16 text-white'>
      {quote && <p className='font-serif text-[15px] leading-relaxed'>{quote.text}</p>}
      {dialogue?.map((line) => (
        <p key={`${line.paragraphId}-${line.start}`} className='font-serif text-[15px] leading-relaxed'>
          {line.speakerDisplayName && (
            <span className='mr-2 font-sans text-[11px] font-semibold uppercase tracking-wider text-amber-300'>
              {line.speakerDisplayName}
            </span>
          )}
          “{line.text}”
        </p>
      ))}
      {commentary?.map((note) => (
        <p key={note.id} className='border-l-2 border-sky-400 pl-2 text-xs italic text-sky-100'>
          {note.text}
        </p>
      ))}
    </div>
  );
}
