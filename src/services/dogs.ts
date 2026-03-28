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
  const dogData = {
    ownerId,
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const docRef = await addDoc(collection(db, DOGS_COLLECTION), dogData);
  return { id: docRef.id, ...dogData } as Dog;
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
