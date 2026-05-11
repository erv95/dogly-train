import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { auth } from '../config/firebase';

const FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/exportUserData';

/**
 * Calls the GDPR data-export CF, writes the JSON to a temp file, and opens the
 * OS share sheet so the user can save it (Drive, AirDrop, mail attachment, …).
 *
 * Throws on network errors / server errors so the UI can surface them.
 */
export async function exportMyData(): Promise<{ uri: string; bytes: number }> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    let code = 'unknown';
    try {
      const d = await res.json();
      if (typeof d?.error === 'string') code = d.error;
    } catch { /* ignore */ }
    throw new Error(code);
  }

  const json = await res.text();
  const bytes = json.length;

  const filename = `dogly_data_export_${Date.now()}.json`;
  const file = new File(Paths.cache, filename);
  // expo-file-system v55 class API. `write` overwrites if the file exists,
  // which is fine — the filename is timestamp-unique anyway.
  file.create({ overwrite: true });
  file.write(json);

  // Share sheet — user picks where the file goes (mail, Drive, Files, …).
  // If the platform doesn't support sharing we still leave the file on disk
  // so the user could find it via Files (best-effort).
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Mis datos de Dogly Train',
    });
  }

  return { uri: file.uri, bytes };
}
