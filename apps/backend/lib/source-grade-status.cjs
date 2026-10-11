/** Distinguish an explicit pending flag from a record without a final result.
 * @param {{notScore?: boolean, special?: string|null, score10?: number|null, score4?: number|null, letter?: string|null, isPass?: boolean}} input
 */
function sourceGradeStatus({ notScore = false, special = null, score10 = null, score4 = null, letter = null, isPass = false } = {}) {
  if (notScore) return 'pending';
  if (special) return 'special';
  return isPass || score10 != null || score4 != null || Boolean(letter && letter.trim().toUpperCase() !== 'N/A') ? 'graded' : 'unknown';
}
module.exports = { sourceGradeStatus };
