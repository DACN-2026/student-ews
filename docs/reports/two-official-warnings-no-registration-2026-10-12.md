# Hai kỳ cảnh báo học vụ liên tiếp rồi không ghi nhận đăng ký học phần

Rà soát **625 hồ sơ**, **912 quyết định** trong hệ thống. Chỉ tính quyết định cảnh báo học vụ có số, ngày ký hợp lệ, chưa xóa/hủy; lấy kỳ áp dụng từ nội dung quyết định, không dùng màu cảnh báo nội bộ và không dùng kỳ ghi nhận nguồn thay cho kỳ hiệu lực. Hai kỳ liên tiếp là hai kỳ chính, bỏ qua kỳ hè. Kiểm tra kỳ chính ngay sau cặp cảnh báo, đến kỳ đang cấu hình HK01 (2026-2027).

Kết quả: **14 sinh viên**, gồm Trịnh Minh Thiện và 13 người khác; tất cả có cảnh báo **HK02 (2024–2025)** và **HK01 (2025–2026)**, sau đó không ghi nhận học phần có tín chỉ ở **HK02 (2025–2026)**. Không tìm thấy chuỗi khác thỏa điều kiện trong dữ liệu đã rà soát.

Hai quyết định của toàn bộ nhóm:

- `1209/QÐ-ÐHÐL_12092025`, ký 12/09/2025, nội dung Cảnh báo học vụ(HK 2, 2024-2025).
- `340/QÐ-ÐHÐL_03042026`, ký 03/04/2026, nội dung Cảnh báo học vụ(HK1, 2025-2026).

**12 người không có bất kỳ dòng học phần nào** trong kỳ sau. **2 người chỉ có SHCD 0 tín chỉ**, không phải đăng ký môn học có tín chỉ. Không gộp SHCD 0 TC thành bằng chứng có đăng ký học phần.

| MSSV | Sinh viên | Lớp | CTĐT | Dữ liệu HK02 (2025–2026) |
| --- | --- | --- | --- | --- |
| 2246B029 | Trịnh Minh Thiện | ITK46B | CQ22CT-PM | 3 dòng SHCD, 0 tín chỉ |
| 2347A049 | Hà Thị Trung | ITK47A | CQ23CT | 3 dòng SHCD, 0 tín chỉ |
| 2347C046 | Lâm Tuấn Trang | ITK47C | CQ23CT | Không có dòng học phần |
| 2448A001 | Lý Ngọc Tùng | ITK48A | CQ24CT | Không có dòng học phần |
| 2448A009 | Trương Thị Hải | ITK48A | CQ24CT | Không có dòng học phần |
| 2448A010 | Đinh Xuân Tuấn | ITK48A | CQ24CT | Không có dòng học phần |
| 2448A024 | Vũ Thúy Sơn | ITK48A | CQ24CT | Không có dòng học phần |
| 2448A030 | Cao Xuân Chi | ITK48A | CQ24CT | Không có dòng học phần |
| 2448A051 | Hoàng Hoàng Việt | ITK48A | CQ24CT | Không có dòng học phần |
| 2448B004 | Lâm Thúy An | ITK48B | CQ24CT | Không có dòng học phần |
| 2448B022 | Trịnh Tuấn Khanh | ITK48B | CQ24CT | Không có dòng học phần |
| 2448B026 | Đoàn Mai Vỹ | ITK48B | CQ24CT | Không có dòng học phần |
| 2448B033 | Đoàn Đức Lâm | ITK48B | CQ24CT | Không có dòng học phần |
| 2448B048 | Cao Hoàng Phong | ITK48B | CQ24CT | Không có dòng học phần |

## Đối chiếu API

Đã gọi LayDanhSachQuyetDinh và LayBangDiemSinhVien (MSSV, CTĐT hiện tại, ALL/ALL) cho 14/14 sinh viên thành công. 14/14 người có cả hai số quyết định trong API và không có học phần có tín chỉ ở kỳ sau; số dòng học phần khớp dữ liệu đang lưu. Thời điểm API: 2026-10-12T03:27:06.458Z.

Trong quyết định đã lưu và API của nhóm này chưa tìm thấy quyết định nghỉ tạm thời/bảo lưu/thôi học/chuyển trường giải thích cho việc không học ở kỳ sau. Đây là tình trạng ghi nhận của nguồn, không chứng minh ngoài hệ thống không có hồ sơ hoặc quyết định khác.

## Bản ghi SHCD của hai trường hợp

### 2246B029 — Trịnh Minh Thiện

- SHCD-CD1: Chuyên đề 1, 0 TC.
- SHCD-CD2: Chuyên đề 2, 0 TC.
- SHCD-CD3: Chuyên đề 3, 0 TC.

### 2347A049 — Hà Thị Trung

- SHCD-CD1: Chuyên đề 1, 0 TC.
- SHCD-CD2: Chuyên đề 2, 0 TC.
- SHCD-CD3: Chuyên đề 3, 0 TC.

## Giới hạn

Không có dòng học phần trong bảng điểm/đăng ký đã nhập là chưa ghi nhận đăng ký trong nguồn đang sử dụng; không tự kết luận sinh viên bỏ học hoặc ban hành xử lý học vụ. Kiểm tra hồ sơ giải trình, quyết định và nguồn đăng ký chính thức nếu cần xử lý từng người. Việc không đăng ký ở HK02 (2025–2026) không mô tả tình trạng đăng ký ở các kỳ về sau.

Phần rà soát toàn bộ 625 sinh viên dùng dữ liệu hệ thống đã nhập. Đối chiếu API trực tiếp tập trung vào 14 trường hợp tìm được; không khẳng định đã quét mới toàn bộ API của cả 625 sinh viên trong lượt này. Không sửa điểm, quyết định hoặc hồ sơ cảnh báo.

[Quyết định, kỳ áp dụng, dữ liệu học phần và kết quả API từng sinh viên](two-official-warnings-no-registration-2026-10-12.json).
