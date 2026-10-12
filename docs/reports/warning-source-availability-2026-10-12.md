# Dữ liệu còn thiếu để đánh giá cảnh báo học tập

Kỳ xét HK02 (2025–2026). Rà soát 622 kết quả đang lưu; chỉ đọc dữ liệu và mô phỏng, chưa thay đổi bộ tính, điểm, kết quả cảnh báo hoặc cơ sở dữ liệu.

## VT: dữ liệu có và nguyên nhân bộ tính bị chặn

1.239 lượt VT trong toàn bộ lịch sử đã nhập có `IsPass` là chuỗi rỗng, `NotScore="0"`, `IsGather="x"`, các trường điểm tổng kết mang chuỗi `VT`. Nguồn dùng dấu đánh dấu; hàm nhập hiện tại chuẩn hóa chuỗi rỗng thành `isPass=false`. Không được dùng boolean false mặc định để kết luận cho bản ghi thiếu điểm hoặc đang chờ điểm. Điểm trung bình học kỳ, khi API có giá trị hợp lệ, được sử dụng trực tiếp và không bị vô hiệu chỉ vì có VT.

Bộ tính nợ hiện ép mọi VT thành kết quả unknown. Bộ tính tỷ lệ tín chỉ không đạt cũng ép VT thành kết quả chưa hoàn tất. Do vậy có 192 sinh viên bị treo tiêu chí nợ với lý do VT và 120 sinh viên bị treo tỷ lệ trong kỳ xét. Một số sinh viên còn có vấn đề khác, đang bị lý do VT che khuất.

Mô phỏng dùng kết quả đạt/không đạt đã ghi nhận cho VT đã có kết quả (`NotScore=false`, trạng thái special, nguồn IsPass hiện hữu), không sửa điểm số hoặc đổi chữ VT trong dữ liệu lưu: tỷ lệ tín chỉ được tính thêm cho 120 sinh viên, đạt 587/622; còn 35 sinh viên không có tín chỉ học thuật đăng ký trong kỳ. Tín chỉ nợ được tính đầy đủ cho 618/622; còn bốn trường hợp cần dữ liệu hoặc xác nhận.

Đây là mô phỏng theo cách hiểu kết quả nguồn do người dùng nêu, chưa phải kết quả cảnh báo được chạy và lưu mới. Chưa suy ra GPA bằng 0 cho kỳ toàn VT.

## Bốn trường hợp nợ còn chưa đầy đủ sau mô phỏng

| MSSV | Sinh viên | Nguyên nhân |
| --- | --- | --- |
| 2246A006 | Lưu Thị Nghĩa | CURRICULUM_SCOPE_REQUIRES_VERIFICATION |
| 2246A041 | Vũ Ngọc Phi | UNRESOLVED_HISTORICAL_ATTEMPTS |
| 2246B045 | Đỗ Văn Hiển | UNRESOLVED_HISTORICAL_ATTEMPTS |
| 2347A048 | Hoàng Xuân Nghĩa | UNSCOPED_HISTORICAL_ATTEMPTS |

- Lưu Thị Nghĩa: môn Cấu trúc dữ liệu và thuật giải nâng cao thuộc danh mục chung, chưa xác nhận nghĩa vụ của chuyên ngành hiện tại.
- Vũ Ngọc Phi: Toán cao cấp B1 có lượt lịch sử chưa rõ kết quả; có lượt F khác nhưng cần xác nhận lượt chưa rõ đã giải quyết nợ hay chưa.
- Đỗ Văn Hiển: lịch sử chuyển ngành, học phần ngành cũ chưa khớp CTĐT hiện tại. Giữ nguyên theo yêu cầu tính sau.
- Hoàng Xuân Nghĩa: điểm trước chuyển trường chưa xác định được năm/kỳ và học kỳ đầu. Giữ nguyên theo yêu cầu tính sau.

## GPA học kỳ: thiếu gì trong nguồn

| Trường hợp | Sinh viên |
| --- | ---: |
| Chưa xác định được học kỳ chính đầu tiên để chọn ngưỡng | 1 |
| Thiếu bảng tổng hợp của kỳ xét đúng CTĐT | 33 |
| Có bảng tổng hợp nhưng toàn bộ môn học thuật ghi VT, GPA trống | 11 |
| Có bảng tổng hợp nhưng không có môn học thuật để tính GPA | 2 |

Có 46 sinh viên thiếu giá trị GPA học kỳ và một sinh viên có GPA nhưng chưa xác định được ngưỡng kỳ đầu/kỳ sau. 11 sinh viên toàn VT có bảng tổng hợp, nhưng GPA nguồn trống; IsPass không cung cấp điểm số để thay thế GPA chính thức.

