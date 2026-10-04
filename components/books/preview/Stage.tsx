'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cameraAt, cameraLeg } from '@/lib/camera-timeline';
import type { CompositionAssembly } from '@/lib/story-types';
import type { PreviewBeat } from '@/lib/compose';
import { layerTransform, type CameraPose } from '@/lib/stage25d';

/**
 * One composition moving through one Beat's camera. Each layer gets the same
 * transform the worker used to compute the safe camera (lib/stage25d), so a
 * clamped camera here can never show an edge of the background.
 */
export function Layers({
  assembly,
  beat,
  reducedMotion,
  frozenPose,
  paused = false,
  progress,
  onPose,
}: {
  assembly: CompositionAssembly;
  beat: PreviewBeat;
  reducedMotion: boolean;
  frozenPose?: CameraPose;
  paused?: boolean;
  progress?: number;
  onPose?: (pose: CameraPose) => void;
}) {
  const [pose, setPose] = useState<CameraPose>(frozenPose ?? beat.camera.from);
  const current = useRef<CameraPose | null>(null);
  const report = useRef(onPose);
  useEffect(() => { report.current = onPose; }, [onPose]);
  useEffect(() => {
    let frame = 0;
    const publish = (next: CameraPose) => {
      current.current = next;
      setPose(next);
      report.current?.(next);
    };
    const leg = cameraLeg(beat.camera, current.current);
    const started = performance.now();
    const tick = (now: number) => {
      if (frozenPose) { publish(frozenPose); return; }
      if (progress !== undefined) { publish(cameraAt(beat.camera.from, beat.camera.to, progress, beat.camera.easing)); return; }
      if (paused || reducedMotion) { publish(leg.from); return; }
      const t = Math.min(1, (now - started) / Math.max(1, beat.camera.durationMs));
      publish(cameraAt(leg.from, leg.to, t, beat.camera.easing));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [beat.id, beat.camera, reducedMotion, paused, frozenPose, progress]);

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
