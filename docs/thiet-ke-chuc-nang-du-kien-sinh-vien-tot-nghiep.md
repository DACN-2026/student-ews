# BẢN THIẾT KẾ CHI TIẾT CHỨC NĂNG **DỰ KIẾN SINH VIÊN TỐT NGHIỆP**

## 1. Mục đích tài liệu

Tài liệu này mô tả thiết kế nghiệp vụ và kỹ thuật cho chức năng **Dự kiến sinh viên tốt nghiệp** trong hệ thống quản trị CNTT của Trường Đại học Đà Lạt.

Chức năng có nhiệm vụ:

- Đối chiếu kết quả học tập của sinh viên với chương trình đào tạo áp dụng.
- Kiểm tra các điều kiện bắt buộc liên quan đến xét tốt nghiệp.
- Phân loại sinh viên theo trạng thái dự kiến.
- Giải thích rõ vì sao một sinh viên được đánh giá là đủ, chưa đủ, đang chờ kết quả hoặc cần đối soát.
- Lưu lịch sử từng lần đánh giá để phục vụ kiểm tra, truy vết và báo cáo.
- Hỗ trợ cán bộ quản trị chuẩn bị dữ liệu cho công tác xét tốt nghiệp.

> **Lưu ý quan trọng:** Hệ thống chỉ đưa ra **kết quả dự kiến** dựa trên dữ liệu và các quy tắc đã cấu hình. Kết quả này **không thay thế quyết định xét và công nhận tốt nghiệp** của Hội đồng xét tốt nghiệp và Hiệu trưởng.

---

# 2. Nguồn “luật cứng”

Thiết kế này chỉ coi ba tài liệu sau là nguồn quy tắc chính thức:

1. **Quy chế đào tạo đại học và cao đẳng hệ chính quy theo hệ thống tín chỉ**
   - Đặc biệt sử dụng các nội dung tại Chương IV về xét và công nhận tốt nghiệp.
   - Các điều kiện cốt lõi nằm tại Điều 27.
   - Việc xếp hạng tốt nghiệp nằm tại Điều 28.

2. **Quy định đánh giá kết quả rèn luyện của sinh viên Trường Đại học Đà Lạt**
   - Sử dụng quy định về cách tính điểm rèn luyện theo học kỳ, năm học, toàn khóa.
   - Kết quả rèn luyện toàn khóa là căn cứ phục vụ một số nghiệp vụ liên quan tốt nghiệp và được ghi vào bảng điểm.

3. **Chương trình giáo dục đại học theo học chế tín chỉ ngành Công nghệ Thông tin – K44, năm 2020**
   - Thời gian đào tạo: 4 năm.
   - Khối lượng kiến thức toàn khóa: 150 tín chỉ.
   - Cơ cấu:
     - 104 tín chỉ bắt buộc.
     - 46 tín chỉ tự chọn.
   - Giáo dục thể chất và Giáo dục quốc phòng – an ninh không tính vào 150 tín chỉ.
   - Sinh viên phải hoàn thành:
     - Thực tập nghề nghiệp: 8 tín chỉ.
     - Đồ án tốt nghiệp: 10 tín chỉ.
   - Phải có:
     - Chứng chỉ Giáo dục thể chất.
     - Chứng chỉ Giáo dục quốc phòng và an ninh.
     - Đạt chuẩn đầu ra ngoại ngữ.

---

# 3. Nguyên tắc thiết kế nghiệp vụ

## 3.1. Không đánh giá chỉ bằng tổng tín chỉ

Sinh viên có thể có tổng số tín chỉ lớn hơn hoặc bằng 150 nhưng vẫn **chưa hoàn thành chương trình đào tạo** nếu:

- Thiếu học phần bắt buộc.
- Thiếu số tín chỉ tối thiểu của một nhóm tự chọn.
- Học sai học phần so với chương trình đào tạo.
- Chưa hoàn thành Thực tập nghề nghiệp.
- Chưa hoàn thành Đồ án tốt nghiệp.
- Chưa đáp ứng yêu cầu của một khối kiến thức.

Do đó, điều kiện không được viết đơn giản theo dạng:

```text
if tong_tin_chi >= 150:
    du_dieu_kien = true
```

Mà phải đánh giá theo cấu trúc chương trình đào tạo.

---

## 3.2. Không tự tạo thêm “luật cứng”

Nếu ba tài liệu không quy định một ngưỡng cụ thể thì hệ thống **không được tự suy diễn**.

Ví dụ:

- Tài liệu rèn luyện không đưa ra trong ba tài liệu này một ngưỡng kiểu:
  - “Điểm rèn luyện toàn khóa phải >= 50 mới được tốt nghiệp”.

Vì vậy hệ thống không được tự tạo điều kiện:

```text
training_score >= 50
```

Nếu sau này Nhà trường có văn bản khác quy định rõ ngưỡng này thì mới bổ sung vào rule engine.

---

## 3.3. Phân biệt “Hoàn thành CTĐT” và “Đủ điều kiện xét tốt nghiệp”

