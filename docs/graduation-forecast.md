# Dự kiến tốt nghiệp

## Nguồn quy định và phạm vi

`docs/2020_CTDT_K44.pdf` là CTĐT ngành CNTT khóa K44 của Trường Đại học Đà Lạt. Theo tài liệu, khối lượng tích lũy tối thiểu là 150 tín chỉ, gồm 104 tín chỉ bắt buộc và 46 tín chỉ tự chọn. GDTC và GDQP-AN là các yêu cầu chứng chỉ riêng. **Đăng ký học phần chưa chứng minh đã tích lũy tín chỉ**; chỉ kết quả đạt hợp lệ trong bảng điểm được cộng.

Quy tắc 150/104/46 đang có trong cơ sở dữ liệu dưới dạng rule toàn cục, không gắn mã CTĐT. Service bỏ qua các ngưỡng tín chỉ và GPA toàn cục; chỉ nhận ngưỡng gắn chính xác `trainingProgramId` của đợt đánh giá, có thể giới hạn thêm `cohortId`. Không suy từ năm khóa hay từ tên chương trình. Muốn áp dụng PDF K44, cần nhập CTĐT K44 tương ứng và rule pack có dẫn nguồn chính thức, sau khi đối soát mã CTĐT thực tế.

## Cách tính

- Mỗi học phần CTĐT được tính tối đa một lần. Bảng điểm đối chiếu theo mã chuẩn hóa, alias đã xác minh, rồi tên chuẩn hóa nếu chỉ có một học phần khớp. Hai mã khác nhau nhưng cùng tên không tự coi là tương đương.
- Một lần đạt hợp lệ là đủ. Record chưa có điểm không được tính là đã đạt và không tự suy ra sinh viên đang chờ điểm. Học phần ngoài CTĐT không cộng vào yêu cầu tốt nghiệp.
- Học phần bắt buộc phải đạt từng môn. Tín chỉ tự chọn tính theo mức tối thiểu toàn chương trình và từng nhóm cấu hình trong kế hoạch. Phần học vượt nhóm không bù nhóm khác. Nếu thiếu ngưỡng của CTĐT hoặc nhóm, trường phụ thuộc trả `null` và kết luận cần đối soát.
- CTĐT và kế hoạch được lưu trong `sourceSnapshot` của đợt đánh giá mới (`curriculum-gap-v2`), bảng điểm lưu theo từng sinh viên. Chi tiết đợt mới dựng từ snapshot, kể cả khi bảng điểm snapshot rỗng. Các đợt cũ giữ kết luận đã lưu, nhưng phần đối chiếu chi tiết có thể dùng CTĐT/kế hoạch hiện tại và được đánh dấu rõ.
- Kết luận ưu tiên điều kiện FAIL đã xác định → `NOT_ELIGIBLE`; nếu đồng thời thiếu dữ liệu vẫn đặt `needsManualReview=true`. Nếu không có FAIL nhưng thiếu dữ liệu/rule → `MANUAL_REVIEW`. Chỉ dùng trạng thái pending khi nguồn dữ liệu xác nhận pending.

## Dữ liệu cần bổ sung

Tại lần đối soát 21/09/2026, cơ sở dữ liệu có 11 CTĐT mã `CQ22CT`, `CQ22CT-MMT`, `CQ22CT-PM`, các biến thể `CQ23CT`, `CQ24CT`, `CQ25CT`. Chưa có CTĐT K44/CQ20. 11 rule tốt nghiệp đang active đều toàn cục; không có rule tín chỉ/GPA gắn riêng CTĐT. Vì vậy **chưa CTĐT nào trong 11 mã có thể kết luận hoàn toàn theo PDF K44**. Các chương trình có thể ghi nhận học phần bắt buộc đã/chưa đạt, nhưng tổng tín chỉ còn thiếu và kết luận đủ điều kiện phải để chưa xác định hoặc cần đối soát cho đến khi nhập rule pack chính thức của từng CTĐT.

Cũng cần đối soát ngưỡng nhóm tự chọn, độ đầy đủ của danh mục học phần, nguồn chuẩn ngoại ngữ/GDTC/GDQP-AN, GPA và dữ liệu rèn luyện. Kế hoạch học kỳ chỉ dùng làm gợi ý lộ trình; hiện không có nguồn đủ tin cậy để xác nhận đăng ký kỳ tiếp theo hoặc thời điểm tốt nghiệp.
