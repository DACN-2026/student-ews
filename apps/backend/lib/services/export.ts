import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { ReportsService } from "@/lib/services/reports";
import { classifyConductScore, conductApproval } from "@/lib/services/conduct";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import type { Prisma } from "@prisma/client";

export const EXPORT_FORMATS = ["xlsx", "pdf"] as const;
export const EXPORT_TYPES = ["warnings", "progress", "conduct", "support", "student-profile"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportType = (typeof EXPORT_TYPES)[number];

export type ReportExportFilters = {
  academicTermId?: string;
  academicYearId?: string;
  classCode?: string;
  cohortId?: string;
  programCode?: string;
  severity?: string;
  studentId?: string;
};

type ExportColumn = {
  header: string;
  key: string;
  width?: number;
};

export type ExportTable = {
  title: string;
  subtitle?: string;
  sheetName: string;
  columns: ExportColumn[];
  rows: Array<Record<string, string | number | null>>;
  summary?: Array<[string, string | number]>;
};

export type ExportArtifact = {
  body: Buffer;
  contentType: string;
  fileName: string;
  rowCount: number;
};

const numberOrNull = (value: unknown) => value == null ? null : Number(value);

export function safeExportStem(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "bao_cao";
}

export function buildExportFileName(type: ExportType, format: ExportFormat, date = new Date()) {
  const labels: Record<ExportType, string> = {
    warnings: "bao_cao_canh_bao",
    progress: "tong_hop_tien_do_ctdt",
    conduct: "bao_cao_ren_luyen",
    support: "nhat_ky_ho_tro",
    "student-profile": "ho_so_sinh_vien",
  };
  return `${safeExportStem(labels[type])}_${date.toISOString().slice(0, 10)}.${format}`;
}

export function parseExportParameter<T extends string>(value: string | null, allowed: readonly T[], name: string): T {
  if (value && allowed.includes(value as T)) return value as T;
  throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
}

function styleWorksheet(sheet: ExcelJS.Worksheet, table: ExportTable) {
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.mergeCells(1, 1, 1, table.columns.length);
  const title = sheet.getCell(1, 1);
  title.value = table.title;
  title.font = { bold: true, size: 16, color: { argb: "FF173B2B" } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, table.columns.length);
  const subtitle = sheet.getCell(2, 1);
  subtitle.value = table.subtitle || `Tạo lúc ${new Date().toLocaleString("vi-VN")}`;
  subtitle.font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  const header = sheet.getRow(4);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF14532D" } } };
  });

  for (let index = 5; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    row.alignment = { vertical: "top", wrapText: true };
    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      });
    }
  }
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: table.columns.length } };
}

export async function workbookBuffer(table: ExportTable) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SEWS";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(table.sheetName.slice(0, 31));
  sheet.columns = table.columns.map((column) => ({ ...column, width: column.width || 18 }));
  sheet.addRows(table.rows);
  styleWorksheet(sheet, table);

  if (table.summary?.length) {
    const summary = workbook.addWorksheet("Tổng hợp");
    summary.columns = [{ header: "Chỉ số", key: "label", width: 38 }, { header: "Giá trị", key: "value", width: 22 }];
    summary.addRows(table.summary.map(([label, value]) => ({ label, value })));
    summary.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
    });
  }
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

function pdfBuffer(render: (document: PDFKit.PDFDocument) => void) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Creator: "SEWS" } });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    const fontPath = (fileName: string) => {
      const relative = path.join("node_modules", "@fontsource", "noto-sans", "files", fileName);
      const candidates = [path.resolve(process.cwd(), relative), path.resolve(process.cwd(), "../..", relative)];
      const found = candidates.find((candidate) => fs.existsSync(candidate));
      if (!found) throw new Error(`PDF font asset not found: ${fileName}`);
      return found;
    };
    const regularFont = fontPath("noto-sans-vietnamese-400-normal.woff");
    const boldFont = fontPath("noto-sans-vietnamese-700-normal.woff");
    document.registerFont("Noto", regularFont);
    document.registerFont("NotoBold", boldFont);
    render(document);
    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      document.switchToPage(index);
      document.font("Noto").fontSize(8).fillColor("#64748b")
        .text(`SEWS · Trang ${index + 1}/${range.count}`, 42, 806, { width: 511, align: "right" });
    }
    document.end();
  });
}