Hệ thống cần tách thành hai tầng:

### Tầng 1 – Hoàn thành chương trình đào tạo

Kiểm tra:

- Học phần bắt buộc.
- Học phần tự chọn.
- Các nhóm kiến thức.
- Tổng tín chỉ.
- Thực tập nghề nghiệp.
- Đồ án tốt nghiệp.

### Tầng 2 – Dự kiến đủ điều kiện xét tốt nghiệp

Ngoài tầng 1, kiểm tra thêm:

- GPA tích lũy.
- Giáo dục thể chất.
- Giáo dục quốc phòng – an ninh.
- Chuẩn đầu ra ngoại ngữ.
- Tình trạng kỷ luật.
- Tình trạng pháp lý.
- Kết quả rèn luyện toàn khóa đã có dữ liệu hay chưa.
- Các yêu cầu khác được quy định chính thức.

---

# 4. Mô tả giao diện hiện tại

Từ giao diện đã cung cấp, chức năng nằm tại menu:

```text
Dự kiến tốt nghiệp
```

Trang chính hiện có:

- Tiêu đề: **Đánh giá Hoàn thành Chương trình Đào tạo**
- Mô tả:
  > Đối chiếu học phần và tín chỉ với kế hoạch; kết quả này chưa thay thế xét điều kiện tốt nghiệp.
- Nút:
  > Chạy đánh giá CTĐT
- Bảng lịch sử:
  - Mốc đánh giá hoàn thành.
  - Khóa / CTĐT.
  - Tổng SV.
  - Đủ yêu cầu học phần.
  - Chờ kết quả điểm.
  - Chưa đủ điều kiện.
  - Chi tiết.

Thiết kế đề xuất sẽ giữ nguyên hướng giao diện này nhưng mở rộng logic bên trong.

---

# 5. Kiến trúc chức năng tổng thể

```text
Quản trị viên
    |
    v
Chọn mốc đánh giá
    |
    v
Chọn khóa / CTĐT / chuyên ngành
    |
    v
Chốt dữ liệu đánh giá
    |
    v
Kiểm tra dữ liệu đầu vào
    |
    v
Đánh giá hoàn thành CTĐT
    |
    v
Đánh giá điều kiện xét tốt nghiệp
    |
    v
Phân loại trạng thái sinh viên
    |
    v
Lưu phiên đánh giá
    |
    v
Hiển thị tổng hợp
    |
    v
Xem chi tiết từng sinh viên
```

---

# 6. Khái niệm “Phiên đánh giá”

Mỗi lần người dùng bấm **Chạy đánh giá CTĐT** phải tạo một bản ghi phiên đánh giá độc lập.

Ví dụ:

```text
Mã phiên: EVAL-2026-09-20-001
Mốc đánh giá: Cuối HK1 2026-2027
Khóa: K44
CTĐT: CNTT 2020
Chuyên ngành: Kỹ thuật phần mềm
Thời điểm chốt dữ liệu: 20/09/2026 13:00
Người chạy: admin
Rule version: CNTT-2020-v1
```

Mục đích:

- Truy vết lại kết quả cũ.
- Không bị thay đổi kết quả lịch sử khi điểm hiện tại thay đổi.
- Có thể so sánh hai lần đánh giá.
- Phục vụ kiểm tra và đối soát.
- Biết kết quả được sinh ra bằng bộ quy tắc nào.

---

# 7. Dữ liệu đầu vào cần thiết

## 7.1. Dữ liệu sinh viên

Tối thiểu:

```text
student_id
student_code
full_name
cohort
major
specialization
curriculum_id
status
discipline_status
legal_status
```

---

## 7.2. Dữ liệu chương trình đào tạo

```text
curriculum_id
curriculum_name
major
effective_cohort
required_total_credits
required_compulsory_credits
required_elective_credits
```

Ví dụ CNTT 2020:

```text
required_total_credits = 150
required_compulsory_credits = 104
required_elective_credits = 46
```

---

## 7.3. Dữ liệu học phần

```text
course_id
course_code
course_name
credits
course_type
knowledge_block
is_required
```

---

## 7.4. Dữ liệu kết quả học tập

```text
student_id
course_id
semester
score_10
letter_grade
score_4
attempt
status
```

`status` có thể gồm:

```text
PASSED
FAILED
IN_PROGRESS
WAITING_GRADE
CANCELLED
```

---

## 7.5. Dữ liệu chuẩn đầu ra

Tối thiểu:

```text
student_id
physical_education_status
national_defense_status
foreign_language_outcome_status
```

Giá trị:

```text
PASSED
NOT_PASSED
NOT_AVAILABLE
PENDING
```

---

## 7.6. Dữ liệu rèn luyện

```text
student_id
semester
training_score
training_classification
```

Ngoài ra cần giá trị tổng hợp:

```text
whole_course_training_score
```

Điểm rèn luyện toàn khóa được tính từ kết quả các học kỳ theo quy định.

---

