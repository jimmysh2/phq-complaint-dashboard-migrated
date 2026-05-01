export type ComplaintStatusGroup = 'pending' | 'disposed' | 'unknown';

export const classifyComplaintStatus = (
  statusRaw: string | null | undefined,
  disposalDate: Date | null | undefined
): { statusGroup: ComplaintStatusGroup; isDisposedMissingDate: boolean } => {
  const normalized = String(statusRaw || '').toLowerCase();
  const mentionsDisposed = normalized.includes('disposed');
  const mentionsPending = normalized.includes('pending');

  let statusGroup: ComplaintStatusGroup = 'unknown';
  if (mentionsDisposed || disposalDate) {
    statusGroup = 'disposed';
  } else if (mentionsPending) {
    statusGroup = 'pending';
  }

  return {
    statusGroup,
    isDisposedMissingDate: mentionsDisposed && !disposalDate,
  };
};
