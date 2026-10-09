const LEGAL_BASIS_INFO: Record<string, { title: string; summary: string }> = {
  QD600_FAILED_CREDIT_RATIO: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Cảnh báo học tập)",
    summary:
      "Điều 18 quy định cảnh báo vào cuối học kỳ chính nếu tín chỉ không đạt vượt quá 50% tín chỉ đã đăng ký trong kỳ. Hệ thống loại SHCD và học phần điều kiện khỏi tỷ lệ học thuật; VT được tính là chưa đạt.",
  },
  QD600_TERM_GPA: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm trung bình học kỳ)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 0.80 đối với học kỳ đầu tiên, dưới 1.00 đối với các học kỳ tiếp theo; hoặc đạt dưới 1.10 trong hai học kỳ liên tiếp.",
  },
  QD600_TERM_GPA_FIRST_TERM: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm GPA học kỳ đầu)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 0.80 đối với học kỳ đầu tiên của khóa học.",
  },
  QD600_CONSECUTIVE_TERM_GPA: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (GPA 2 học kỳ liên tiếp)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 1.10 trong hai học kỳ liên tiếp.",
  },
  QD600_CUMULATIVE_GPA_BY_YEAR: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm trung bình tích lũy)",
    summary:
      "Quy chế quy định điểm trung bình tích lũy tối thiểu cần đạt theo từng năm đào tạo: Năm thứ nhất ≥ 1.20; Năm thứ hai ≥ 1.40; Năm thứ ba ≥ 1.60; Từ năm thứ tư trở đi ≥ 1.80.",
  },
  QD600_CUMULATIVE_GPA_NEAR_THRESHOLD: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Tiệm cận ngưỡng tích lũy)",
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
    summary: "Nợ tích lũy 13–18 tín chỉ: Cần chú ý; từ 19 tín chỉ: Nguy cơ cao. Đạt đủ nhóm lựa chọn của chính học kỳ thì không còn nợ các môn tự chọn trong nhóm đó. Bù nợ của học kỳ khác cần môn thuộc danh sách tự chọn trong cùng khối CTĐT K44 và có tín chỉ đạt dư so với kế hoạch học kỳ. Học hè đạt lại môn tương ứng cũng giải quyết nợ; lịch sử F/VT được giữ nguyên. Ngưỡng cảnh báo theo Điều 18 QĐ600 vẫn là trên 24 tín chỉ.",
  },
  TRAINING_PROGRESS_CREDIT_DEFICIT: {
    title: "Quy định tiến độ đào tạo theo Khung CTĐT",
    summary:
      "Đánh giá mức độ tích lũy tín chỉ thực tế so với kế hoạch học tập chuẩn theo từng học kỳ. Chậm từ 4–11 tín chỉ thuộc mức 'Cần chú ý'; chậm từ 12 tín chỉ trở lên thuộc mức 'Nguy cơ cao'. Đủ tổng tín chỉ nhưng còn học phần bắt buộc đến hạn chưa hoàn thành cũng cần được theo dõi; tín chỉ tự chọn dư không thay thế những học phần này.",
  },
};

export function humanRuleName(code?: unknown) {
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
  if (code.includes("ACCUMULATED_DEBT") || explanation.includes("semantics") || explanation.includes("Không cộng lịch sử")) {
    return "Cần đối chiếu lịch sử học lại môn rớt và môn tự chọn thay thế để xác định chính xác số tín chỉ F còn nợ đọng theo Điều 18.";
  }
  if (code.includes("TERM_GPA") && (explanation.includes("hệ 4") || explanation.includes("không có GPA") || explanation.includes("vắng thi"))) {
    return "Học kỳ đánh giá chỉ có học phần ghi nhận vắng thi (VT) hoặc chưa có điểm số hợp lệ để tính GPA học kỳ chính thức.";
  }
  return explanation || "Chưa đủ dữ liệu nguồn để đối chiếu tự động tiêu chí này.";
}