# 8. Bộ trạng thái đánh giá

Không nên dùng duy nhất hai trạng thái `PASS / FAIL`.

Đề xuất:

| Mã | Nhãn | Ý nghĩa |
|---|---|---|
| `EXPECTED_ELIGIBLE` | Dự kiến đủ điều kiện | Tất cả điều kiện đã xác định đều đạt |
| `PENDING_GRADE` | Chờ kết quả điểm | Còn học phần quan trọng đang học hoặc chưa có điểm |
| `PENDING_REQUIREMENT` | Chờ bổ sung điều kiện | Đã đủ học phần nhưng còn thiếu chứng chỉ/chuẩn đầu ra |
| `NOT_ELIGIBLE` | Chưa đủ điều kiện | Có điều kiện xác định là không đạt |
| `MANUAL_REVIEW` | Cần đối soát | Dữ liệu mâu thuẫn, thiếu hoặc thuộc ngoại lệ |

---

# 9. Quy tắc đánh giá chi tiết

# 9.1. Bước 1 – Xác định đúng CTĐT áp dụng

Không được xác định chương trình chỉ bằng khóa.

Phải dựa trên:

```text
student.curriculum_id
```

Ví dụ:

```text
student = SV001
cohort = K44
curriculum_id = CNTT_2020
specialization = SOFTWARE_ENGINEERING
```

Nếu `curriculum_id` không tồn tại:

```text
status = MANUAL_REVIEW
reason = "Không xác định được chương trình đào tạo áp dụng"
```

---

# 9.2. Bước 2 – Kiểm tra học phần bắt buộc

Pseudo logic:

```text
required_courses = danh sách học phần bắt buộc của CTĐT

for course in required_courses:
    if sinh_vien_chua_dat(course):
        đánh_dấu_thiếu(course)
```

Kết quả cần lưu:

```text
required_courses_total
required_courses_passed
required_courses_missing
```

---

# 9.3. Bước 3 – Kiểm tra học phần tự chọn

Không chỉ cộng toàn bộ tín chỉ tự chọn.

Cần xét theo từng nhóm.

Ví dụ:

```text
Nhóm A6: cần tối thiểu 9 TC tự chọn
Nhóm A7: cần tối thiểu 6 TC tự chọn
Nhóm B2: cần tối thiểu 25 TC tự chọn
Nhóm B3: cần tối thiểu 6 TC tự chọn
```

Hệ thống phải kiểm tra riêng từng nhóm.

Pseudo logic:

```text
for group in elective_groups:
    earned = sum(valid_credits_of_group)
    if earned < group.minimum_credits:
        mark_missing(group)
```

---

# 9.4. Bước 4 – Kiểm tra tổng tín chỉ

Đối với CTĐT CNTT K44:

```text
total_valid_credits >= 150
```

Trong đó:

```text
Giáo dục thể chất
Giáo dục quốc phòng và an ninh
```

không được cộng vào 150 tín chỉ theo cấu trúc CTĐT.

---

# 9.5. Bước 5 – Kiểm tra cơ cấu 104/46

Kiểm tra:

```text
compulsory_credits >= 104
elective_credits >= 46
```

Tuy nhiên đây vẫn chưa đủ.

Phải đồng thời kiểm tra:

```text
mọi học phần bắt buộc
mọi nhóm tự chọn
```

---

# 9.6. Bước 6 – Kiểm tra Thực tập nghề nghiệp

Học phần:

```text
20CT4201 – Thực tập nghề nghiệp
8 tín chỉ
```

Điều kiện:

```text
grade != F
```

hoặc tương đương trạng thái:

```text
PASSED
```

Nếu đang thực tập:

```text
status = PENDING_GRADE
```

---

# 9.7. Bước 7 – Kiểm tra Đồ án tốt nghiệp

Học phần:

```text
20CT4202 – Đồ án tốt nghiệp
10 tín chỉ
```

Điều kiện:

```text
PASSED
```

Nếu:

```text
WAITING_GRADE
```

thì:

```text
status = PENDING_GRADE
```

Nếu:

```text
FAILED
```

thì:

```text
status = NOT_ELIGIBLE
```

---

# 9.8. Bước 8 – GPA tích lũy

Theo Quy chế đào tạo:

```text
cumulative_gpa >= 2.00
```

Nếu:

```text
cumulative_gpa < 2.00
```

thì:

```text
NOT_ELIGIBLE
```

---

# 9.9. Bước 9 – Giáo dục thể chất

Trạng thái:

```text
PASSED
NOT_PASSED
NOT_AVAILABLE
PENDING
```

Xử lý:

```text
PASSED       -> đạt
NOT_PASSED   -> chưa đủ điều kiện
PENDING      -> chờ bổ sung điều kiện
NOT_AVAILABLE -> cần đối soát
```

---

# 9.10. Bước 10 – Giáo dục quốc phòng và an ninh

Xử lý tương tự GDTC.

---

# 9.11. Bước 11 – Chuẩn đầu ra ngoại ngữ

