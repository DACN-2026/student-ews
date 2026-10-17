# Sửa đối soát môn học ghép đang chờ điểm

Đã sửa trường hợp Hoàng Xuân Nghĩa — **2347A048**, CTĐT **CQ23CT-PM**. Môn **TN1001D — Toán cao cấp B1, 3 TC**, đăng ký **HK01 năm 2026–2027**, không còn tự tạo yêu cầu đối soát chỉ vì khác mã trong CTĐT khi chưa có kết quả.

- Giữ mã đăng ký và kỳ học thực tế; hiển thị **Chờ kết quả** trong Bảng điểm/chi tiết tiến độ và Dự kiến tốt nghiệp. Học ghép không làm thay đổi CTĐT của sinh viên.
- Không biến `IsPass=null` của API thành kết quả không đạt. Không cộng tín chỉ đạt, tự công nhận tương đương hoặc xóa nợ cũ bằng một lần đăng ký đang chờ điểm.
- Kết quả đã có điểm, VT và việc công nhận môn khác mã vẫn được kiểm tra theo dữ liệu nguồn; không mở ánh xạ tương đương theo tên.
- Cập nhật **7 phạm vi, 622 kết quả dự kiến tốt nghiệp** sang phiên bản `curriculum-gap-v6`; giữ các đợt cũ để truy vết. Điểm, GPA và tín chỉ của cả 622 sinh viên không đổi. Đối chiếu 13 nhóm dữ liệu nguồn/cảnh báo trước và sau khớp hoàn toàn.

**Hồ sơ Nghĩa:** lỗi đối soát mã học phần đã hết. Trạng thái tổng chuyển từ *Cần đối soát* sang *Chưa đủ điều kiện* theo các yêu cầu CTĐT còn lại. Cờ kiểm tra **GDQP&AN** vẫn còn vì phân hệ chưa xác nhận điều kiện này; không tự coi là đạt và không kết luận API của Trường thiếu dữ liệu.

**Kiểm chứng:** 462 test đạt, 1 bỏ qua; build production và TypeScript của backend/frontend đạt. 28 kiểm tra API có xác thực qua backend/frontend đạt, đọc đủ 622 sinh viên mỗi phía; 6 kiểm tra render trên dữ liệu thật đạt. Chưa kiểm tra thao tác trực quan trên trình duyệt.

Bằng chứng: [Kết quả cập nhật và kiểm chứng](cross-cohort-pending-registrations-2026-10-17.json).
