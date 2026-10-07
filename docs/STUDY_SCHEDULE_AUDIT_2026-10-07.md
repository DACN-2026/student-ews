# Rà soát mốc học riêng cho sinh viên học gián đoạn

Đã rà soát 625 hồ sơ sinh viên chưa xóa trong hệ thống, tại HK01 2026–2027. Có 8 sinh viên đang học học phần thuộc kỳ thấp hơn mốc khóa hành chính. Ba người có bằng chứng học theo lịch khác; năm người còn lại đang học lại môn cũ hoặc nhiều kỳ cùng lúc.

| Mã sinh viên | Sinh viên | Mốc đang áp dụng | Kết quả đối chiếu |
| --- | --- | --- | --- |
| 2246A001 | Lâm Anh Vỹ | HK7, theo K47 đã được người dùng xác nhận; lớp ITK46A/K46 giữ nguyên | Đúng tiến độ; đạt 98 TC so với mốc tối thiểu 92 TC, không còn môn bắt buộc đến hạn thiếu |
| 2347C029 | Cao Văn Linh | HK5, tương ứng K48 theo chuỗi đăng ký; lớp ITK47C/K47 giữ nguyên | Còn thiếu thực tế 3 TC tự chọn: đạt 60/63 TC; không thiếu môn bắt buộc đến hạn |
| 2347A049 | Hà Thị Trung | HK5, tương ứng K48 theo chuỗi đăng ký; lớp ITK47A/K47 giữ nguyên | Còn 8 môn bắt buộc ở HK1–HK4 chưa đạt; không đưa nhóm môn HK5 đang học vào nợ kỳ đã qua |
| 2246A028 | Hán Quang Dũng | Giữ HK9/K46 | Năm môn đang học đều đã có lượt học trước; giữ đánh giá phần thiếu thực tế |
| 2246B008 | Võ Kim Phúc | Giữ HK9/K46 | Học đồng thời HK3, HK5, HK7; bốn môn học lại, hai môn mới không đủ chứng minh chuyển lịch |
| 2246B024 | Phan Anh Minh | Giữ HK9/K46 | Học lại năm môn thuộc HK3, HK5, HK7 |
| 2347A036 | Đoàn Thị Bình | Giữ HK7/K47 | Sáu môn đang học đều đã có lượt học trước |
| 2549B035 | Ngô Quang Bình | Giữ HK3/K49 | Bốn môn HK1 đang học lại; chưa có bằng chứng một lịch học mới |

## Cách nhận diện chung

Mốc đã cấu hình riêng luôn được ưu tiên. Nếu chưa có cấu hình, đối chiếu danh sách học phần và toàn bộ lịch sử đăng ký trong phạm vi năm học/học kỳ đang xét. Chỉ nhận diện lịch học lệch năm khi sinh viên đăng ký lần đầu đầy đủ nhóm môn bắt buộc của một học kỳ, chênh lệch là số năm nguyên, và có chuỗi học kỳ liền trước tương ứng hoặc gián đoạn hai kỳ chính. Hoạt động SHCD/GDTC/GDQP không xác định lịch học; học lại ở hè vẫn được tính khi kiểm tra một môn đã từng học.

Mốc suy ra được ghi rõ trên giao diện là “Mốc theo chuỗi đăng ký (tương ứng K…)”, không khẳng định sinh viên đã được chuyển lớp hay chuyển khóa chính thức. Không tự sửa lớp hành chính, CTĐT hoặc trường cấu hình riêng trong cơ sở dữ liệu. Khi chưa đăng ký kỳ mới hoặc chỉ học lại sau một lịch đã được nhận diện, bằng chứng từ các kỳ trước vẫn được dùng. Nếu chuỗi đăng ký mới đã bắt kịp khóa hành chính thì mốc suy ra cũ được thay thế.

Cả Hồ sơ sinh viên, Tiến độ đào tạo, danh sách/KPI tiến độ và bộ tính tín hiệu cảnh báo tiến độ dùng cùng hàm nhận diện. Tín chỉ và môn chưa đạt ở kỳ thực sự đến hạn vẫn được đánh giá; không tự đưa mọi sinh viên học chậm về “Đúng tiến độ”. Các đợt cảnh báo đã lưu không bị tính lại trong lần sửa này.

## Kiểm chứng

248 kiểm thử backend: 247 đạt, 1 bỏ qua, không lỗi; gồm 10 kiểm thử nhận diện lịch chung. Production build hai ứng dụng đạt; lint không lỗi, còn 11 cảnh báo unused đã có trước ở hai component frontend. API đang chạy của cả tám trường hợp đã được đối chiếu: hai API chi tiết trả cùng dữ liệu, danh sách/KPI dùng cùng mốc, các bảng học kỳ của hai giao diện giống nhau. Bundle đang phục vụ có phân biệt mốc cấu hình và mốc theo chuỗi đăng ký.

Hash trước/sau xác nhận bảng sinh viên, lượt học, điểm, đợt cảnh báo và kết quả cảnh báo không đổi. Chỉ thay cách tính khi đọc dữ liệu. Bằng chứng cục bộ: `.codex-qa/text-labels/all-students-study-audit.json`, `.codex-qa/text-labels/general-progress-runtime.json`. Chưa kiểm chứng bằng ảnh chụp trình duyệt.