CTĐT quy định sinh viên phải đạt chuẩn đầu ra ngoại ngữ.

Xử lý:

```text
PASSED       -> đạt
NOT_PASSED   -> chưa đủ điều kiện
PENDING      -> chờ bổ sung
NOT_AVAILABLE -> cần đối soát
```

---

# 9.12. Bước 12 – Tình trạng kỷ luật

Theo quy chế, tại thời điểm xét tốt nghiệp sinh viên không được đang trong thời gian bị kỷ luật ở mức đình chỉ học tập.

Kiểm tra:

```text
discipline_status
```

Nếu:

```text
SUSPENDED
```

thì:

```text
NOT_ELIGIBLE
```

---

# 9.13. Bước 13 – Tình trạng pháp lý

Theo quy chế, tại thời điểm xét tốt nghiệp sinh viên không được thuộc trường hợp đang bị truy cứu trách nhiệm hình sự.

Nếu dữ liệu có:

```text
UNDER_CRIMINAL_PROCEEDING
```

thì:

```text
NOT_ELIGIBLE
```

Nếu hệ thống không có nguồn dữ liệu đáng tin cậy:

```text
MANUAL_REVIEW
```

---

# 9.14. Bước 14 – Kết quả rèn luyện toàn khóa

Hệ thống cần:

- Tính/đọc kết quả rèn luyện toàn khóa.
- Hiển thị trong màn chi tiết.
- Cảnh báo nếu thiếu dữ liệu.

Không tự áp dụng ngưỡng đậu/rớt nếu ba tài liệu không quy định.

Ví dụ:

```text
whole_course_training_score = null
```

thì:

```text
MANUAL_REVIEW
reason = "Chưa có kết quả rèn luyện toàn khóa"
```

---

# 10. Thuật toán tổng hợp trạng thái

Ưu tiên trạng thái:

```text
MANUAL_REVIEW
NOT_ELIGIBLE
PENDING_GRADE
PENDING_REQUIREMENT
EXPECTED_ELIGIBLE
```

Đề xuất logic:

```pseudo
if data_error or critical_data_missing:
    return MANUAL_REVIEW

if has_failed_mandatory_condition:
    return NOT_ELIGIBLE

if has_waiting_grade:
    return PENDING_GRADE

if has_pending_requirement:
    return PENDING_REQUIREMENT

return EXPECTED_ELIGIBLE
```

---

# 11. Mô hình Rule Engine

Không nên viết toàn bộ điều kiện trực tiếp trong source code.

Nên có bảng:

```text
graduation_rules
```

Ví dụ:

| rule_code | Loại | Toán tử | Giá trị |
|---|---|---|---:|
| TOTAL_CREDITS | CREDIT | >= | 150 |
| COMPULSORY_CREDITS | CREDIT | >= | 104 |
| ELECTIVE_CREDITS | CREDIT | >= | 46 |
| GPA | GPA | >= | 2.00 |
| PE | CERTIFICATE | = | PASSED |
| DEFENSE | CERTIFICATE | = | PASSED |
| FOREIGN_LANGUAGE | OUTCOME | = | PASSED |

Lợi ích:

- Có thể thay đổi CTĐT.
- Hỗ trợ nhiều khóa.
- Hỗ trợ nhiều ngành.
- Không phải sửa code khi thay đổi chương trình.

---

# 12. Thiết kế màn hình chính

## 12.1. Khu vực tiêu đề

```text
Đánh giá Hoàn thành Chương trình Đào tạo

Đối chiếu học phần, tín chỉ và các điều kiện liên quan
để xác định dự kiến sinh viên đủ điều kiện xét tốt nghiệp.
Kết quả chỉ mang tính hỗ trợ nghiệp vụ.
```

Nút:

```text
[ Chạy đánh giá CTĐT ]
```

---

# 13. Modal “Chạy đánh giá CTĐT”

## 13.1. Trường dữ liệu

### Mốc đánh giá

```text
Cuối HK1 2026-2027
Cuối HK2 2026-2027
Sau học kỳ hè 2026-2027
Đánh giá bổ sung
```

### Khóa

```text
K44
K45
K46
...
```

### CTĐT

```text
CNTT 2020
CNTT 2021
...
```

### Chuyên ngành

```text
Tất cả
Mạng máy tính
Kỹ thuật phần mềm
Khoa học dữ liệu
```

### Đối tượng

```text
Sinh viên đang học
Sinh viên cuối khóa
Sinh viên quá hạn chuẩn
Tất cả sinh viên thuộc CTĐT
```

---

## 13.2. Kiểm tra trước khi chạy

Hệ thống hiển thị:

```text
Số sinh viên dự kiến đánh giá: 328
Số sinh viên thiếu CTĐT: 2
Số sinh viên thiếu dữ liệu điểm: 5
Số sinh viên thiếu dữ liệu rèn luyện: 8
```

Nếu có lỗi nghiêm trọng:

```text
Không cho chạy đánh giá
```

hoặc:

