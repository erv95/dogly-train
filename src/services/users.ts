import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface UpdateProfileData {
  displayName?: string;
  photoURL?: string | null;
  language?: string;
}

export async function updateUserProfile(
  userId: string,
  data: UpdateProfileData
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}
