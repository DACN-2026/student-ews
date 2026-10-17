/** Translate technical wording in saved academic explanations without modifying stored evidence. */
export function academicExplanation(text: string) {
  return text
    .replace(/\bMISSING_RULE:\s*/g, "")
    .replace(/\bisPass của API Trường\b/gi, "kết quả đạt hoặc không đạt do Trường ghi nhận")
    .replace(/\bisPass\b/gi, "kết quả đạt hoặc không đạt")
    .replace(/theo API(?: Trường)?\b/g, "theo kết quả do Trường ghi nhận")
    .replace(/từ API(?: Trường)?\b/g, "từ hệ thống đào tạo của Trường")
    .replace(/dữ liệu API(?: Trường)?\b/g, "dữ liệu của Trường")
    .replace(/\bAPI Trường\b/g, "hệ thống đào tạo của Trường")
    .replace(/\bAPI chưa có\b/g, "Hệ thống đào tạo của Trường chưa ghi nhận")
    .replace(/semantics nguồn/g, "cách ghi nhận dữ liệu của Trường");
}
