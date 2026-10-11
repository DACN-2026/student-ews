const LEGAL_BASIS_INFO: Record<string, { title: string; summary: string }> = {
  QD600_FAILED_CREDIT_RATIO: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Cảnh báo học tập)",
    summary:
      "Điều 18 quy định đối chiếu cuối học kỳ chính khi tín chỉ không đạt vượt quá 50% tín chỉ đã đăng ký trong kỳ. Hệ thống loại SHCD và học phần điều kiện khỏi tỷ lệ học thuật; VT được theo dõi riêng để xác minh, không tự quy thành tín chỉ F.",
  },
  QD600_TERM_GPA: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm trung bình học kỳ)",
    summary:
      "Điều 18 khoản 1 điểm b quy định GPA học kỳ dưới 0,80 đối với học kỳ đầu tiên của khóa học hoặc dưới 1,00 đối với các học kỳ tiếp theo. Đây là mốc học vụ để đối chiếu; theo dõi sớm dùng các tiêu chí nội bộ riêng.",
  },
  QD600_TERM_GPA_FIRST_TERM: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm GPA học kỳ đầu)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 0.80 đối với học kỳ đầu tiên của khóa học.",
  },
  QD600_CONSECUTIVE_TERM_GPA: {
    title: "Tiêu chí lịch sử chưa được xác minh",
    summary:
      "Bản QĐ600 được đối chiếu không quy định GPA dưới 1,10 trong hai học kỳ liên tiếp. Không sử dụng tiêu chí này làm căn cứ học vụ.",
  },
  QD600_CUMULATIVE_GPA_BY_YEAR: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm trung bình tích lũy)",
    summary:
      "Quy chế quy định điểm trung bình tích lũy tối thiểu cần đạt theo từng năm đào tạo: Năm thứ nhất ≥ 1.20; Năm thứ hai ≥ 1.40; Năm thứ ba ≥ 1.60; Từ năm thứ tư trở đi ≥ 1.80.",
  },
  QD600_CUMULATIVE_GPA_NEAR_THRESHOLD: {
    title: "Theo dõi sớm GPA tích lũy sát ngưỡng",
    summary:
      "Hệ thống theo dõi các trường hợp có điểm GPA tích lũy gần sát ngưỡng cảnh báo theo năm học để sớm tư vấn và hỗ trợ sinh viên cải thiện kết quả.",
  },
  QD600_ACCUMULATED_DEBT_CREDITS: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Tín chỉ nợ đọng)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu tổng số tín chỉ nợ đọng (các học phần bị điểm F chưa được học lại cải thiện hoặc học môn thay thế hợp lệ) vượt quá 24 tín chỉ.",
  },
  ACCUMULATED_DEBT_CREDIT_RISK: {
    title: "Ngưỡng theo dõi nợ tín chỉ của hệ thống",
    summary: "Theo dõi nợ tín chỉ theo ngưỡng nội bộ của phiên bản chính sách dùng để đánh giá. Học lại đạt hoặc môn thay thế hợp lệ có thể giải quyết nợ; lịch sử F/VT được giữ nguyên. Ngưỡng học vụ Điều 18 QĐ600 vẫn là trên 24 tín chỉ.",
  },
  TRAINING_PROGRESS_CREDIT_DEFICIT: {
    title: "Quy định tiến độ đào tạo theo Khung CTĐT",
    summary:
      "Đánh giá tín chỉ thực tế so với kế hoạch học tập theo ngưỡng nội bộ của phiên bản chính sách dùng để đánh giá. Đủ tổng tín chỉ nhưng còn học phần bắt buộc đến hạn chưa hoàn thành cũng cần được theo dõi; tín chỉ tự chọn dư không thay thế các học phần này.",
  },
};

export function humanRuleName(code?: unknown) {
  const early: Record<string, string> = {
    EARLY_EXAM_ABSENCE: "Học phần vắng thi (VT) cần xác minh",
    EARLY_MISSING_TERM_DATA: "Thiếu dữ liệu kỳ xét cần ưu tiên xác minh", EARLY_NO_REGISTRATION: "Chưa ghi nhận đăng ký học phần",
    EARLY_NO_REGISTRATION_CONSECUTIVE: "Chưa ghi nhận đăng ký hai kỳ chính liên tiếp",
    ACADEMIC_WARNING_SEQUENCE_REVIEW: "Lịch sử quyết định cảnh báo liên tiếp", ACADEMIC_REPRIEVE_FOLLOWUP: "Theo dõi sau cứu xét",
    ACADEMIC_APPEAL_ELIGIBILITY_REVIEW: "Điều kiện đề nghị cứu xét",
    EARLY_LOW_TERM_GPA: "GPA học kỳ thấp", EARLY_LOW_CUMULATIVE_GPA: "GPA tích lũy thấp",
    EARLY_TERM_GPA_DROP: "GPA học kỳ suy giảm", EARLY_CUMULATIVE_GPA_DROP: "GPA tích lũy suy giảm",
    EARLY_FAILED_CREDIT_RATIO: "Tỷ lệ tín chỉ không đạt cần theo dõi", EARLY_REPEATED_COURSE_FAILURE: "Học phần không đạt nhiều lần",
    EARLY_LOW_CONDUCT_SCORE: "Điểm rèn luyện thấp", EARLY_CONDUCT_SCORE_DROP: "Điểm rèn luyện suy giảm",
  };
  if (early[String(code)]) return early[String(code)];
  if (code === "QD600_TERM_GPA_FIRST_TERM") return "Điểm trung bình học kỳ đầu tiên";
  if (code === "QD600_CONSECUTIVE_TERM_GPA") return "Điểm trung bình 2 học kỳ liên tiếp";
  if (code === "QD600_FAILED_CREDIT_RATIO") return "Tỷ lệ tín chỉ không đạt trong học kỳ";
  if (code === "QD600_TERM_GPA") return "Điểm trung bình học kỳ (GPA)";
  if (code === "QD600_CUMULATIVE_GPA_BY_YEAR") return "Điểm trung bình tích lũy theo năm học";
  if (code === "QD600_CUMULATIVE_GPA_NEAR_THRESHOLD") return "GPA tích lũy tiệm cận ngưỡng cảnh báo";
  if (code === "QD600_ACCUMULATED_DEBT_CREDITS") return "Tín chỉ nợ tích lũy";
  if (code === "ACCUMULATED_DEBT_CREDIT_RISK") return "Mức theo dõi nợ tín chỉ tích lũy";
  if (code === "TRAINING_PROGRESS_CREDIT_DEFICIT") return "Tiến độ tín chỉ theo CTĐT";
  return "Tiêu chí quy chế";
}

