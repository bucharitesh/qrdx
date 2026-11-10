"use client";

import { createStore, del, get, set, type UseStore } from "idb-keyval";
import { type ImportJob, readImportJob } from "./job";

// The CSV import's job in this browser's IndexedDB, one per person and
// workspace, so the import survives a reload. Storage can be missing or
// blocked (private windows, cleared site data): every call fails quietly and
// the import then simply runs without resume.

let store: UseStore | null = null;
const jobs = () => {
  store ??= createStore("qrdx-imports", "jobs");
  return store;
};

export async function loadImportJob(key: string): Promise<ImportJob | null> {
  try {
    return readImportJob(await get(key, jobs()));
  } catch {
    return null;
  }
}

export async function saveImportJob(
  key: string,
  job: ImportJob,
): Promise<void> {
  try {
    await set(key, job, jobs());
  } catch {
    // No storage: the import goes on, without resume after a reload.
  }
}

export async function clearImportJob(key: string): Promise<void> {
  try {
    await del(key, jobs());
  } catch {
    // Nothing stored.
  }
}
