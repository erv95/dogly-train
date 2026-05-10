import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  limit,
} from 'firebase/firestore';
import Constants from 'expo-constants';
import { db } from '../config/firebase';
import { DogReminder, ReminderType, ReminderRecurrence } from '../types';

const COLLECTION = 'dog_reminders';

// ── Recurrence helpers ───────────────────────────────────────────────────────

/**
 * Add the recurrence interval to a date and return the next due date.
 * Months handled correctly (Date constructor wraps overflow).
 */
export function addRecurrence(date: Date, recurrence: ReminderRecurrence): Date {
  const d = new Date(date);
  switch (recurrence) {
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'biannual':  d.setMonth(d.getMonth() + 6); break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
    case 'none':      break;
  }
  return d;
}

// ── Notification scheduling ──────────────────────────────────────────────────

/**
 * Schedule a local notification for the given reminder. Returns the OS
 * notification id (or null if Expo Go / unsupported / past date).
 *
 * Notifications fire on the device exactly at `dueAt` minus 1 day at 9:00 AM
 * local time (or immediately if dueAt is within the next day).
 *
 * Dynamic import keeps `expo-notifications` out of Expo Go's broken native bridge.
 */
async function scheduleNotification(
  title: string,
  body: string,
  dueAt: Date
): Promise<string | null> {
  // Skip in Expo Go (no native notification support since SDK 53+)
  if (Constants.appOwnership === 'expo') return null;

  try {
    const Notifications = await import('expo-notifications');

    // Trigger 1 day before, at 9 AM. If that's already in the past, fire now+1min.
    const triggerDate = new Date(dueAt);
    triggerDate.setDate(triggerDate.getDate() - 1);
    triggerDate.setHours(9, 0, 0, 0);

    const now = new Date();
    if (triggerDate.getTime() <= now.getTime()) {
      // Past or near — schedule for 1 minute from now (still gives the user the alert)
      triggerDate.setTime(now.getTime() + 60 * 1000);
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate } as any,
    });
    return id;
  } catch (err) {
    console.warn('Failed to schedule notification', err);
    return null;
  }
}

async function cancelNotification(id: string | null): Promise<void> {
  if (!id) return;
  if (Constants.appOwnership === 'expo') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // best effort
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export interface CreateReminderInput {
  userId: string;
  dogId: string;
  dogName: string;
  type: ReminderType;
  title: string;
  notes?: string;
  dueAt: Date;
  recurrence: ReminderRecurrence;
}

export async function createReminder(input: CreateReminderInput): Promise<DogReminder> {
  const notificationId = await scheduleNotification(
    input.title,
    `${input.dogName} · ${input.type}`,
    input.dueAt
  );

  const data = {
    userId: input.userId,
    dogId: input.dogId,
    dogName: input.dogName,
    type: input.type,
    title: input.title.trim(),
    notes: input.notes?.trim() || '',
    dueAt: Timestamp.fromDate(input.dueAt),
    recurrence: input.recurrence,
    notificationId,
    completedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const ref = await addDoc(collection(db, COLLECTION), data);
  return { id: ref.id, ...data } as DogReminder;
}

export interface UpdateReminderInput {
  type?: ReminderType;
  title?: string;
  notes?: string;
  dueAt?: Date;
  recurrence?: ReminderRecurrence;
}

export async function updateReminder(
  reminder: DogReminder,
  updates: UpdateReminderInput
): Promise<void> {
  // If date changed, reschedule notification
  let notificationId = reminder.notificationId;
  const newDueAt = updates.dueAt ?? reminder.dueAt.toDate();
  const newTitle = updates.title ?? reminder.title;
  const dateChanged = updates.dueAt && updates.dueAt.getTime() !== reminder.dueAt.toDate().getTime();
  const titleChanged = updates.title && updates.title !== reminder.title;

  if (dateChanged || titleChanged) {
    await cancelNotification(reminder.notificationId);
    notificationId = await scheduleNotification(
      newTitle,
      `${reminder.dogName} · ${updates.type ?? reminder.type}`,
      newDueAt
    );
  }

  const patch: any = {
    updatedAt: Timestamp.now(),
    notificationId,
  };
  if (updates.type !== undefined) patch.type = updates.type;
  if (updates.title !== undefined) patch.title = updates.title.trim();
  if (updates.notes !== undefined) patch.notes = updates.notes.trim();
  if (updates.dueAt !== undefined) patch.dueAt = Timestamp.fromDate(updates.dueAt);
  if (updates.recurrence !== undefined) patch.recurrence = updates.recurrence;

  await updateDoc(doc(db, COLLECTION, reminder.id), patch);
}

export async function deleteReminder(reminder: DogReminder): Promise<void> {
  await cancelNotification(reminder.notificationId);
  await deleteDoc(doc(db, COLLECTION, reminder.id));
}

/**
 * Mark a reminder as completed.
 * - For one-off reminders (recurrence === 'none'): sets completedAt
 * - For recurring reminders: advances dueAt to the next occurrence and reschedules
 */
export async function completeReminder(reminder: DogReminder): Promise<void> {
  await cancelNotification(reminder.notificationId);

  if (reminder.recurrence === 'none') {
    await updateDoc(doc(db, COLLECTION, reminder.id), {
      completedAt: Timestamp.now(),
      notificationId: null,
      updatedAt: Timestamp.now(),
    });
    return;
  }

  // Recurring: bump to next occurrence
  const nextDue = addRecurrence(reminder.dueAt.toDate(), reminder.recurrence);
  const newNotificationId = await scheduleNotification(
    reminder.title,
    `${reminder.dogName} · ${reminder.type}`,
    nextDue
  );

  await updateDoc(doc(db, COLLECTION, reminder.id), {
    dueAt: Timestamp.fromDate(nextDue),
    notificationId: newNotificationId,
    updatedAt: Timestamp.now(),
  });
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Reminders for a single dog, sorted by dueAt.
 * Excludes one-off completed reminders (they remain in DB for history but UI hides them).
 *
 * NOTE: `userId` is required to satisfy Firestore security rules — the rule
 * checks resource.data.userId == request.auth.uid, so the query must include
 * an equality filter on userId, otherwise Firestore rejects the entire read.
 */
export async function getDogReminders(dogId: string, userId: string): Promise<DogReminder[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('dogId', '==', dogId),
    where('completedAt', '==', null),
    orderBy('dueAt', 'asc'),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DogReminder));
}

/**
 * Upcoming reminders across all dogs of the user. Used for badges / home widget.
 */
export async function getUpcomingReminders(userId: string, maxResults = 20): Promise<DogReminder[]> {
  // Filter completedAt server-side so we don't pay reads for completed reminders.
  // Requires the (userId, completedAt, dueAt) composite index (already deployed
  // for getDogReminders — Firestore reuses the prefix).
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('completedAt', '==', null),
    orderBy('dueAt', 'asc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DogReminder));
}

export async function getReminder(id: string): Promise<DogReminder | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DogReminder;
}