function ensurePdfSpace(document: PDFKit.PDFDocument, height = 28) {
  if (document.y + height > 785) document.addPage();
}

function renderPdfHeading(document: PDFKit.PDFDocument, title: string, subtitle?: string) {
  document.font("NotoBold").fontSize(18).fillColor("#14532d").text(title);
  document.moveDown(0.25);
  document.font("Noto").fontSize(9).fillColor("#64748b")
    .text(subtitle || `Thời điểm xuất: ${new Date().toLocaleString("vi-VN")}`);
  document.moveDown(1);
}

function renderPdfTable(document: PDFKit.PDFDocument, table: ExportTable) {
  renderPdfHeading(document, table.title, table.subtitle);
  if (table.summary?.length) {
    for (const [label, value] of table.summary) {
      document.font("NotoBold").fontSize(9).fillColor("#334155").text(`${label}: `, { continued: true });
      document.font("Noto").fillColor("#0f172a").text(String(value));
    }
    document.moveDown(0.75);
  }
  for (const [index, row] of table.rows.entries()) {
    ensurePdfSpace(document, 54);
    document.roundedRect(42, document.y, 511, 44, 4).fill(index % 2 ? "#f8fafc" : "#f0fdf4");
    const y = document.y + 7;
    const primary = [row.studentCode, row.studentName].filter(Boolean).join(" · ") || `Dòng ${index + 1}`;
    const secondary = table.columns
      .filter((column) => !["studentCode", "studentName"].includes(column.key))
      .slice(0, 6)
      .map((column) => `${column.header}: ${row[column.key] ?? "—"}`)
      .join("  |  ");
    document.font("NotoBold").fontSize(9).fillColor("#0f172a").text(primary, 50, y, { width: 495 });
    document.font("Noto").fontSize(7.5).fillColor("#475569").text(secondary, 50, y + 16, { width: 495, height: 19, ellipsis: true });
    document.y = y + 42;
  }
}

export function reportPdfBuffer(table: ExportTable) {
  return pdfBuffer((document) => renderPdfTable(document, table));
}

async function warningTable(filters: ReportExportFilters, studentScope: Prisma.StudentWhereInput): Promise<ExportTable> {
  const report = await ReportsService.academicWarningStudents({ ...filters, page: 1, pageSize: 1000 }, studentScope);
  const items = [...report.items];
  for (let page = 2; page <= report.totalPages; page += 1) {
    const next = await ReportsService.academicWarningStudents({ ...filters, page, pageSize: 1000 }, studentScope);
    items.push(...next.items);
  }
  const level = (severity: string) => severity === "high" ? "Đỏ - Nguy cơ cao" : "Vàng - Cần lưu ý";
  const reason = (code: string) => ({
    LOW_TERM_GPA: "GPA học kỳ dưới ngưỡng",
    LOW_CUMULATIVE_GPA: "GPA tích lũy dưới ngưỡng",
    ACADEMIC_WARNING_DECISION: "Có quyết định cảnh báo",
  }[code] || code);
  const isSummer = report.reportContext.isSummer;
  return {
    title: isSummer
      ? "THEO DÕI MÔ TẢ KỲ PHỤ (KHÔNG CHÍNH THỨC)"
      : "BÁO CÁO DANH SÁCH SINH VIÊN CẢNH BÁO",
    subtitle: isSummer
      ? `${report.latestPeriod?.label || "Chưa xác định kỳ"} · ${report.reportContext.note} · ${report.reportContext.participantStudents}/${report.reportContext.scopedStudents} sinh viên có dữ liệu`
      : `${report.latestPeriod?.label || "Chưa xác định kỳ"} · Chính sách: ${report.policy.name} v${report.policy.version}`,
    sheetName: "Cảnh báo",
    columns: [
      { header: "MSSV", key: "studentCode", width: 16 },
      { header: "Họ và tên", key: "studentName", width: 30 },
      { header: "Lớp", key: "classCode", width: 15 },
      { header: "CTĐT", key: "programCode", width: 18 },
      { header: "Mức cảnh báo", key: "severity", width: 20 },
      { header: "GPA học kỳ", key: "termGpa4", width: 14 },
      { header: "GPA tích lũy", key: "cumulativeGpa4", width: 15 },
      { header: "Nguyên nhân", key: "reasons", width: 45 },
      { header: "Hỗ trợ đã giải quyết", key: "resolvedActions", width: 20 },
    ],
    rows: items.map((item) => ({
      studentCode: item.studentCode,
      studentName: item.studentName,
      classCode: item.classCode,
      programCode: item.programCode,
      severity: level(item.severity),
      termGpa4: item.termGpa4,
      cumulativeGpa4: item.cumulativeGpa4,
      reasons: item.reasonCodes.map(reason).join("; "),
      resolvedActions: item.resolvedActions,
    })),
    summary: [
      ["Tổng sinh viên trong phạm vi", report.counts.students],
      ["Nguy cơ cao", report.counts.high],
      ["Cần lưu ý", report.counts.medium],
      ["Đủ dữ liệu và không cảnh báo", report.counts.safe],
      ["Chưa đủ dữ liệu kỳ", report.counts.unassessed],
    ],
  };
}

