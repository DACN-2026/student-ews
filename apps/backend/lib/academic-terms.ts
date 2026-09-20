export type AcademicTermLinkInput = {
  id: string;
  academicYearId: string;
  academicYearCode: string;
  termOrder: number;
  isSummer: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};

export type AcademicTermLinks = {
  previousMainTermId: string | null;
  nextMainTermId: string | null;
};

export function configuredSummerTermCodes(raw = process.env.SUMMER_TERM_CODES || "") {
  return new Set(raw.split(",").map((code) => code.trim().toUpperCase()).filter(Boolean));
}

export function isConfiguredSummerTermCode(code: string, raw?: string) {
  return configuredSummerTermCodes(raw).has(code.trim().toUpperCase());
}

const dateValue = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export function compareAcademicTerms(left: AcademicTermLinkInput, right: AcademicTermLinkInput) {
  const leftDate = dateValue(left.startDate);
  const rightDate = dateValue(right.startDate);
  if (leftDate != null && rightDate != null && leftDate !== rightDate) return leftDate - rightDate;
  return `${left.academicYearCode}|${String(left.termOrder).padStart(4, "0")}|${left.id}`.localeCompare(
    `${right.academicYearCode}|${String(right.termOrder).padStart(4, "0")}|${right.id}`,
  );
}

/**
 * Resolve the main terms immediately before and after every term. The
 * relationship is based on configured chronology, never on a term code such
 * as HK03.
 */
export function buildAcademicTermLinks(terms: AcademicTermLinkInput[]) {
  const ordered = [...terms].sort(compareAcademicTerms);
  const mainTerms = ordered.filter((term) => !term.isSummer);
  const links = new Map<string, AcademicTermLinks>();

  for (const term of ordered) {
    let previousMainTermId: string | null = null;
    let nextMainTermId: string | null = null;
    for (const mainTerm of mainTerms) {
      const comparison = compareAcademicTerms(mainTerm, term);
      if (comparison < 0) previousMainTermId = mainTerm.id;
      if (comparison > 0) {
        nextMainTermId = mainTerm.id;
        break;
      }
    }
    links.set(term.id, { previousMainTermId, nextMainTermId });
  }

  return links;
}

export function latestMainTerm<T extends AcademicTermLinkInput>(terms: T[]) {
  return [...terms].filter((term) => !term.isSummer).sort(compareAcademicTerms).at(-1) || null;
}