```text
Cho phép chạy nhưng đánh dấu MANUAL_REVIEW
```

---

# 14. Bảng lịch sử đánh giá

Giữ gần giống giao diện hiện tại.

| Mốc đánh giá | Khóa / CTĐT | Tổng SV | Dự kiến đủ ĐK | Chờ điểm | Chờ bổ sung | Chưa đủ | Cần đối soát | Chi tiết |
|---|---|---:|---:|---:|---:|---:|---:|---|
| HK1 2026-2027 | K44 / CNTT 2020 | 300 | 190 | 42 | 18 | 45 | 5 | Xem |

Mỗi số liệu có thể click để lọc.

---

# 15. Trang chi tiết phiên đánh giá

## 15.1. Thanh thống kê

```text
Tổng sinh viên: 300
Dự kiến đủ điều kiện: 190
Chờ kết quả điểm: 42
Chờ bổ sung điều kiện: 18
Chưa đủ điều kiện: 45
Cần đối soát: 5
```

---

## 15.2. Bộ lọc

```text
Tìm MSSV / Họ tên
Khóa
Chuyên ngành
Trạng thái
Thiếu học phần
Thiếu tín chỉ
GPA
Ngoại ngữ
GDTC
GDQP
Rèn luyện
```

---

## 15.3. Bảng danh sách

| MSSV | Họ tên | TC đạt | GPA | CTĐT | GDTC | GDQP | Ngoại ngữ | Rèn luyện | Trạng thái |
|---|---|---:|---:|---|---|---|---|---|---|
| 2012345 | Nguyễn Văn A | 150 | 3.12 | Đạt | Đạt | Đạt | Đạt | 82 | Dự kiến đủ |
| 2012346 | Trần Văn B | 146 | 2.61 | Thiếu | Đạt | Đạt | Đạt | 75 | Chưa đủ |
| 2012347 | Lê Văn C | 150 | 2.84 | Chờ điểm | Đạt | Đạt | Đạt | 78 | Chờ điểm |

---

# 16. Trang chi tiết sinh viên

Đây là màn hình quan trọng nhất.

## 16.1. Thông tin chung

```text
MSSV: 2012345
Họ tên: Nguyễn Văn A
Khóa: K44
Ngành: Công nghệ Thông tin
Chuyên ngành: Kỹ thuật phần mềm
CTĐT: CNTT 2020
```

---

## 16.2. Kết luận

```text
DỰ KIẾN ĐỦ ĐIỀU KIỆN XÉT TỐT NGHIỆP
```

hoặc:

```text
CHƯA ĐỦ ĐIỀU KIỆN
```

---

# 17. Checklist điều kiện

Hiển thị dạng:

```text
✓ Tổng tín chỉ: 150 / 150
✓ Tín chỉ bắt buộc: 104 / 104
✓ Tín chỉ tự chọn: 46 / 46
✓ Học phần bắt buộc: 100%
✓ Thực tập nghề nghiệp: Đạt
✓ Đồ án tốt nghiệp: Đạt
✓ GPA tích lũy: 3.12 / 2.00
✓ Giáo dục thể chất: Đạt
✓ GDQP-AN: Đạt
✓ Chuẩn đầu ra ngoại ngữ: Đạt
✓ Không trong thời gian đình chỉ
? Rèn luyện toàn khóa: 82
```

Nếu chưa đạt:

```text
✗ Tổng tín chỉ: 146 / 150
✗ Thiếu: 20CT4202 – Đồ án tốt nghiệp
✓ GPA tích lũy: 2.61
✓ GDTC
✓ GDQP
✓ Ngoại ngữ
```

---

# 18. Phân tích học phần thiếu

Bảng:

| Mã HP | Tên học phần | Số TC | Loại | Trạng thái |
|---|---|---:|---|---|
| 20CT4202 | Đồ án tốt nghiệp | 10 | Bắt buộc | Chưa đạt |
| 20CT3105 | ... | 3 | Tự chọn nhóm B2 | Chưa học |

---

# 19. Nhóm tự chọn

Hiển thị:

```text
A6 – Toán học, Tin học, KH Tự nhiên
Đã đạt: 9 / 9 TC

A7 – KH Xã hội và Nhân văn
Đã đạt: 3 / 6 TC
Thiếu: 3 TC

B2 – Kiến thức chuyên ngành
Đã đạt: 25 / 25 TC
```

Điều này giúp cán bộ biết sinh viên thiếu **nhóm nào**, thay vì chỉ biết thiếu tín chỉ chung.

---

# 20. Giải thích kết quả

Mỗi sinh viên cần có danh sách `reasons`.

Ví dụ:

```json
[
  {
    "code": "MISSING_CREDITS",
    "message": "Thiếu 4 tín chỉ để đạt 150 tín chỉ"
  },
  {
    "code": "MISSING_REQUIRED_COURSE",
    "message": "Chưa đạt học phần 20CT4202 - Đồ án tốt nghiệp"
  }
]
```

Không nên chỉ trả về:

```text
Không đủ điều kiện
```

