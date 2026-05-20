/**
 * Owner courses tab — re-exports the shared courses screen so a single
 * implementation serves both the tab entry (no dogId param) and the
 * dog-card link (`/(shared)/courses?dogId=…&dogName=…`).
 *
 * Before Iter 8.3 this file was a separate ~663 LOC copy that had drifted
 * from the shared screen (e.g. its course definitions tried to read
 * `owner.coursesPage.{id}.steps` directly, but the actual locale tree
 * stores steps under `methods[].steps` — crashed on render when the tab
 * was un-hidden). Replacing it with a re-export eliminates the
 * duplication and uses the maintained version that already handles the
 * "no dog context" case gracefully.
 */
export { default } from '../(shared)/courses';
