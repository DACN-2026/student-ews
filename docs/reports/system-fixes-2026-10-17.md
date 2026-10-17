# Báo cáo sửa hệ thống — 17/10/2026

Đã xử lý **18 vấn đề trong báo cáo rà soát**. Các thay đổi chính:

**Nguyên tắc dữ liệu:** API quản lý đào tạo của Trường là nguồn chuẩn. Các vấn đề trong báo cáo là vấn đề của hệ thống chúng ta khi tiếp nhận, xử lý, phân quyền và hiển thị; không phải kết luận dữ liệu của Trường sai. Các bản sửa không tính lại GPA để thay kết quả của Trường. Sửa lịch sử điểm chỉ bảo đảm hiển thị đúng lần học theo kỳ; cảnh báo và dự báo nội bộ không thay thế kết quả chính thức.

| Nhóm | Những gì đã sửa |
| --- | --- |
| **Phân quyền** — F01, F02, F07, F10 | API kiểm tra quyền hiện hành trong cơ sở dữ liệu; tài khoản bị khóa hoặc thu hồi quyền không tiếp tục dùng quyền cũ trong JWT. Tổng tốt nghiệp giới hạn đúng lớp cố vấn. Quyền xem hồ sơ không tự cho phép đọc GPA. Tab, nút tạo và xuất dữ liệu được kiểm tra theo quyền. |
| **Điểm và hồ sơ** — F03, F05 | Lọc học kỳ giữ đúng lần học cũ, kể cả F trước khi học lại đạt. API có chế độ xem từng lần học. Tạo/sửa/import ghép đúng họ tên và cập nhật tên đầy đủ. |
| **Nhập/xuất sinh viên** — F11, F12 | Nhập có bước xem trước, báo lỗi từng bản ghi; giữ nguyên trường không được gửi và không tự khôi phục hồ sơ đã xóa. Xuất dữ liệu theo bộ lọc đang chọn. |
| **Học phí** — F06 | Đồng bộ tên trường giữa giao diện và API; chọn đối tượng từ danh mục thật; kiểm tra mã và tỷ lệ miễn giảm, giữ đúng giá trị 0%. |
| **Đào tạo** — F04, F08, F09, F18 | Sửa lỗi giao diện sau tạo danh mục; tải đủ các trang học phần; xem được kế hoạch lưu trữ. Bỏ các ô tín chỉ/giờ học không được danh mục chung lưu; chỉ dẫn nhập tại CTĐT. |
| **Trải nghiệm và kiểm tra** — F13–F17 | Lỗi có thông báo và nút thử lại; đăng nhập trở về trang đang xem. Cảnh báo nội dung chưa lưu khi đóng biểu mẫu/rời trang qua liên kết hoặc tải lại. Bổ sung thao tác bàn phím, nhãn đăng nhập và thông báo lỗi trợ năng. Sửa runner test Windows và smoke test theo luồng phiên hiện tại của Next.js. |

Ngoài ra, đã sửa kiểm tra UUID để endpoint **xem trước đánh giá** không bị nhận nhầm là ID sai.

## Kết quả kiểm tra

- **422 test đạt:** backend 375, frontend 47; 1 test backend được bỏ qua theo cấu hình có sẵn.
- **Build production, TypeScript và lint:** đạt; lint còn 17 cảnh báo đã có từ trước, không có lỗi.
- **Smoke test:** đạt trên bản production.
- **9 nhóm kiểm tra API có xác thực:** đạt trên bản production. Thống kê cố vấn khớp **7/7 và 50/50**; tải đủ **144 học phần**, xem được **35 kế hoạch lưu trữ**; lịch sử F được giữ; xuất đúng lớp; xem trước nhập không ghi hồ sơ.

Không thay đổi hàng loạt dữ liệu đang lưu, không chạy lại các đợt đánh giá và không gửi thông báo. Chưa kiểm thử trực quan trên trình duyệt vì phiên làm việc chưa có trình duyệt kết nối.

Bằng chứng API: [kết quả kiểm tra](system-fixes-verification-2026-10-17.json). Báo cáo trước khi sửa: [18 vấn đề đã rà soát](system-functional-audit-2026-10-17.md).