---

# 21. Thiết kế cơ sở dữ liệu

## 21.1. graduation_evaluations

```text
id
evaluation_code
evaluation_name
semester_id
cohort
curriculum_id
specialization_id
evaluated_at
evaluated_by
rule_version
status
created_at
```

---

## 21.2. graduation_evaluation_students

```text
id
evaluation_id
student_id

total_credits
compulsory_credits
elective_credits
cumulative_gpa

curriculum_status
physical_education_status
national_defense_status
foreign_language_status
training_status
discipline_status
legal_status

final_status
evaluated_at
```

---

## 21.3. graduation_evaluation_details

```text
id
evaluation_student_id
rule_code
rule_name
required_value
actual_value
result
reason
```

Ví dụ:

```text
TOTAL_CREDITS
150
146
FAIL
```

---

## 21.4. curriculum_course_requirements

```text
id
curriculum_id
course_id
requirement_type
knowledge_block
minimum_credits
```

`requirement_type`:

```text
REQUIRED
ELECTIVE
OPTIONAL
```

---

## 21.5. curriculum_requirement_groups

```text
id
curriculum_id
group_code
group_name
minimum_credits
```

Ví dụ:

```text
B2_ELECTIVE
Kiến thức chuyên ngành tự chọn
25
```

---

# 22. API đề xuất

## 22.1. Tạo phiên đánh giá

```http
POST /api/graduation-evaluations
```

Body:

```json
{
  "semesterId": 12,
  "cohort": "K44",
  "curriculumId": 1,
  "specializationId": null
}
```

---

## 22.2. Danh sách lịch sử

```http
GET /api/graduation-evaluations
```

---

## 22.3. Chi tiết phiên

```http
GET /api/graduation-evaluations/:id
```

---

## 22.4. Danh sách sinh viên

```http
GET /api/graduation-evaluations/:id/students
```

Query:

```text
status=
keyword=
specialization=
page=
size=
```

---

## 22.5. Chi tiết sinh viên

```http
GET /api/graduation-evaluations/:evaluationId/students/:studentId
```

---

# 23. Ví dụ response sinh viên

```json
{
  "student": {
    "studentCode": "2012345",
    "fullName": "Nguyễn Văn A",
    "curriculum": "CNTT 2020"
  },
  "summary": {
    "totalCredits": 150,
    "requiredCredits": 150,
    "gpa": 3.12,
    "finalStatus": "EXPECTED_ELIGIBLE"
  },
  "requirements": [
    {
      "code": "TOTAL_CREDITS",
      "required": 150,
      "actual": 150,
      "status": "PASS"
    },
    {
      "code": "GPA",
      "required": 2.0,
      "actual": 3.12,
      "status": "PASS"
    }
  ],
  "reasons": []
}
```

---

# 24. Xử lý học phần tương đương / thay thế

Đây là phần bắt buộc phải có trong hệ thống thực tế.

Ví dụ:

```text
Học phần cũ A
được thay bằng
Học phần mới B
```

Cần bảng:

```text
course_equivalencies
```

```text
source_course_id
equivalent_course_id
curriculum_id
effective_from
effective_to
```

Khi đánh giá:

```text
Nếu SV đã đạt B
và B được công nhận tương đương A
=> A được xem là hoàn thành
```

Nếu không có cơ chế này, các sinh viên chuyển khóa hoặc học chương trình cập nhật sẽ bị đánh giá sai.

---

# 25. Xử lý học cải thiện / học lại

Một học phần có thể xuất hiện nhiều lần.

Đối với việc xác định đã tích lũy hay chưa:

```text
chỉ cần có một kết quả đạt
```

Đối với GPA:

- Sử dụng đúng quy tắc tính điểm của Quy chế đào tạo.
- Không tự cộng cả hai lần học như hai học phần riêng biệt nếu cùng một học phần.

---

# 26. Xử lý học phần đang chờ điểm

Nếu học phần đang chờ điểm thuộc:

- học phần bắt buộc;
- nhóm tự chọn còn thiếu;
- Thực tập nghề nghiệp;
- Đồ án tốt nghiệp;

thì:

```text
PENDING_GRADE
```

Ví dụ:

```text
Đã có 147 tín chỉ
Đồ án tốt nghiệp 10 TC đang chờ điểm
```

Không kết luận:

```text
NOT_ELIGIBLE
```

vì kết quả chưa hoàn tất.

---

# 27. Xử lý dữ liệu thiếu

Ví dụ:

```text
foreign_language_status = null
```

Không được hiểu là:

```text
NOT_PASSED
```

Phải hiểu là:

```text
NOT_AVAILABLE
```

và:

```text
MANUAL_REVIEW
```

Đây là nguyên tắc rất quan trọng để tránh kết luận sai.

---

# 28. Xếp hạng tốt nghiệp dự kiến

Có thể hiển thị thêm **hạng tốt nghiệp dự kiến** theo GPA.

Theo Quy chế đào tạo:

```text
3.60 – 4.00 : Xuất sắc
3.20 – 3.59 : Giỏi
2.50 – 3.19 : Khá
2.00 – 2.49 : Trung bình
```

Tuy nhiên hạng Xuất sắc/Giỏi có thể bị giảm một mức nếu thuộc trường hợp quy định trong Quy chế, ví dụ:

- Khối lượng học phần phải thi lại vượt quá tỷ lệ được quy định.
- Bị kỷ luật từ mức cảnh cáo trở lên.

Vì vậy giao diện nên ghi:

```text
Hạng dự kiến: Giỏi
```

không phải:

```text
Hạng tốt nghiệp chính thức: Giỏi
```

---

# 29. Màu trạng thái

Đề xuất:

```text
Xanh lá  : EXPECTED_ELIGIBLE
Xanh dương: PENDING_GRADE
Cam       : PENDING_REQUIREMENT
Đỏ        : NOT_ELIGIBLE
Tím/Xám   : MANUAL_REVIEW
```

Không chỉ sử dụng màu; luôn đi kèm text/icon để đảm bảo accessibility.

---

# 30. Phân quyền

## Quản trị viên

Có quyền:

```text
Chạy đánh giá
Xem toàn bộ kết quả
Xuất báo cáo
Đánh dấu cần đối soát
```

## Phòng Đào tạo

Có thể:

```text
Xem chi tiết học phần
Đối soát CTĐT
Xác nhận dữ liệu đào tạo
```

## Phòng Công tác sinh viên

Có thể:

```text
Xem dữ liệu rèn luyện
Đối soát kỷ luật
```

## Người chỉ có quyền xem

```text
Không được chạy lại hoặc sửa phiên đánh giá
```

---

# 31. Audit log

Mọi thao tác quan trọng phải lưu.

Ví dụ:

```text
20/09/2026 13:00
admin
Chạy đánh giá
K44 / CNTT 2020
328 sinh viên
```

Nếu cán bộ thay đổi dữ liệu dùng để đối soát:

```text
20/09/2026 14:10
user: phongdaotao01
Xác nhận tương đương học phần
20CTxxxx -> 20CTyyyy
```

---

# 32. Xuất báo cáo

Cho phép xuất:

```text
Excel
PDF
CSV
```

Các nhóm:

```text
Danh sách dự kiến đủ điều kiện
Danh sách chưa đủ điều kiện
Danh sách chờ điểm
Danh sách chờ bổ sung
Danh sách cần đối soát
```

Mỗi sinh viên cần kèm lý do.

---

# 33. Các test case quan trọng

## TC01 – Đủ hoàn toàn

```text
150 TC
104 bắt buộc
46 tự chọn
GPA 3.1
GDTC đạt
GDQP đạt
Ngoại ngữ đạt
Không đình chỉ
```

Kết quả:

```text
EXPECTED_ELIGIBLE
```

---

## TC02 – 155 tín chỉ nhưng thiếu môn bắt buộc

```text
155 TC
Thiếu Đồ án tốt nghiệp
```

Kết quả:

```text
NOT_ELIGIBLE
```

---

## TC03 – Đủ 150 TC nhưng thiếu nhóm tự chọn

```text
Tổng 150
B2 chỉ đạt 22/25 TC
```

Kết quả:

```text
NOT_ELIGIBLE
```

---

## TC04 – Đồ án đang chờ điểm

```text
Đồ án = WAITING_GRADE
```

Kết quả:

```text
PENDING_GRADE
```

---

## TC05 – GPA 1.99

```text
GPA = 1.99
```

Kết quả:

```text
NOT_ELIGIBLE
```

---

## TC06 – Chưa đạt ngoại ngữ

```text
foreign_language = NOT_PASSED
```

Kết quả:

```text
PENDING_REQUIREMENT
```

hoặc `NOT_ELIGIBLE` tùy quy ước nghiệp vụ của Nhà trường.

Khuyến nghị:

```text
PENDING_REQUIREMENT
```

nếu sinh viên vẫn còn khả năng bổ sung trước đợt xét.

---

## TC07 – Thiếu dữ liệu ngoại ngữ

```text
foreign_language = NULL
```

Kết quả:

```text
MANUAL_REVIEW
```

---

## TC08 – Đang đình chỉ

```text
discipline_status = SUSPENDED
```

Kết quả:

```text
NOT_ELIGIBLE
```

---

## TC09 – Học phần tương đương

```text
CTĐT yêu cầu A
SV đã đạt B
A ~ B
```

Kết quả:

```text
A được tính hoàn thành
```

---

## TC10 – Rèn luyện chưa đồng bộ

```text
whole_course_training_score = NULL
```

Kết quả:

```text
MANUAL_REVIEW
```

Không tự kết luận sinh viên trượt.

---

# 34. Thứ tự triển khai chức năng

## Giai đoạn 1

Làm trước:

```text
CTĐT
Học phần
Tín chỉ
GPA
GDTC
GDQP
Ngoại ngữ
```

Đây là phần cốt lõi.