| MSSV | Sinh viên | Nhóm |
| --- | --- | --- |
| 2246A050 | Vương Quang Thông | ALL_VT |
| 2246B008 | Võ Kim Phúc | ALL_VT |
| 2347A054 | Phạm Hương Tân | ALL_VT |
| 2347A057 | Phạm Thị Quang | ALL_VT |
| 2347C044 | Cheng Ngọc Việt | ALL_VT |
| 2448A021 | Nguyễn Tuấn Bình | ALL_VT |
| 2448A027 | Lưu Văn Cường | ALL_VT |
| 2448A028 | Cao Mai Thiện | ALL_VT |
| 2448A036 | Hán Tuấn Mạnh | ALL_VT |
| 2448B030 | Phạm Văn Kiên | ALL_VT |
| 2549B030 | Võ Thị Đức | ALL_VT |
| 2347A048 | Hoàng Xuân Nghĩa | FIRST_TERM_UNRESOLVED |
| 2246B029 | Trịnh Minh Thiện | NO_ACADEMIC_COURSES |
| 2347A049 | Hà Thị Trung | NO_ACADEMIC_COURSES |
| 2347A019 | Trương Xuân Thắng | SUMMARY_MISSING |
| 2347A036 | Đoàn Thị Bình | SUMMARY_MISSING |
| 2347A065 | Trương Quang Tuấn | SUMMARY_MISSING |
| 2347B047 | Thái Anh Hạnh | SUMMARY_MISSING |
| 2347C040 | Đỗ Thúy Tài | SUMMARY_MISSING |
| 2347C046 | Lâm Tuấn Trang | SUMMARY_MISSING |
| 2448A001 | Lý Ngọc Tùng | SUMMARY_MISSING |
| 2448A009 | Trương Thị Hải | SUMMARY_MISSING |
| 2448A010 | Đinh Xuân Tuấn | SUMMARY_MISSING |
| 2448A024 | Vũ Thúy Sơn | SUMMARY_MISSING |
| 2448A030 | Cao Xuân Chi | SUMMARY_MISSING |
| 2448A051 | Hoàng Hoàng Việt | SUMMARY_MISSING |
| 2448A056 | Hán Tuấn An | SUMMARY_MISSING |
| 2448B004 | Lâm Thúy An | SUMMARY_MISSING |
| 2448B022 | Trịnh Tuấn Khanh | SUMMARY_MISSING |
| 2448B026 | Đoàn Mai Vỹ | SUMMARY_MISSING |
| 2448B033 | Đoàn Đức Lâm | SUMMARY_MISSING |
| 2448B048 | Cao Hoàng Phong | SUMMARY_MISSING |
| 2549A010 | Trương Hương Lâm | SUMMARY_MISSING |
| 2549A014 | Cheng Văn Hải | SUMMARY_MISSING |
| 2549A038 | Cheng Đức Nghĩa | SUMMARY_MISSING |
| 2549A053 | Đỗ Thị Bảo | SUMMARY_MISSING |
| 2549A065 | Trọng Thị Minh | SUMMARY_MISSING |
| 2549B008 | Đoàn Văn Nam | SUMMARY_MISSING |
| 2549B020 | Phạm Tuấn Sơn | SUMMARY_MISSING |
| 2549B025 | Phùng Thị Vỹ | SUMMARY_MISSING |
| 2549B035 | Ngô Quang Bình | SUMMARY_MISSING |
| 2549B062 | Bùi Thị Thanh | SUMMARY_MISSING |
| 2549C036 | Hoàng Văn Nghĩa | SUMMARY_MISSING |
| 2549C047 | Bùi Xuân Thắng | SUMMARY_MISSING |
| 2549C057 | Lưu Thị Phúc | SUMMARY_MISSING |
| 2549C063 | Phan Hương Tài | SUMMARY_MISSING |
| 2549C068 | Võ Hữu Huy | SUMMARY_MISSING |

## Các tiêu chí khác

- GPA tích lũy theo trình độ năm: 33 sinh viên thiếu tín chỉ tích lũy hợp lệ tại kỳ xét để chọn ngưỡng. Không thay thế bằng năm khóa học.
- GPA học kỳ suy giảm: 48 sinh viên thiếu ít nhất một GPA trong hai kỳ chính liên tiếp, không phải 48 người đều thiếu kỳ trước.
- GPA tích lũy suy giảm: 34 sinh viên thiếu ít nhất một giá trị trong cặp so sánh.
- Tiến độ: Lê Văn Quân (2448A014), Trịnh Tuấn Khanh (2448B022), Phạm Văn Kiên (2448B030) còn lượt học/chờ điểm; giữ các kết quả đã đạt hoặc F đã xác định. Không coi lần học chờ điểm là F mới.
- Rèn luyện: chưa có ánh xạ trạng thái được xác nhận là điểm đã công nhận; hai tiêu chí đang tắt, không phải tiêu chí thiếu của từng sinh viên.

## Hướng xử lý để mỗi sinh viên đều có trạng thái rõ ràng

1. Dùng GPA chính thức từ API khi hợp lệ. Dùng kết quả đạt/không đạt đã chốt để tính tín chỉ, đồng thời giữ VT riêng cho CVHT xác minh lý do; không đổi VT thành điểm số F hoặc GPA 0.
2. Phân biệt đã đánh giá, không áp dụng và chờ bổ sung/xác nhận. Không đăng ký môn học thuật thì không có GPA/tỷ lệ để so ngưỡng; vẫn đánh giá riêng tín hiệu không đăng ký. Quyết định nghỉ học hợp lệ vẫn đóng băng hồ sơ.
3. Kỳ toàn VT thiếu GPA: yêu cầu nguồn trả GPA chính thức hoặc có quy tắc tính được xác nhận. Chưa được giả định điểm số chỉ từ IsPass.
4. Bổ sung/đối chiếu bốn hồ sơ nợ còn vướng, dữ liệu xu hướng, trạng thái công nhận rèn luyện. Có thể hiển thị phần nợ/tiến độ đã xác định dưới dạng tạm tính, nhưng không gắn nhãn đầy đủ hoặc thay thế kết luận học vụ.

Các nhóm có thể trùng sinh viên; không cộng số người giữa các tiêu chí. Số liệu đầy đủ và danh sách theo từng tiêu chí nằm trong [JSON](warning-source-availability-2026-10-12.json).
