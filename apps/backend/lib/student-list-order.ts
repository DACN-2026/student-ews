type StudentOrderKey = {
  id?: string | null;
  classCode?: string | null;
  cohortCode?: string | null;
  fullName?: string | null;
  givenName?: string | null;
  studentCode?: string | null;
};
export type StudentOrderRow = {
  id: string;
  sStudentId?: string | null;
  sStudentName?: string | null;
  sFullName?: string | null;
  sLastName?: string | null;
  sClassName?: string | null;
  sClassStudentId?: string | null;
};
const alphabet = new Intl.Collator("vi", { numeric: true, sensitivity: "variant" });
const clean = (value: string | null | undefined) => (value || "").trim().replace(/\s+/g, " ").normalize("NFC");
const classCode = (value: string | null | undefined) => ["—", "-"].includes(clean(value)) ? "" : clean(value).toUpperCase();
const cohort = (student: StudentOrderKey) => Number(classCode(student.classCode).match(/K(\d+)/)?.[1] || clean(student.cohortCode).match(/K(\d+)/i)?.[1] || Number.MAX_SAFE_INTEGER);
const compareText = (left: string, right: string) => left && right ? alphabet.compare(left, right) : left ? -1 : right ? 1 : 0;

/** Vietnamese given name, then full name and stable IDs, within each class/cohort. */
export function compareStudentOrder(left: StudentOrderKey, right: StudentOrderKey) {
  const leftName = clean(left.fullName), rightName = clean(right.fullName);
  const givenName = (student: StudentOrderKey, name: string) => clean(student.givenName) || name.split(" ").at(-1) || "";
  return cohort(left) - cohort(right)
    || compareText(classCode(left.classCode), classCode(right.classCode))
    || compareText(givenName(left, leftName), givenName(right, rightName))
    || compareText(leftName, rightName)
    || compareText(clean(left.studentCode), clean(right.studentCode))
    || compareText(clean(left.id), clean(right.id));
}
export function compareStudentRows(left: StudentOrderRow, right: StudentOrderRow) {
  const key = (row: StudentOrderRow): StudentOrderKey => ({
    id: row.id, classCode: row.sClassStudentId || row.sClassName,
    fullName: row.sFullName || row.sStudentName, givenName: row.sLastName,
    studentCode: row.sStudentId,
  });
  return compareStudentOrder(key(left), key(right));
}

/** Read only sort keys across the authorized scope; load full data for the selected page. */
export async function orderedStudentResultPage<T extends { id: string }>(
  loadKeys: () => Promise<StudentOrderRow[]>,
  loadRows: (ids: string[]) => Promise<T[]>,
  page: number,
  pageSize: number,
) {
  const keys = (await loadKeys()).sort(compareStudentRows);
  const ids = keys.slice((page - 1) * pageSize, page * pageSize).map(row => row.id);
  const rows = ids.length ? await loadRows(ids) : [];
  const positions = new Map(ids.map((id, index) => [id, index]));
  rows.sort((left, right) => positions.get(left.id)! - positions.get(right.id)!);
  return { total: keys.length, items: rows };
}
