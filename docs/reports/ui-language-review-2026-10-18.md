# Rà soát cách diễn đạt trên giao diện — 18/10/2026

Đã rà soát các nhãn, thông báo và hướng dẫn trong mã giao diện: cảnh báo học tập, hồ sơ/bảng điểm, tiến độ, dự kiến tốt nghiệp, tổng quan, đào tạo, báo cáo, cấu hình và phân quyền. Các chỉnh sửa tập trung vào câu chữ; không thay đổi dữ liệu Trường, quy tắc tính toán hoặc kết quả đánh giá.

| Vấn đề | Đã sửa |
| --- | --- |
| Người dùng phải hiểu `API`, `isPass`, `RBAC`, “log kỹ thuật” | Dùng “kết quả do Trường ghi nhận”, “đạt/không đạt”, “phân quyền”, “chi tiết kiểm tra điều kiện tốt nghiệp”. |
| “Khớp nguồn”, “nguồn cùng mốc” không rõ đang so sánh gì | Ghi rõ so sánh kết quả cảnh báo đã lưu với dữ liệu hiện tại của cùng học kỳ xét; hướng dẫn kiểm tra thay đổi và đánh giá lại khi cần. |
| Điều kiện tốt nghiệp đang chờ xác nhận bị ghi “Chưa có dữ liệu” | Phân biệt “Chờ hoàn thành / xác nhận” và “Chưa thể đánh giá”; hiển thị lý do cụ thể của điều kiện. |
| “Cần đối soát”, “xác nhận ánh xạ” khó hiểu | Dùng trạng thái “Chưa thể kết luận” hoặc “Cần kiểm tra điều kiện”; nói rõ giáo vụ cần kiểm tra học phần tương ứng hoặc kế hoạch áp dụng. |
| Cảnh báo học tập ghi cả “rèn luyện”; hướng dẫn môn tự chọn mặc định “CTĐT K44” | Đổi thành “Học tập”; hướng dẫn theo chương trình của sinh viên, bỏ tên khóa cố định khỏi câu thông báo. |
| Bảng điểm, tín chỉ chuyển/miễn và hướng dẫn đăng ký dùng câu thiên về kỹ thuật | Nói rõ từng lần học, học kỳ do Trường ghi nhận, thời điểm công nhận tín chỉ và bước người dùng cần thực hiện. |
| Nội dung của lần đánh giá cũ vẫn chứa thuật ngữ kỹ thuật | Chuyển cách diễn đạt khi hiển thị; giữ nguyên bản ghi đã lưu. Giữ nguyên tên học phần, kể cả tên có chữ “API”. |

Kiểm tra: **57/57 bài kiểm thử đạt**, kiểm tra TypeScript và dựng Next.js thành công. Kiểm tra thêm 5 nội dung kết xuất: cảnh báo, dự kiến tốt nghiệp, tiến độ, bảng điểm và hướng dẫn chọn môn thay thế. Dùng dữ liệu hiện tại của Lưu Văn Cường và Hoàng Xuân Nghĩa cho các màn hình liên quan; nội dung dữ liệu đầu vào không thay đổi sau kết xuất.

Phạm vi xác minh là mã nguồn, kiểm thử và nội dung kết xuất; chưa kiểm tra trực quan mọi màn hình, thao tác và trạng thái trên trình duyệt. Các trường hợp thực sự chưa thể đánh giá vẫn giữ trạng thái chờ kiểm tra, không được đổi thành đạt.

Các vị trí chính để tra cứu thay đổi:

- [Giải thích cảnh báo](../../apps/frontend/lib/student-warning-view.ts), [nội dung quy định](../../apps/frontend/lib/warning-rule-details.ts), [đối chiếu số liệu](../../apps/frontend/components/warnings/WarningVerification.tsx).
- [Chi tiết tốt nghiệp](../../apps/frontend/components/graduation/ForecastDetail.tsx), [môn tự chọn thay thế](../../apps/frontend/components/graduation/ElectiveAlternatives.tsx).
- [Chi tiết tiến độ](../../apps/frontend/components/training-progress/StudentProgressDetail.tsx), [bảng điểm](../../apps/frontend/components/students/StudentTranscript.tsx).
- [Diễn đạt cho lời giải thích đã lưu](../../apps/frontend/lib/academic-explanation.ts).

Tham khảo cách viết thông báo và nhãn thao tác trong [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