async function scopedStudents(filters: ReportExportFilters, studentScope: Prisma.StudentWhereInput) {
  let cohortClassCodes: string[] | undefined;
  if (filters.cohortId) {
    cohortClassCodes = (await prisma.class.findMany({
      where: { cohortId: filters.cohortId, deletedAt: null },
      select: { classId: true },
    })).map((item) => item.classId);
  }
  return prisma.student.findMany({
    where: {
      AND: [
        { deletedAt: null },
        studentScope,
        filters.classCode ? { sClassStudentId: filters.classCode } : {},
        filters.programCode ? { sStudyProgramId: filters.programCode } : {},
        cohortClassCodes ? { sClassStudentId: { in: cohortClassCodes } } : {},
      ],
    },
    select: { id: true, sStudentId: true, sFullName: true, sClassStudentId: true, sStudyProgramId: true },
    orderBy: { sStudentId: "asc" },
  });
}

async function conductTable(filters: ReportExportFilters, studentScope: Prisma.StudentWhereInput): Promise<ExportTable> {
  const students = await scopedStudents(filters, studentScope);
  const studentMap = new Map(students.map((item) => [item.id, item]));
  const records = students.length ? await prisma.studentConductRecord.findMany({
    where: {
      studentId: { in: students.map((item) => item.id) },
      ...(filters.academicTermId ? { academicTermId: filters.academicTermId } : {}),
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    },
    orderBy: [{ academicYearId: "asc" }, { academicTermId: "asc" }, { sStudentId: "asc" }],
  }) : [];
  const [terms, years] = await Promise.all([
    prisma.academicTerm.findMany({ where: { id: { in: [...new Set(records.map((item) => item.academicTermId))] } } }),
    prisma.academicYear.findMany({ where: { id: { in: [...new Set(records.map((item) => item.academicYearId))] } } }),
  ]);
  const termMap = new Map(terms.map((item) => [item.id, item]));
  const yearMap = new Map(years.map((item) => [item.id, item]));
  return {
    title: "BÁO CÁO KẾT QUẢ RÈN LUYỆN",
    sheetName: "Rèn luyện",
    columns: [
      { header: "MSSV", key: "studentCode", width: 16 }, { header: "Họ và tên", key: "studentName", width: 30 },
      { header: "Lớp", key: "classCode", width: 15 }, { header: "CTĐT", key: "programCode", width: 18 },
      { header: "Năm học", key: "academicYear", width: 14 }, { header: "Học kỳ", key: "term", width: 18 },
      { header: "Điểm công nhận", key: "score", width: 18 }, { header: "Xếp loại", key: "classification", width: 16 },
      { header: "Trạng thái", key: "approval", width: 18 },
    ],
    rows: records.map((record) => {
      const student = studentMap.get(record.studentId);
      const score = record.statusId === "1" ? numberOrNull(record.lastScore) : null;
      return {
        studentCode: student?.sStudentId || record.sStudentId,
        studentName: student?.sFullName || "",
        classCode: student?.sClassStudentId || record.sClassStudentId || "",
        programCode: student?.sStudyProgramId || "",
        academicYear: yearMap.get(record.academicYearId)?.sYearCode || "",
        term: termMap.get(record.academicTermId)?.sTermName || termMap.get(record.academicTermId)?.sTermCode || "",
        score,
        classification: score == null ? "" : classifyConductScore(score),
        approval: conductApproval(record.statusId, record.lastScore).label,
      };
    }),
  };
}

