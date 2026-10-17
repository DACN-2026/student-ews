# Sửa đối chiếu môn khác mã — 17/10/2026

**Đã sửa yêu cầu ánh xạ không cần thiết:** nếu API ghi nhận đạt đúng mã môn trong CTĐT tại kỳ đang xét, môn cũ trùng tên không làm tiến độ bị treo đối chiếu.

| Mã cũ trong lịch sử | Mã thuộc CTĐT hiện tại | Môn học | Kết quả hồ sơ 2246B045 |
| --- | --- | --- | --- |
| 20HN1104 | 20CT2103 | Tiếng Anh chuyên ngành | Đạt đúng mã hiện tại |
| LH1001D | 20LH0001 | Pháp luật đại cương | Đạt đúng mã hiện tại |
| CT2106D | 20CT1202 | Nguyên lý lập trình hướng đối tượng | Đạt đúng mã hiện tại |

- Áp dụng thống nhất cho tiến độ đào tạo và phần đối chiếu nợ trong cảnh báo học tập. Giữ lịch sử mã cũ, chỉ tính tín chỉ môn hiện tại một lần.
- Không tự xác nhận tương đương theo tên. Nếu môn đúng mã chưa đạt, đang chờ kết quả hoặc lệch tín chỉ, vẫn giữ yêu cầu đối chiếu phù hợp.
- Giữ đúng mốc học kỳ: ở HK02 năm 2023–2024, ba môn hiện tại chưa có kết quả đạt; ở kỳ hè tiếp theo mới có một môn đạt; từ HK01 năm 2024–2025 cả ba đã đạt và không còn ba yêu cầu ánh xạ nói trên.
- Ở HK02 năm 2025–2026, tiến độ của 2246B045 đủ căn cứ tính và còn thiếu **2 TC** theo kế hoạch. Chỉ số nợ vẫn giữ trạng thái cần đối chiếu các lượt học khác ngoài CTĐT; bản sửa không che các vấn đề riêng đó hay kết luận API thiếu dữ liệu.

**Đã cập nhật:** tạo 56 đợt kết quả v23 với chính sách gốc, giữ các đợt cũ; 1 phạm vi lịch sử không còn cấu hình khóa/CTĐT được giữ nguyên. **622/622** kết quả hiện hành dùng v23. Mức cảnh báo tổng thể không đổi; hồ sơ 2246B045 vẫn ở mức Theo dõi nhưng phần tiến độ đã tính được thay vì bị chặn bởi ba yêu cầu ánh xạ sai.

**Bảo toàn dữ liệu:** dấu vân tay của điểm, đăng ký, tổng hợp học kỳ, chuyển miễn, quyết định và hồ sơ trước/sau đều khớp; **0 chênh lệch GPA**. Chỉ cập nhật kết quả xử lý và liên kết hồ sơ hỗ trợ nội bộ, không gửi thông báo.

**Kiểm tra:** 433 test đạt, 1 test bỏ qua theo cấu hình có sẵn; TypeScript và build production đạt; lint không có lỗi, còn 17 cảnh báo có sẵn. Smoke test và **6 kiểm tra API có xác thực** qua backend/frontend proxy đạt. Chưa kiểm tra trực quan trên trình duyệt.

Kết quả cập nhật dữ liệu và kiểm tra API được ghi tại [bằng chứng trước/sau](academic-warning-passed-code-fix-2026-10-17.json).
