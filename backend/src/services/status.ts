export type ComplaintStatusGroup = 'pending' | 'disposed' | 'unknown';

/**
 * Classifies a CCTNS complaint's status into one of three groups.
 *
 * Rules:
 *  1. 'disposed' → statusRaw contains "disposed" OR disposalDate is present
 *  2. 'pending'  → statusRaw contains "pending"
 *  3. 'unknown'  → statusRaw is blank/null or any unrecognized value
 *                  These are complaints where the CCTNS API did not provide a valid status.
 *                  We do NOT assume their state — they are recorded as "Unknown Status".
 *
 * isDisposedMissingDate = true when status says "disposed" but API provided no disposalDate.
 */
export const classifyComplaintStatus = (
  statusRaw: string | null | undefined,
  disposalDate: Date | null | undefined
): { statusGroup: ComplaintStatusGroup; isDisposedMissingDate: boolean } => {
  const normalized = String(statusRaw || '').toLowerCase().trim();
  const mentionsDisposed = normalized.includes('disposed');
  const mentionsPending = normalized.includes('pending');

  let statusGroup: ComplaintStatusGroup;

  if (mentionsDisposed || disposalDate) {
    statusGroup = 'disposed';
  } else if (mentionsPending) {
    statusGroup = 'pending';
  } else {
    // blank, null, or any other value from API — status not known
    statusGroup = 'unknown';
  }

  return {
    statusGroup,
    isDisposedMissingDate: mentionsDisposed && !disposalDate,
  };
};