async function progressTable(filters: ReportExportFilters, studentScope: Prisma.StudentWhereInput): Promise<ExportTable> {
  const students = await scopedStudents(filters, studentScope);
  const studentIds = students.map((item) => item.id);
  const periodTermIds = filters.academicYearId
    ? (await prisma.academicTerm.findMany({ where: { academicYearId: filters.academicYearId }, select: { id: true } })).map((item) => item.id)
    : undefined;
  const periodRunIds = filters.academicTermId || periodTermIds
    ? (await prisma.trainingProgressCompletionRun.findMany({
        where: {
          status: "completed",
          assessmentAcademicTermId: filters.academicTermId || { in: periodTermIds || [] },
        },
        select: { id: true },
      })).map((item) => item.id)
    : undefined;
  const rows = studentIds.length ? await prisma.trainingProgressCompletionStudentResult.findMany({
    where: {
      studentId: { in: studentIds },
      ...(filters.classCode ? { sClassStudentId: filters.classCode } : {}),
      ...(filters.programCode ? { sProgramCode: filters.programCode } : {}),
      ...(periodRunIds ? { runId: { in: periodRunIds } } : {}),
    },
    orderBy: [{ calculatedAt: "desc" }, { sStudentId: "asc" }],
  }) : [];
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.studentId)) latest.set(row.studentId, row);
  return {
    title: "BẢNG TỔNG HỢP TIẾN ĐỘ CHƯƠNG TRÌNH ĐÀO TẠO",
    sheetName: "Tiến độ CTĐT",
    columns: [
      { header: "MSSV", key: "studentCode", width: 16 }, { header: "Họ và tên", key: "studentName", width: 30 },
      { header: "Lớp", key: "classCode", width: 15 }, { header: "CTĐT", key: "programCode", width: 18 },
      { header: "Tiến độ", key: "scheduleStatus", width: 20 }, { header: "Hoàn thành CTĐT", key: "completionStatus", width: 20 },
      { header: "Kế hoạch đến hạn", key: "duePlans", width: 18 }, { header: "HP bắt buộc thiếu", key: "missingMandatory", width: 18 },
      { header: "TC tự chọn thiếu", key: "missingElectiveCredits", width: 18 }, { header: "HP chờ điểm", key: "pending", width: 15 },
    ],
    rows: [...latest.values()].sort((a, b) => a.sStudentId.localeCompare(b.sStudentId)).map((row) => ({
      studentCode: row.sStudentId, studentName: row.sStudentName, classCode: row.sClassStudentId || "", programCode: row.sProgramCode || "",
      scheduleStatus: row.scheduleStatus, completionStatus: row.programCompletionStatus,
      duePlans: `${row.duePlansPassed}/${row.duePlansTotal}`,
      missingMandatory: row.missingMandatoryCourses,
      missingElectiveCredits: row.missingElectiveCredits,
      pending: row.pendingResultCourses,
    })),
  };
}

