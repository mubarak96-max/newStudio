import type { Bucket } from '@google-cloud/storage';

export async function saveJsonCheckpoint(
  bucket: Bucket,
  storagePath: string,
  value: unknown
): Promise<void> {
  await bucket.file(storagePath).save(JSON.stringify(value), {
    contentType: 'application/json; charset=utf-8',
    metadata: { cacheControl: 'private, max-age=31536000, immutable' },
    resumable: false,
  });
}

export async function loadLatestValidCheckpoint<T>(
  bucket: Bucket,
  prefix: string,
  preferredPath?: string
): Promise<{ path: string; value: T } | null> {
  const [files] = await bucket.getFiles({ prefix });
  const paths = Array.from(
    new Set([
      ...(preferredPath ? [preferredPath] : []),
      ...files.map((file) => file.name).sort((left, right) => right.localeCompare(left)),
    ])
  );

  for (const path of paths) {
    try {
      const [data] = await bucket.file(path).download();
      return { path, value: JSON.parse(data.toString('utf8')) as T };
    } catch {
      // Try the previous immutable checkpoint. A corrupt checkpoint never blocks recovery.
    }
  }
  return null;
}
