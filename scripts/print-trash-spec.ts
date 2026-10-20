// Prints what the trash's database function is told about every kind, as one line of JSON. It goes into supabase/tests/066_trash.sql
// (the line starting "-- SPEC-JSON:" and the copy inside trash_spec()); scripts/check-trash.ts fails if they ever differ from
// src/lib/trash.ts.  Run with:  npx tsx scripts/print-trash-spec.ts
import { trashSpecJson } from '../src/lib/trash'

console.log(JSON.stringify(trashSpecJson()))
