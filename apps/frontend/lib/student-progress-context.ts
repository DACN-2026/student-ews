export function studentProgressEndpoint(studentId: string, warningResultId?: string) {
  const base = `/api/v1/students/${encodeURIComponent(studentId)}/training-progress`;
  return warningResultId ? `${base}?${new URLSearchParams({ warningResultId })}` : base;
}
