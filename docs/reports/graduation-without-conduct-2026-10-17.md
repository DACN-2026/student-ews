# Bỏ điểm rèn luyện khỏi Dự kiến tốt nghiệp — 17/10/2026

**Đã bỏ điểm rèn luyện khỏi chức năng Dự kiến tốt nghiệp.** Điểm rèn luyện trong Hồ sơ sinh viên được giữ nguyên; phần Cảnh báo học tập không thay đổi.

- Không còn tiêu chí rèn luyện trong tính kết quả, kiểm tra quy tắc, mức độ sẵn sàng hoặc lý do cần đối soát.
- Gỡ điểm rèn luyện khỏi giao diện chi tiết và cột trong file xuất Excel/PDF.
- Các đợt cũ được đọc theo phạm vi mới: bỏ tiêu chí rèn luyện khi hiển thị trạng thái, lọc danh sách và thống kê; giữ bản ghi/snapshot gốc để truy vết. Những lý do cần đối soát khác vẫn có hiệu lực.
- Tạo kết quả mới `curriculum-gap-v5` cho **7 phạm vi, 622 sinh viên**. Các quy tắc còn lại, GPA và số tín chỉ không đổi.

| Trạng thái hiện hành | Sau cập nhật |
| --- | ---: |
| Chờ kết quả điểm | 76 |
| Cần đối soát | 1 |
| Chưa đủ điều kiện theo các yêu cầu còn lại | 545 |
| **Tổng** | **622** |

Cờ yêu cầu đối soát giảm từ **622 xuống 1**. Trường hợp còn lại cần đối chiếu học phần; không còn hồ sơ bị đối soát vì rèn luyện. Bỏ tiêu chí này không tự coi các điều kiện khác là đã đạt.

**Kiểm chứng:** 459 test đạt, 1 bỏ qua theo cấu hình; TypeScript, build production và smoke test đạt. Lint 0 lỗi, 16 cảnh báo có sẵn. **106 kiểm tra API có xác thực đạt** qua backend/frontend, gồm đủ 622 kết quả mỗi phía, các đợt cũ, danh sách và Excel/PDF. Kiểm tra render không còn rèn luyện, kể cả khi nhận dữ liệu cũ có trường này. Chưa kiểm thử thao tác trực quan trên trình duyệt trong đợt này.

Dấu vân tay **14 nhóm dữ liệu/bản ghi** trước/sau khớp hoàn toàn, gồm điểm, lịch sử học, GPA, rèn luyện, cảnh báo học tập và các đợt tiến độ chuẩn. Chỉ các kết quả dẫn xuất phục vụ dự kiến tốt nghiệp được tạo mới.

Bằng chứng: [các đợt cập nhật và đối chiếu trước/sau](graduation-without-conduct-refresh-2026-10-17.json), [kiểm tra API và render](graduation-without-conduct-verification-2026-10-17.json).
