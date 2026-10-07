import { isConditionalCourse, isK44StandardProgram, normalizeProgramCourseCode } from "./academic-course-rules";
import { k44ElectiveMembership } from "./k44-elective-blocks";

type Course = { courseCode: string; courseName: string; credits: number; requirementType: string; status?: string };
type Offering = { code: string; credits: number };
type ChoiceGroup = { requiredCredits: number; courses: Offering[] };
type Requirement = { mandatory: Offering[]; groups: ChoiceGroup[] };

const offerings = (items: Array<string | [string, number]>): Offering[] => items.map((item) =>
  typeof item === "string" ? { code: item, credits: 3 } : { code: item[0], credits: item[1] });
const group = (requiredCredits: number, items: Array<string | [string, number]>): ChoiceGroup => ({ requiredCredits, courses: offerings(items) });

/** Academic quotas in the seven-page 2026–2027 teaching plan. GDTC/GDQP
 * remain separate certificate requirements. Historical catalogs keep their
 * original course codes; this scoped lookup only reconciles plan offerings. */
function requirementFor(semester: number, programCode: string): Requirement | null {
  switch (semester) {
    case 1: return { mandatory: offerings(["LC1101D", "20CT1101", ["20CT1102", 4], "20LH0001"]), groups: [] };
    case 2: return {
      mandatory: offerings([["LC1102D", 2], ["20CT1202", 4], ["20TN1202", 4]]),
      groups: [group(6, ["20CT1103", "20CT1203", "20TN1201", ...(programCode.startsWith("CQ25") ? ["25BC0001"] : [])])],
    };
    case 3: return { mandatory: offerings([["LC2101D", 2], "20CT1201", "20CT2102", "20CT2103", ["20CT3204", 1]]), groups: [group(6, ["20TN2102", "20QT0004", "20QT0001"])] };
    case 4: return { mandatory: offerings([["LC2102D", 2], ["20CT2201", 4], ["20CT2203", 4], "20CT2204"]), groups: [group(3, ["20NV0002", "20QT0006", "20SP0001"])] };
    case 5: return { mandatory: offerings([["LC3101D", 2], ["20CT2202", 4], ["20CT2101", 4], "20CT2205"]), groups: [group(3, ["20CT3107", "20CT3108"])] };
    case 6:
      if (programCode.endsWith("-MMT")) return { mandatory: offerings(["20CT3120", ["20CT3121", 4], "20CT3122"]), groups: [group(3, ["20CT3106"]), group(4, [["20CT3103", 4], ["20CT3123", 4], ["20CT3124", 4]])] };
      if (programCode.endsWith("-PM")) return { mandatory: offerings(["20CT3101", "20CT3132", ["20CT3103", 4]]), groups: [group(3, ["20CT3106"]), group(6, ["20CT3104", "20CT3105", "20CT3208"])] };
      if (programCode.endsWith("-KHDL")) return { mandatory: offerings(["20TN3111", "20CT3112", ["20CT3113", 4]]), groups: [group(3, ["20CT3106"]), group(3, [["20CT3103", 4], "20CT3132", ["20CT3123", 4]])] };
      return null;
    case 7:
      if (programCode.endsWith("-MMT")) return { mandatory: offerings(["20CT3220", "20CT3202", "20CT3221"]), groups: [group(9, ["20CT3222", "20CT3223", "20CT3224", "20CT3225"])] };
      if (programCode.endsWith("-PM")) return { mandatory: offerings(["20CT3201", "20CT3202", "20CT3203"]), groups: [group(9, ["20CT3205", "20CT3206", "20CT3207", "20CT4103"])] };
      return null;
    case 8:
      if (programCode.endsWith("-MMT")) return { mandatory: offerings(["20CT4120", "20CT4121"]), groups: [group(12, ["20CT4122", "20CT4107", "20CT4124", "20CT4125", "20CT4126"])] };
      if (programCode.endsWith("-PM")) return { mandatory: offerings(["20CT4101", "20CT4102"]), groups: [group(12, ["20CT4104", ["20CT3113", 4], "20CT4105", "20CT4106", "20CT4107"])] };
      return null;
    case 9: return { mandatory: offerings([["20CT4201", 8], ["20CT4202", 10]]), groups: [] };
    default: return null;
  }
}

export function teachingSemesterCredits(semester: number, programCode?: string | null): number | null {
  if (!isK44StandardProgram(programCode)) return null;
  const requirement = requirementFor(semester, programCode!.toUpperCase());
  return requirement ? requirement.mandatory.reduce((sum, item) => sum + item.credits, 0) + requirement.groups.reduce((sum, item) => sum + item.requiredCredits, 0) : null;
}

/** Distinct curriculum courses completed by the assessment cutoff. A summer
 * retake belongs to the original curriculum semester, not a new credit pool. */
