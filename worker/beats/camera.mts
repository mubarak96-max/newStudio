import type { CameraMove, CameraPose } from "../../lib/story-types.ts";

export const cameraMoves: CameraMove[] = ["hold", "push-in", "pull-back", "pan-left", "pan-right", "tilt-up", "tilt-down", "drift"];

const rest: CameraPose = { x: 0, y: 0, zoom: 1, rotate: 0 };

/**
 * Moves are small on purpose: layers are later assembled with limited
 * overscan, and the 2.5D stage clamps anything beyond the composition's safe
 * camera. A pan starts slightly zoomed so the frame has room to travel.
 */
export function posesFor(move: CameraMove, start: CameraPose = rest, focus?: { x: number; y: number; w: number; h: number }): { from: CameraPose; to: CameraPose } {
  if (move === "hold") return { from: start, to: { ...start } };
  if (focus) {
    const zoom = move === "pull-back" ? 1 : Math.min(1.35, Math.max(1.08, start.zoom + (move === "push-in" ? 0.12 : 0)));
    const limit = (v: number) => round(Math.max(-0.12, Math.min(0.12, v)));
    return { from: start, to: { x: limit(focus.x + focus.w / 2 - 0.5), y: limit(focus.y + focus.h / 2 - 0.45), zoom: round(zoom), rotate: 0 } };
  }
  const zoomed = { ...start, zoom: Math.max(start.zoom, 1.08) };
  switch (move) {
    case "push-in":
      return { from: start, to: { ...start, zoom: round(Math.min(start.zoom + 0.15, 1.6)) } };
    case "pull-back":
      return { from: { ...start, zoom: round(Math.max(start.zoom, 1.2)) }, to: { ...start, zoom: 1 } };
    case "pan-left":
      return { from: { ...zoomed, x: 0.04 }, to: { ...zoomed, x: -0.04 } };
    case "pan-right":
      return { from: { ...zoomed, x: -0.04 }, to: { ...zoomed, x: 0.04 } };
    case "tilt-up":
      return { from: { ...zoomed, y: 0.04 }, to: { ...zoomed, y: -0.04 } };
    case "tilt-down":
      return { from: { ...zoomed, y: -0.04 }, to: { ...zoomed, y: 0.04 } };
    case "drift":
      return { from: start, to: { ...start, x: round(start.x + 0.02), zoom: round(Math.min(start.zoom + 0.04, 1.6)) } };
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Camera motion runs about as long as the Beat takes to read, within comfortable bounds. */
export function durationFor(words: number): number {
  const readingMs = (words / 230) * 60_000;
  return Math.round(Math.min(18_000, Math.max(4_000, readingMs)));
}

export function isCameraMove(value: unknown): value is CameraMove {
  return typeof value === "string" && (cameraMoves as string[]).includes(value);
}

/** Splits text at sentence ends into pieces of at most maxWords, never inside a word. */
export function splitSentences(text: string, maxWords: number): { start: number; end: number }[] {
  const sentences: { start: number; end: number }[] = [];
  const pattern = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g;
  for (const match of text.matchAll(pattern)) {
    if (match[0].trim()) sentences.push({ start: match.index!, end: match.index! + match[0].length });
  }
  const pieces: { start: number; end: number }[] = [];
  let current: { start: number; end: number } | null = null;
  const words = (range: { start: number; end: number }) => text.slice(range.start, range.end).trim().split(/\s+/).length;
  for (const sentence of sentences) {
    if (current && words({ start: current.start, end: sentence.end }) <= maxWords) {
      current.end = sentence.end;
    } else {
      if (current) pieces.push(current);
      current = { ...sentence };
    }
  }
  if (current) pieces.push(current);
  // Trim trailing whitespace so every piece is an exact, clean substring.
  return pieces.map((piece) => {
    const raw = text.slice(piece.start, piece.end);
    return { start: piece.start, end: piece.start + raw.trimEnd().length };
  });
}