export function getLegalInfo(reason: { reasonCode?: string; ruleCode?: string; details?: Record<string, unknown> }) {
  const code = String(
    ("details" in reason && reason.details?.ruleCode) ||
    ("reasonCode" in reason && reason.reasonCode) ||
    ("ruleCode" in reason && reason.ruleCode) ||
    ""
  );
  if (code.includes("NO_REGISTRATION") || code === "EARLY_MISSING_TERM_DATA" || code.startsWith("ACADEMIC_")) return { title: "Đối chiếu tình trạng học và hồ sơ học vụ", summary: "QĐ600 Điều 18–19 và TB1270 (riêng K45–K48 chính quy, HKII 2024–2025). Hệ thống ưu tiên xác minh thiếu dữ liệu, đăng ký và hiệu lực quyết định. Thiếu bản ghi không chứng minh không đăng ký; nguyện vọng nghỉ chưa được phê duyệt không phải căn cứ miễn. Quyết định xử lý học vụ thuộc thẩm quyền của Trường." };
  if (code.startsWith("EARLY_")) return { title: "Tiêu chí theo dõi sớm của hệ thống", summary: "Ngưỡng nội bộ được cấu hình và lưu theo phiên bản chính sách để ưu tiên tư vấn, hỗ trợ sinh viên. Tiêu chí này không phải điều kiện cảnh báo học vụ QĐ600." };
  if (code.includes("FAILED_CREDIT_RATIO")) return LEGAL_BASIS_INFO.QD600_FAILED_CREDIT_RATIO;
  if (code.includes("FIRST_TERM")) return LEGAL_BASIS_INFO.QD600_TERM_GPA_FIRST_TERM;
  if (code.includes("CONSECUTIVE")) return LEGAL_BASIS_INFO.QD600_CONSECUTIVE_TERM_GPA;
  if (code.includes("TERM_GPA")) return LEGAL_BASIS_INFO.QD600_TERM_GPA;
  if (code.includes("NEAR_THRESHOLD")) return LEGAL_BASIS_INFO.QD600_CUMULATIVE_GPA_NEAR_THRESHOLD;
  if (code.includes("CUMULATIVE_GPA")) return LEGAL_BASIS_INFO.QD600_CUMULATIVE_GPA_BY_YEAR;
  if (code.includes("ACCUMULATED_DEBT_RISK") || code === "ACCUMULATED_DEBT_CREDIT_RISK") return LEGAL_BASIS_INFO.ACCUMULATED_DEBT_CREDIT_RISK;
  if (code.includes("ACCUMULATED_DEBT")) return LEGAL_BASIS_INFO.QD600_ACCUMULATED_DEBT_CREDITS;
  if (code.includes("PROGRESS")) return LEGAL_BASIS_INFO.TRAINING_PROGRESS_CREDIT_DEFICIT;
  return {
    title: "Quy chế đào tạo hiện hành",
    summary: "Quy định chuẩn học vụ và tiến độ học tập áp dụng cho chương trình đào tạo đại học chính quy.",
  };
}

export function getHumanUnEvaluatedExplanation(rule: Record<string, unknown>): string {
  const explanation = String(rule.explanation || "");
  const code = String(rule.ruleCode || "");
  if (rule.reasonCode === "TERM_GPA_MISSING") return explanation;
  if (rule.reasonCode === "EXAM_ABSENCE_REQUIRES_VERIFICATION") return explanation;
  if (rule.reasonCode === "CURRICULUM_SCOPE_REQUIRES_VERIFICATION") return explanation;
  if (code.includes("ACCUMULATED_DEBT") || explanation.includes("semantics") || explanation.includes("Không cộng lịch sử")) {
    return "Cần đối chiếu lịch sử học lại môn rớt và môn tự chọn thay thế để xác định chính xác số tín chỉ F còn nợ đọng theo Điều 18.";
  }
  if (code.includes("TERM_GPA") && (explanation.includes("hệ 4") || explanation.includes("không có GPA") || explanation.includes("vắng thi"))) {
    return "Học kỳ đánh giá chỉ có học phần ghi nhận vắng thi (VT) hoặc chưa có điểm số hợp lệ để tính GPA học kỳ chính thức.";
  }
  return explanation || "Chưa đủ dữ liệu nguồn để đối chiếu tự động tiêu chí này.";
}
