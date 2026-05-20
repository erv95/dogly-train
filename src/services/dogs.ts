import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Dog, DogSex, DogIssue } from '../types';

const DOGS_COLLECTION = 'dogs';

// --- Types for create/update ---

export interface DogFormData {
  name: string;
  breed: string;
  age: number;
  /** ISO `YYYY-MM-DD`. Optional for backwards compatibility with the form's
   *  legacy "age in years" input. When supplied, `createDog` derives `age`
   *  from it so downstream readers that haven't migrated to `getAgeMonths`
   *  keep working. */
  birthdate?: string | null;
  weight: number;
  sex: DogSex;
  behavior: string;
  issues: DogIssue[];
  photoURL: string | null;
}

// --- CRUD ---

export async function getDogsByOwner(ownerId: string): Promise<Dog[]> {
  const q = query(
    collection(db, DOGS_COLLECTION),
    where('ownerId', '==', ownerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Dog));
}

export async function createDog(ownerId: string, data: DogFormData): Promise<Dog> {
  // When the form provided a birthdate, derive `age` (whole years) from it
  // so any reader that still consumes `dog.age` directly keeps working
  // without migration. The richer `getAgeMonths()` helper prefers
  // `birthdate` when present.
  const ageFromBirthdate = data.birthdate ? computeYearsFromBirthdate(data.birthdate) : null;
  const dogData = {
    ownerId,
    ...data,
    age: ageFromBirthdate ?? data.age,
    birthdate: data.birthdate ?? null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const docRef = await addDoc(collection(db, DOGS_COLLECTION), dogData);
  return { id: docRef.id, ...dogData } as Dog;
}

/** Local helper duplicated from `utils/dogAge.ts` to keep this service free
 *  of i18n / TFunction imports. Returns whole years (floor). */
function computeYearsFromBirthdate(iso: string): number {
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) years--;
  return Math.max(0, years);
}

export async function updateDog(dogId: string, data: Partial<DogFormData>): Promise<void> {
  await updateDoc(doc(db, DOGS_COLLECTION, dogId), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteDog(dogId: string): Promise<void> {
  await deleteDoc(doc(db, DOGS_COLLECTION, dogId));
}
