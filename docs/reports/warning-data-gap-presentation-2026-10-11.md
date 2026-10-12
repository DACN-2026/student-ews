# Phân biệt dữ liệu thiếu và thông tin cần xác minh

Kỳ xét: HK02 (2025–2026), 622 kết quả đánh giá đang lưu. Trước sửa giao diện, 200 sinh viên có ít nhất một quy tắc `NOT_EVALUATED`; 422 sinh viên không có quy tắc này. Không phải đa số của 622 sinh viên.

192 sinh viên có tiêu chí nợ tín chỉ chờ xác minh VT. Kiểm tra lịch sử đến mốc xét: cả 192 sinh viên đều có VT ở học phần học thuật, không có trường hợp chỉ VT GDQP/GDTC gây treo tiêu chí nợ. Mã nguồn đã loại học phần điều kiện khỏi cả nợ tín chỉ học thuật và tỷ lệ tín chỉ không đạt. Có thêm kiểm thử với GDQP F, GDTC VT và GDTC chờ điểm cùng học phần học thuật F để bảo đảm không làm kết quả học thuật thành thiếu dữ liệu.

Giao diện mới tách hai nhóm: cần xác minh VT/phạm vi CTĐT và thiếu dữ liệu/kết quả. Chỉ đưa tỷ lệ tín chỉ sang nhóm xác minh VT khi kết quả đã lưu có giải thích ghi rõ học phần VT; không suy luận từ tỷ lệ null hay VT ở một kỳ khác. Giải thích gốc vẫn được hiển thị, trạng thái quy tắc không thay đổi. Hai ngưỡng dùng chung GPA/tỷ lệ không đạt hiển thị một chỉ số; vấn đề xác định kỳ đầu khóa và dữ liệu xu hướng vẫn được giữ riêng.

| Nhóm sinh viên sau khi phân biệt cách trình bày | Số lượng |
| --- | ---: |
| Không có phần chưa đánh giá | 422 |
| Chỉ có phần cần xác minh | 150 |
| Có dữ liệu hoặc kết quả còn thiếu | 50 |
| Có phần cần xác minh, có thể kèm phần thiếu | 195 |

Hai hàng cuối có thể trùng sinh viên. Việc chuyển mục hiển thị không biến quy tắc thành đã đánh giá, không thay đổi điểm, mức nguy cơ hay đối chiếu học vụ. Không chạy lại đánh giá và không cập nhật cơ sở dữ liệu.

Kiểm tra: 43 kiểm thử frontend đạt, TypeScript và ESLint các file giao diện thay đổi đạt; kiểm thử học phần điều kiện và nợ học thuật chạy riêng. Không thực hiện kiểm tra trực quan trong trình duyệt ở lượt này.

[Số liệu rà soát](warning-data-gap-presentation-2026-10-11.json).