---

## Giai đoạn 2

Bổ sung:

```text
Rèn luyện
Kỷ luật
Học phần tương đương
Chuyển khóa
Chuyển CTĐT
```

---

## Giai đoạn 3

Bổ sung:

```text
Audit
Xuất báo cáo
So sánh các phiên
Dashboard thống kê
Thông báo tự động
```

---

# 35. Quy tắc quan trọng nhất khi lập trình

Không thiết kế:

```text
Sinh viên
    |
    +-- TC >= 150 ?
           |
           +-- Yes -> Tốt nghiệp
```

Mà phải là:

```text
Sinh viên
    |
    v
Đúng CTĐT?
    |
    v
Đủ học phần bắt buộc?
    |
    v
Đủ từng nhóm tự chọn?
    |
    v
Đủ tổng 150 TC?
    |
    v
Đủ cơ cấu 104 / 46?
    |
    v
Đạt Thực tập?
    |
    v
Đạt Đồ án?
    |
    v
GPA >= 2.00?
    |
    v
GDTC?
    |
    v
GDQP?
    |
    v
Ngoại ngữ?
    |
    v
Kỷ luật / pháp lý?
    |
    v
Dữ liệu rèn luyện đầy đủ?
    |
    v
DỰ KIẾN ĐỦ ĐIỀU KIỆN
```

---

# 36. Kết luận thiết kế

Chức năng **Dự kiến sinh viên tốt nghiệp** nên được xây dựng như một **rule-based evaluation engine** chứ không phải một truy vấn kiểm tra tổng tín chỉ.

Hệ thống cần trả lời được ba câu hỏi cho từng sinh viên:

1. **Sinh viên đang thiếu gì?**
2. **Thiếu bao nhiêu?**
3. **Quy tắc nào dẫn đến kết quả hiện tại?**

Kết quả cuối cùng phải có khả năng giải thích và truy vết.

Mô hình phù hợp nhất là:

```text
CTĐT
    +
Kết quả học tập
    +
Chuẩn đầu ra
    +
Rèn luyện
    +
Tình trạng sinh viên
    ↓
Rule Engine
    ↓
Evaluation Snapshot
    ↓
Kết quả dự kiến
```

Theo cách này, chức năng có thể mở rộng từ CNTT K44 sang các khóa và ngành khác mà không cần viết lại toàn bộ logic nghiệp vụ.

---

# 37. Checklist triển khai nhanh

- [ ] Tạo bảng phiên đánh giá.
- [ ] Tạo bảng kết quả từng sinh viên.
- [ ] Tạo bảng chi tiết từng rule.
- [ ] Map sinh viên với đúng CTĐT.
- [ ] Map CTĐT với các học phần bắt buộc.
- [ ] Map các nhóm tự chọn.
- [ ] Xử lý học phần tương đương.
- [ ] Tính tín chỉ hợp lệ.
- [ ] Tính GPA đúng quy chế.
- [ ] Đồng bộ GDTC.
- [ ] Đồng bộ GDQP.
- [ ] Đồng bộ chuẩn đầu ra ngoại ngữ.
- [ ] Đồng bộ rèn luyện.
- [ ] Đồng bộ kỷ luật.
- [ ] Sinh lý do chi tiết.
- [ ] Lưu snapshot.
- [ ] Xây màn hình lịch sử đánh giá.
- [ ] Xây màn hình chi tiết phiên.
- [ ] Xây màn hình chi tiết sinh viên.
- [ ] Thêm bộ lọc.
- [ ] Thêm xuất báo cáo.
- [ ] Thêm audit log.

---

## Phụ lục A – Các giá trị cố định cho CTĐT CNTT K44

```text
Ngành: Công nghệ Thông tin
CTĐT: 2020
Thời gian đào tạo: 4 năm

Tổng tín chỉ cần tích lũy: 150

Bắt buộc: 104
Tự chọn tối thiểu: 46

Giáo dục đại cương: 46
Giáo dục chuyên nghiệp: 104

Thực tập nghề nghiệp:
20CT4201
8 tín chỉ

Đồ án tốt nghiệp:
20CT4202
10 tín chỉ

GPA tích lũy tối thiểu:
2.00

Giáo dục thể chất:
Bắt buộc đạt

Giáo dục quốc phòng và an ninh:
Bắt buộc đạt

Chuẩn đầu ra ngoại ngữ:
Bắt buộc đạt
```

---

## Phụ lục B – Cảnh báo về phạm vi “luật cứng”

Những điều kiện không xuất hiện rõ ràng trong ba tài liệu trên không được tự xem là quy tắc bắt buộc.

Khi phát hiện nhu cầu mới:

```text
1. Yêu cầu văn bản làm căn cứ.
2. Gắn rule với văn bản.
3. Gắn version.
4. Chỉ sau đó mới kích hoạt trong hệ thống.
```

Điều này giúp hệ thống tránh tình trạng:

```text
"code chạy đúng"
nhưng
"nghiệp vụ sai".
```
