// Resolves which Program an inbound request belongs to. Nothing in the UI
// should hardcode a program name — this is the one place that maps an
// external source system to a Program, so adding a new source later (e.g.
// a future "academy-portal") is a one-line addition here, not a UI change.
//
// IOE Admin Portal is entirely that program's own admin tool (its own
// header reads "Intensive Offline Assessment"), so every request it sends
// maps to the existing "Intensive Offline" program — but it doesn't send
// a program field itself, so we derive it from `source`.
const SOURCE_TO_PROGRAM_NAME = {
  "ioe-portal": "Intensive Offline",
};

/**
 * @param {{ source?: string, program?: string }} request
 * @param {Array<{ id: string, name: string }>} programs
 * @returns {string|null} program id, or null if unresolvable
 */
export function resolveInboundProgramId(request, programs) {
  if (request?.program) {
    // Source system sent an explicit program id or name — trust it.
    const explicit = programs.find(p => p.id === request.program || p.name === request.program);
    if (explicit) return explicit.id;
  }
  const mappedName = SOURCE_TO_PROGRAM_NAME[request?.source];
  if (!mappedName) return null;
  return programs.find(p => p.name === mappedName)?.id || null;
}
