import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

const MAX_WIDTH = 800;
const COMPRESS_QUALITY = 0.7;

export async function pickImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

export async function compressImage(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: COMPRESS_QUALITY, format: SaveFormat.JPEG }
  );
  return result.uri;
}

export async function uploadImage(
  localUri: string,
  storagePath: string
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/**
 * Full flow: pick → compress → upload → return download URL
 */
export async function pickAndUploadImage(storagePath: string): Promise<string | null> {
  const uri = await pickImage();
  if (!uri) return null;

  const compressed = await compressImage(uri);
  const downloadURL = await uploadImage(compressed, storagePath);
  return downloadURL;
}
