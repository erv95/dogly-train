import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { callCF } from '../utils/cfClient';

/**
 * Calls the GDPR data-export CF, writes the JSON to a temp file, and opens the
 * OS share sheet so the user can save it (Drive, AirDrop, mail attachment, …).
 *
 * Throws `CFError` on server errors so the UI can surface a localised message.
 */
export async function exportMyData(): Promise<{ uri: string; bytes: number }> {
  const payload = await callCF<Record<string, unknown>>('exportUserData');
  // Re-stringify for file write. Slightly less efficient than streaming the
  // raw response, but the export caps at <100 MB and the round-trip lets us
  // share the CFError handling with every other CF call.
  const json = JSON.stringify(payload, null, 2);
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