async function supportTable(filters: ReportExportFilters, studentScope: Prisma.StudentWhereInput): Promise<ExportTable> {
  const students = await scopedStudents(filters, studentScope);
  const studentMap = new Map(students.map((item) => [item.id, item]));
  const actions = students.length ? await prisma.warningAction.findMany({
    where: { studentId: { in: students.map((item) => item.id) } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  }) : [];
  const assigneeIds = [...new Set(actions.flatMap((item) => item.assignedUserId ? [item.assignedUserId] : []))];
  const assignees = assigneeIds.length ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, fullName: true } }) : [];
  const assigneeMap = new Map(assignees.map((item) => [item.id, item.fullName]));
  return {
    title: "NHẬT KÝ CAN THIỆP VÀ HỖ TRỢ SINH VIÊN",
    sheetName: "Nhật ký hỗ trợ",
    columns: [
      { header: "MSSV", key: "studentCode", width: 16 }, { header: "Họ và tên", key: "studentName", width: 30 },
      { header: "Lớp", key: "classCode", width: 15 }, { header: "Loại hành động", key: "actionType", width: 20 },
      { header: "Trạng thái", key: "status", width: 18 }, { header: "Người thực hiện", key: "actor", width: 24 },
      { header: "Người phụ trách", key: "assignee", width: 24 }, { header: "Hạn xử lý", key: "dueDate", width: 16 },
      { header: "Hoàn tất lúc", key: "resolvedAt", width: 20 }, { header: "Nội dung", key: "note", width: 55 },
    ],
    rows: actions.map((action) => {
      const student = studentMap.get(action.studentId);
      return {
        studentCode: student?.sStudentId || "", studentName: student?.sFullName || "", classCode: student?.sClassStudentId || "",
        actionType: action.actionType, status: action.status, actor: action.actorName || "",
        assignee: action.assignedUserId ? assigneeMap.get(action.assignedUserId) || "" : "",
        dueDate: action.dueDate?.toLocaleDateString("vi-VN") || "",
        resolvedAt: action.resolvedAt?.toLocaleString("vi-VN") || "", note: action.note,
      };
    }),
  };
}