export function teachingSemesterSurplus(semester: number, programCode: string, courses: Course[]) {
  if (!isK44StandardProgram(programCode)) return null;
  const requirement = requirementFor(semester, programCode.toUpperCase());
  if (!requirement) return null;
  const academic = courses.filter(course => !isConditionalCourse(course.courseCode, course.courseName) && course.requirementType !== "conditional");
  const lookup = (offering: Offering, mandatory: boolean) => academic.find(course => {
    const code = normalizeProgramCourseCode(course.courseCode, programCode);
    const membership = mandatory ? null : k44ElectiveMembership(code, programCode);
    const expectedMembership = mandatory ? null : k44ElectiveMembership(offering.code, programCode);
    return (code === offering.code || code === `${offering.code}D`
      || membership !== null && expectedMembership !== null && membership.curriculumCourseCode === expectedMembership.curriculumCourseCode)
      && course.credits === offering.credits
      && /mandatory|bắt buộc/i.test(course.requirementType) === mandatory
      && course.status === "PASSED";
  });
  const mandatoryCredits = requirement.mandatory.reduce((sum, item) => sum + item.credits, 0);
  const passedMandatoryCredits = requirement.mandatory.filter(item => lookup(item, true)).reduce((sum, item) => sum + item.credits, 0);
  const groups = requirement.groups.map(item => {
    const passedCourses = item.courses.flatMap(offering => {
      const course = lookup(offering, false);
      return course ? [{ courseCode: course.courseCode, credits: offering.credits }] : [];
    });
    const passedCredits = passedCourses.reduce((sum, course) => sum + course.credits, 0);
    return { requiredCredits: item.requiredCredits, passedCredits, surplusCredits: Math.max(0, passedCredits - item.requiredCredits), passedCourses, courses: item.courses };
  });
  const plannedCredits = mandatoryCredits + groups.reduce((sum, group) => sum + group.requiredCredits, 0);
  const passedCredits = passedMandatoryCredits + groups.reduce((sum, group) => sum + group.passedCredits, 0);
  return { semesterNo: semester, plannedCredits, passedCredits, surplusCredits: Math.max(0, passedCredits - plannedCredits), groups };
}

export function assessTeachingSemester(semester: number, programCode: string | null | undefined, courses: Course[]) {
  if (!isK44StandardProgram(programCode)) return null;
  const requirement = requirementFor(semester, programCode!.toUpperCase());
  if (!requirement) return null;
  const academic = courses.filter((course) => !isConditionalCourse(course.courseCode, course.courseName) && course.requirementType !== "conditional");
  const byCode = new Map(academic.map((course) => [normalizeProgramCourseCode(course.courseCode, programCode), course]));
  // Only codes explicitly present in the reference pool accept their catalog
  // D variant. This does not merge transcript attempts or unrelated names.
  const lookup = (offering: Offering) => byCode.get(offering.code) ?? byCode.get(`${offering.code}D`);
  const matches = (offering: Offering, mandatory: boolean) => {
    const course = lookup(offering);
    return Boolean(course && course.credits === offering.credits && /mandatory|bắt buộc/i.test(course.requirementType) === mandatory);
  };
  const mandatoryCredits = requirement.mandatory.reduce((sum, item) => sum + item.credits, 0);
  const electiveCredits = requirement.groups.reduce((sum, item) => sum + item.requiredCredits, 0);
  const missingMandatoryCredits = requirement.mandatory.filter((item) => lookup(item)?.status !== "PASSED").reduce((sum, item) => sum + item.credits, 0);
  const groups = requirement.groups.map((item) => {
    const passedCredits = item.courses.filter((offering) => lookup(offering)?.status === "PASSED").reduce((sum, offering) => sum + offering.credits, 0);
    return { requiredCredits: item.requiredCredits, passedCredits, remainingCredits: Math.max(0, item.requiredCredits - passedCredits) };
  });
  const expectedMandatoryCodes = new Set(requirement.mandatory.flatMap((item) => [item.code, `${item.code}D`]));
  const curriculumConfirmed = requirement.mandatory.every((item) => matches(item, true)) &&
    requirement.groups.every((item) => item.courses.every((offering) => matches(offering, false))) &&
    academic.filter((course) => /mandatory|bắt buộc/i.test(course.requirementType)).every((course) => expectedMandatoryCodes.has(normalizeProgramCourseCode(course.courseCode, programCode)));
  return { mandatoryCredits, electiveCredits, plannedCredits: mandatoryCredits + electiveCredits, missingMandatoryCredits,
    remainingCredits: missingMandatoryCredits + groups.reduce((sum, item) => sum + item.remainingCredits, 0), curriculumConfirmed, groups };
}