async function studentProfilePdf(studentId: string, studentScope: Prisma.StudentWhereInput) {
  const student = await prisma.student.findFirst({
    where: { AND: [{ ...studentIdWhere(studentId), deletedAt: null }, studentScope] },
  });
  if (!student) return null;
  const [summaries, conduct, decisions, warnings, actions, progress] = await Promise.all([
    prisma.studentTermSummary.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "asc" } }),
    prisma.studentConductRecord.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "asc" } }),
    prisma.studentDecision.findMany({ where: { studentId: student.id, deletedAt: null }, orderBy: [{ sSignDate: "desc" }, { createdAt: "desc" }] }),
    prisma.academicWarningStudentResult.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.warningAction.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.trainingProgressCompletionStudentResult.findFirst({ where: { studentId: student.id }, orderBy: { calculatedAt: "desc" } }),
  ]);
  const termIds = [...new Set([...summaries.map((item) => item.academicTermId), ...conduct.map((item) => item.academicTermId), ...decisions.map((item) => item.academicTermId)])];
  const terms = await prisma.$queryRaw<Array<{ id: string; label: string }>>`
    SELECT t.id::text, concat(t.s_term_code, ' ', y.s_year_code) AS label
    FROM academic_terms t JOIN academic_years y ON y.id = t.academic_year_id
    WHERE t.id = ANY(${termIds}::uuid[])
  `;
  const termMap = new Map(terms.map((item) => [item.id, item.label]));
  const body = await pdfBuffer((document) => {
    renderPdfHeading(document, "HỒ SƠ THEO DÕI SINH VIÊN", `${student.sStudentId} · ${student.sFullName}`);
    const facts = [
      ["Lớp", student.sClassStudentId || "Chưa phân lớp"], ["Chương trình", student.sStudyProgramId || "Chưa xác định"],
      ["Ngày sinh", student.sBirthDate.toLocaleDateString("vi-VN")], ["Giới tính", student.sGender || "Chưa cập nhật"],
    ];
    for (const [label, value] of facts) {
      document.font("NotoBold").fontSize(9).fillColor("#334155").text(`${label}: `, { continued: true });
      document.font("Noto").fillColor("#0f172a").text(value);
    }
    const section = (title: string) => {
      ensurePdfSpace(document, 55);
      document.moveDown(0.8).font("NotoBold").fontSize(12).fillColor("#166534").text(title);
      document.moveDown(0.35);
    };
    section("1. Kết quả học tập");
    if (!summaries.length) document.font("Noto").fontSize(9).fillColor("#64748b").text("Chưa có dữ liệu học tập.");
    summaries.forEach((item) => {
      ensurePdfSpace(document);
      document.font("Noto").fontSize(8.5).fillColor("#0f172a").text(
        `${termMap.get(item.academicTermId) || "Học kỳ chưa xác định"}: GPA 4 = ${numberOrNull(item.gpa4) ?? "—"}; GPA tích lũy = ${numberOrNull(item.cumulativeGpa4) ?? "—"}; TC đạt = ${numberOrNull(item.creditsEarned) ?? "—"}`,
      );
    });
    section("2. Kết quả rèn luyện");
    if (!conduct.length) document.font("Noto").fontSize(9).fillColor("#64748b").text("Chưa có dữ liệu rèn luyện.");
    conduct.forEach((item) => {
      const score = item.statusId === "1" ? numberOrNull(item.lastScore) : null;
      document.font("Noto").fontSize(8.5).fillColor("#0f172a").text(
        `${termMap.get(item.academicTermId) || "Học kỳ chưa xác định"}: ${score ?? "Chưa công nhận"}${score == null ? "" : ` điểm · ${classifyConductScore(score)}`}`,
      );
    });
    section("3. Tiến độ chương trình đào tạo");
    document.font("Noto").fontSize(8.5).fillColor("#0f172a").text(progress
      ? `Trạng thái tiến độ: ${progress.scheduleStatus}; hoàn thành CTĐT: ${progress.programCompletionStatus}; học phần bắt buộc thiếu: ${progress.missingMandatoryCourses}; tín chỉ tự chọn thiếu: ${progress.missingElectiveCredits}.`
      : "Chưa có kết quả đánh giá tiến độ CTĐT.");
    section("4. Cảnh báo và quyết định");
    warnings.forEach((item) => {
      ensurePdfSpace(document);
      document.font("Noto").fontSize(8.5).fillColor("#0f172a").text(
        `${item.createdAt.toLocaleString("vi-VN")}: ${item.maxSeverity} · GPA kỳ ${numberOrNull(item.termGpa4) ?? "—"} · GPA tích lũy ${numberOrNull(item.cumulativeGpa4) ?? "—"} · ${item.reasonCount} nguyên nhân`,
      );
    });
    decisions.forEach((item) => {
      ensurePdfSpace(document);
      document.font("Noto").fontSize(8.5).fillColor("#0f172a").text(
        `${item.sSignDate?.toLocaleDateString("vi-VN") || termMap.get(item.academicTermId) || "Chưa rõ ngày"}: Quyết định ${item.sDecisionNumber} · ${item.sDecisionName}`,
      );
    });
    if (!warnings.length && !decisions.length) document.font("Noto").fontSize(9).fillColor("#64748b").text("Chưa có cảnh báo hoặc quyết định.");
    section("5. Nhật ký hỗ trợ");
    if (!actions.length) document.font("Noto").fontSize(9).fillColor("#64748b").text("Chưa có hành động hỗ trợ.");
    actions.forEach((item) => {
      ensurePdfSpace(document, 42);
      document.font("NotoBold").fontSize(8.5).fillColor("#0f172a").text(`${item.createdAt.toLocaleString("vi-VN")} · ${item.actionType} · ${item.status}`);
      document.font("Noto").fontSize(8).fillColor("#475569").text(item.note);
    });
  });
  return { body, studentCode: student.sStudentId };
}

export class ExportService {
  static async create(
    format: ExportFormat,
    type: ExportType,
    filters: ReportExportFilters,
    studentScope: Prisma.StudentWhereInput,
  ): Promise<ExportArtifact | null> {
    if (type === "student-profile") {
      if (format !== "pdf" || !filters.studentId) return null;
      const profile = await studentProfilePdf(filters.studentId, studentScope);
      if (!profile) return null;
      return {
        body: profile.body,
        contentType: "application/pdf",
        fileName: `${safeExportStem(`ho_so_${profile.studentCode}`)}.pdf`,
        rowCount: 1,
      };
    }
    const table = type === "warnings"
      ? await warningTable(filters, studentScope)
      : type === "progress"
        ? await progressTable(filters, studentScope)
        : type === "conduct"
          ? await conductTable(filters, studentScope)
          : await supportTable(filters, studentScope);
    const body = format === "xlsx" ? await workbookBuffer(table) : await reportPdfBuffer(table);
    return {
      body,
      contentType: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      fileName: buildExportFileName(type, format),
      rowCount: table.rows.length,
    };
  }
}
