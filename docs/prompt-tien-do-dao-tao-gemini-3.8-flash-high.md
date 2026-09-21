# PROMPT CHO AGENT AI — XÂY DỰNG CHỨC NĂNG TIẾN ĐỘ ĐÀO TẠO

Bạn đang làm việc trực tiếp trên codebase hiện tại của dự án **Hệ thống cảnh báo sớm cho sinh viên**.

Nhiệm vụ: **phân tích codebase hiện tại và xây dựng/hoàn thiện chức năng “Tiến độ đào tạo”**.

Không rewrite project.  
Không thay stack.  
Không tự mở rộng phạm vi ngoài SPEC.  
Ưu tiên sửa tối thiểu trên kiến trúc hiện có.  
Mọi kết luận nghiệp vụ phải truy ngược được về dữ liệu hoặc rule hiện có trong project.

---

## 1. Mục tiêu nghiệp vụ

Chức năng **Tiến độ đào tạo** dùng để trả lời:

> **Sinh viên hiện đang đi tới đâu trong chương trình đào tạo và đã hoàn thành các học phần/tín chỉ như thế nào?**

Chức năng này KHÔNG phải là chức năng Dự kiến tốt nghiệp.

Phân biệt rõ:

### Tiến độ đào tạo
Tập trung vào:
- Sinh viên đã hoàn thành bao nhiêu tín chỉ?
- Đã hoàn thành bao nhiêu % chương trình?
- Học phần nào đã đạt?
- Học phần nào chưa đạt?
- Học phần nào chưa có điểm?
- Học phần nào chưa hoàn thành?
- Sinh viên đang ở giai đoạn/năm/học kỳ nào theo kế hoạch đào tạo?
- Có học phần nào của các kỳ trước chưa hoàn thành?
- Có học phần nào đã hoàn thành trước kế hoạch?

### Dự kiến tốt nghiệp
Tập trung vào:
- Còn thiếu gì để đủ điều kiện hoàn thành CTĐT/tốt nghiệp?

Không trộn logic của hai chức năng.

---

## 2. Nguồn dữ liệu

Hệ thống hiện có các nguồn chính:

### A. Chương trình đào tạo API

Dùng để xác định:
- Mã CTĐT của sinh viên
- Toàn bộ học phần thuộc CTĐT
- Mã học phần
- Tên học phần
- Số tín chỉ
- Học kỳ trong CTĐT
- Bắt buộc / tự chọn nếu API cung cấp
- Năm học
- TermID
- Học phần học trước / tiên quyết nếu có

Ví dụ các mã CTĐT:
- `CQ25CT` → K49
- `CQ24CT` → K48
- `CQ23CT` → K47
- `CQ22CT` → K46
- Có thể có nhánh `-PM`, `-MMT`

Phải dùng đúng CTĐT của sinh viên.  
Không mặc định các CTĐT giống nhau hoàn toàn.

### B. Bảng điểm sinh viên API

Dùng để xác định:
- Sinh viên đã có record học phần nào
- Điểm tổng kết
- Điểm chữ
- `IsPass`
- `NotScore`
- Năm học
- Học kỳ
- Số tín chỉ nếu có
- Các lần học lại / cải thiện nếu tồn tại

### C. Kế hoạch đào tạo / Kế hoạch giảng dạy

Dùng để xác định:
- Theo năm học hiện tại, khóa đó đang ở năm mấy
- Học kỳ hiện tại tương ứng giai đoạn nào trong CTĐT
- Học phần nào được bố trí theo kế hoạch ở từng học kỳ

Ví dụ năm học 2026–2027:
- K49 → Năm 2
- K48 → Năm 3
- K47 → Năm 4
- K46 → Năm 5

Kế hoạch đào tạo chỉ dùng để xác định **mốc tiến độ theo thời gian**.  
Không dùng kế hoạch để thay thế CTĐT.

---

## 3. Hạn chế dữ liệu bắt buộc phải tôn trọng

API hiện tại KHÔNG đủ dữ liệu để khẳng định chắc chắn:

- Sinh viên đã đăng ký môn nào ở kỳ tiếp theo
- Sinh viên hiện đang học chính xác môn nào
- Sinh viên đang chờ điểm môn nào
- Một môn chưa có điểm đồng nghĩa với đang học
- Một môn có trong kế hoạch kỳ hiện tại đồng nghĩa đã đăng ký

Vì vậy:

Không được suy diễn:

```text
NO_SCORE = đang học
NO_SCORE = đang chờ điểm
Có trong kế hoạch kỳ hiện tại = đã đăng ký
Chưa học = nợ môn
```

Nếu không đủ dữ liệu, dùng các trạng thái trung tính:
- `PASSED`
- `FAILED`
- `NO_SCORE`
- `NOT_COMPLETED`
- `FUTURE`
- `UNMATCHED`

---

## 4. Logic cốt lõi

Chức năng cần kết hợp:

```text
CTĐT của sinh viên
        +
Bảng điểm sinh viên
        +
Kế hoạch đào tạo hiện hành
        ↓
Tiến độ đào tạo
```

Hệ thống cần tính được:

1. Tổng tín chỉ yêu cầu của CTĐT
2. Tín chỉ đã hoàn thành hợp lệ
3. Tín chỉ chưa hoàn thành
4. % hoàn thành CTĐT
5. Số học phần đã đạt
6. Số học phần chưa đạt
7. Số học phần chưa có điểm
8. Số học phần chưa hoàn thành
9. Tiến độ theo năm/học kỳ
10. Các học phần của kỳ trước còn thiếu
11. Các học phần đã hoàn thành trước kế hoạch nếu xác định được

---

## 5. Cách tính % tiến độ

Không tính theo số lượng môn đơn thuần.

Dùng tín chỉ:

```text
progressPercent =
completedRequirementCredits / requiredCredits * 100
```

Trong đó:
- `completedRequirementCredits` chỉ gồm tín chỉ hợp lệ thuộc CTĐT
- không double-count
- không cộng vượt yêu cầu tự chọn làm tăng tiến độ giả

Nếu chưa đủ rule để biết tổng tín chỉ yêu cầu chính xác:
- không bịa con số
- trả `null` / `unknown`
- hiển thị cảnh báo dữ liệu

---

## 6. Xử lý học phần bắt buộc

Với học phần bắt buộc:

### PASS
- Đã hoàn thành
- Cộng tín chỉ

### FAIL
- Chưa hoàn thành
- Không cộng tín chỉ
- Đánh dấu `FAILED`

### Có record nhưng chưa có điểm
- `NO_SCORE`
- Không mặc định là đang học
- Không cộng tín chỉ

### Không có record bảng điểm
- `NOT_COMPLETED`

---

## 7. Xử lý học phần tự chọn

Đây là phần bắt buộc xử lý đúng.

Không được coi toàn bộ môn tự chọn là bắt buộc.

Ví dụ:

```text
Nhóm tự chọn:
Tổng có thể chọn = 12 TC
Yêu cầu tối thiểu = 6 TC

Sinh viên đã đạt = 9 TC
```

Kết quả:

```text
credited = 6
remaining = 0
extra = 3
```

Công thức:

```text
creditedElective =
min(passedElectiveCredits, requiredElectiveCredits)

remainingElective =
max(requiredElectiveCredits - passedElectiveCredits, 0)
```

Nếu có nhiều nhóm tự chọn:
- tính riêng từng nhóm
- không lấy tín chỉ dư nhóm A bù nhóm B trừ khi rule chính thức cho phép

Nếu chưa có ngưỡng tự chọn rõ ràng:
- không ép sinh viên hoàn thành toàn bộ các môn
- đánh dấu `UNKNOWN_REQUIREMENT`
- thiết kế service/model để cấu hình rule sau

---

## 8. Không double-count

Một học phần chỉ được tính tín chỉ một lần.

Nếu bảng điểm có nhiều record vì:
- học lại
- cải thiện
- dữ liệu trùng

thì:

- nếu có ít nhất một lần PASS → học phần được xem là hoàn thành
- không cộng tín chỉ nhiều lần
- nếu chưa PASS:
  - có FAIL → `FAILED`
  - chưa có điểm → `NO_SCORE`

Nếu CTĐT có record trùng:
- normalize/deduplicate trước khi tính
- không double-count cùng một học phần

---

## 9. Match học phần giữa các nguồn

Phải có lớp normalize tập trung.

Ưu tiên đối chiếu:

1. Mã học phần sau normalize
2. Alias đã được cấu hình/xác minh
3. Tên học phần sau normalize nếu tên chỉ match duy nhất một môn

Không fuzzy merge tùy tiện.

Ví dụ có thể có:

```text
20CT4105D
20CT4105
```

Không được mặc định đây là cùng môn chỉ vì khác hậu tố `D`.

Chỉ map khi:
- có alias/rule rõ ràng
hoặc
- dữ liệu hiện tại chứng minh đây là cùng học phần

Có thể normalize tên bằng:
- lowercase
- trim
- normalize whitespace
- normalize Unicode

Course không match CTĐT:
- không tự cộng vào tiến độ
- đưa vào `unmatchedCourses`
- hiển thị warning để đối soát

---

## 10. Tiến độ theo năm / học kỳ

Phải hiển thị tiến độ theo cấu trúc:

```text
Năm 1
├── HK1
└── HK2

Năm 2
├── HK1
└── HK2
...
```

Mỗi học kỳ nên có:

```text
requiredCredits
completedCredits
remainingCredits
completedCourses
failedCourses
noScoreCourses
notCompletedCourses
status
```

Trạng thái học kỳ có thể là:

- `COMPLETED`
- `INCOMPLETE`
- `CURRENT_PLAN`
- `FUTURE`
- `UNKNOWN`

Không dùng `CURRENT_PLAN` để khẳng định sinh viên đã đăng ký.

---

## 11. Xác định “đang học tới đâu”

Không được hiểu “đang học tới đâu” là “đang đăng ký môn nào”.

Nên hiểu là:

> **Theo CTĐT + kế hoạch đào tạo + kết quả đã có, sinh viên hiện đã hoàn thành tới giai đoạn nào?**

Có thể xác định:

### `lastCompletedSemester`
Học kỳ gần nhất mà sinh viên đã hoàn thành toàn bộ yêu cầu tối thiểu.

### `currentExpectedSemester`
Học kỳ hiện tại theo kế hoạch đào tạo của khóa.

### `progressGap`
Khoảng chênh lệch giữa:
- mốc đáng lẽ theo kế hoạch
- mốc hoàn thành thực tế

---

## 12. Không gọi tất cả môn chưa học là “nợ môn”

Phải chia:

```text
PAST_DUE
CURRENT_PLAN
FUTURE
```

### PAST_DUE
Học phần thuộc các kỳ đã qua nhưng chưa hoàn thành.

### CURRENT_PLAN
Học phần thuộc kỳ hiện tại theo kế hoạch nhưng chưa có kết quả đạt.

### FUTURE
Học phần thuộc kỳ tương lai.

Chỉ `PAST_DUE` mới nên được dùng để cảnh báo chậm tiến độ.

---

## 13. Logic chậm / đúng / vượt tiến độ

Không nên ép toàn bộ sinh viên vào duy nhất một nhãn.

Một sinh viên có thể vừa:
- còn thiếu 3 TC kỳ trước
- vừa hoàn thành trước 4 TC kỳ sau

Vì vậy trả các chỉ số độc lập:

```text
overdueCredits
currentPlanCredits
aheadCredits
```

Có thể thêm summary:

### `ON_TRACK`
Không còn yêu cầu tối thiểu của các kỳ trước bị thiếu.

### `BEHIND`
Còn học phần/tín chỉ bắt buộc hoặc tự chọn tối thiểu của các kỳ đã qua chưa hoàn thành.

### `AHEAD`
Có học phần thuộc kỳ tương lai đã hoàn thành.

Nếu vừa BEHIND vừa AHEAD:
- giữ cả hai flags
- không che mất thông tin

Ví dụ:

```json
{
  "isBehind": true,
  "isAhead": true,
  "overdueCredits": 3,
  "aheadCredits": 4
}
```

---

## 14. Output backend/service đề xuất

Không bắt buộc đúng 100% schema này nếu project có convention khác.

```json
{
  "student": {},
  "curriculum": {},

  "summary": {
    "requiredCredits": 135,
    "completedCredits": 42,
    "remainingCredits": 93,
    "progressPercent": 31.11,

    "completedCourses": 15,
    "failedCourses": 1,
    "noScoreCourses": 2,
    "notCompletedCourses": 20
  },

  "scheduleProgress": {
    "expectedYear": 2,
    "expectedSemester": "HK1",
    "lastCompletedSemester": 2,
    "isBehind": false,
    "isAhead": true,
    "overdueCredits": 0,
    "aheadCredits": 3
  },

  "semesters": [],

  "courseStatus": {
    "passed": [],
    "failed": [],
    "noScore": [],
    "notCompleted": [],
    "pastDue": [],
    "future": [],
    "unmatched": []
  },

  "electiveGroups": [],
  "warnings": []
}
```

---

## 15. UI đề xuất

Trang **Tiến độ đào tạo** cần ưu tiên trả lời:

> “Sinh viên đã đi được tới đâu?”

### A. Tổng quan

Hiển thị:
- tín chỉ đã hoàn thành / tín chỉ yêu cầu
- % hoàn thành
- số học phần đã đạt
- chưa đạt
- chưa có điểm

Có progress bar.

### B. Trạng thái so với kế hoạch

Ví dụ:

```text
Theo kế hoạch: Năm 2 - HK1

Kỳ gần nhất hoàn thành đầy đủ:
Năm 1 - HK2

Chậm tiến độ: 3 TC
Học trước kế hoạch: 4 TC
```

### C. Tiến độ theo học kỳ

Dạng accordion/timeline:

```text
Năm 1
  HK1   ✓ 15/15 TC
  HK2   ✓ 16/16 TC

Năm 2
  HK1   9/15 TC
  HK2   Chưa tới
```

### D. Học phần cần chú ý

Tách rõ:
- Chưa đạt
- Chưa có điểm
- Quá kế hoạch nhưng chưa hoàn thành
- Không khớp CTĐT

### E. Nhóm tự chọn

Ví dụ:

```text
Tự chọn nhóm A
9 / 6 TC
Đã hoàn thành yêu cầu
+3 TC học thêm
```

---

## 16. Không làm trong chức năng này

Không thêm các logic sau nếu không có dữ liệu thật:

- Dự đoán ngày tốt nghiệp
- Sinh viên sẽ đăng ký môn gì kỳ tới
- Môn nào đang học chính xác
- Môn nào đang chờ điểm chính xác
- Gợi ý chắc chắn lịch học tương lai

---

## 17. Kiến trúc xử lý đề xuất

```text
Student
   ↓
Xác định đúng CTĐT
   ↓
Lấy CTĐT
   ↓
Normalize + Deduplicate
   ↓
Lấy bảng điểm
   ↓
Normalize + Match course
   ↓
Xác định PASS / FAIL / NO_SCORE / NOT_COMPLETED
   ↓
Áp rule Required / Elective
   ↓
Tính tín chỉ hợp lệ
   ↓
Lấy kế hoạch đào tạo
   ↓
Map CTĐT semester ↔ kế hoạch hiện hành
   ↓
Tính tiến độ theo học kỳ
   ↓
Tính PAST_DUE / CURRENT_PLAN / FUTURE / AHEAD
   ↓
Trả progress summary + detail
```

Business logic phải nằm ở service/domain layer phù hợp.

Không để UI tự tính logic nghiệp vụ phức tạp.

---

## 18. Test case bắt buộc

### TC01
Môn bắt buộc PASS
→ cộng tín chỉ
→ PASSED

### TC02
Môn bắt buộc FAIL
→ không cộng tín chỉ
→ FAILED

### TC03
Có record nhưng chưa có điểm
→ NO_SCORE
→ không mặc định đang học

### TC04
Không có record
→ NOT_COMPLETED

### TC05
Học lại một môn 2 lần, lần sau PASS
→ course completed
→ tín chỉ chỉ cộng 1 lần

### TC06
Nhóm tự chọn cần 6 TC, SV đạt 9 TC
→ credited = 6
→ extra = 3
→ remaining = 0

### TC07
Nhóm tự chọn cần 6 TC, SV đạt 3 TC
→ remaining = 3

### TC08
Hai nhóm tự chọn
A dư 3 TC
B thiếu 3 TC
→ A không bù B

### TC09
Môn kỳ trước chưa hoàn thành
→ PAST_DUE
→ overdueCredits tăng

### TC10
Môn kỳ tương lai đã PASS
→ AHEAD
→ aheadCredits tăng

### TC11
Môn kỳ tương lai chưa học
→ FUTURE
→ không cảnh báo

### TC12
Course bảng điểm không match CTĐT
→ UNMATCHED
→ không cộng tín chỉ

### TC13
CTĐT có record trùng
→ không double-count

### TC14
Thiếu totalCredits/elective rule
→ không bịa % tiến độ
→ trả unknown + warning

### TC15
Sinh viên vừa thiếu môn kỳ trước vừa học trước kỳ sau
→ `isBehind = true`
→ `isAhead = true`
→ giữ cả hai thông tin

---

## 19. Acceptance Criteria

Chỉ xem là hoàn thành khi:

- Xác định đúng CTĐT của sinh viên.
- Tính đúng tín chỉ đã hoàn thành.
- Không double-count.
- Không coi mọi môn tự chọn là bắt buộc.
- Tính đúng tín chỉ tự chọn theo requirement.
- FAIL không được cộng tín chỉ.
- NO_SCORE không được tự hiểu là đang học/chờ điểm.
- Course ngoài CTĐT không được cộng tiến độ.
- Phân biệt PAST_DUE / CURRENT_PLAN / FUTURE.
- Có tiến độ theo năm/học kỳ.
- Có % tiến độ theo tín chỉ khi đủ dữ liệu.
- Có xử lý học trước kế hoạch.
- Có cảnh báo dữ liệu không match.
- UI không tự thực hiện business logic.
- Không phá các chức năng hiện có.
- Có loading/error/empty state.
- Responsive.
- Typecheck/lint/test/build pass nếu project hỗ trợ.

---

## 20. Cách thực hiện

Trước khi sửa code, hãy:

1. Đọc toàn bộ code liên quan đến sinh viên.
2. Đọc service/API bảng điểm.
3. Đọc service/API CTĐT.
4. Đọc dữ liệu kế hoạch đào tạo hiện tại.
5. Đọc chức năng Dự kiến tốt nghiệp hiện có để tránh duplicate logic.
6. Tìm các helper normalize course hiện có.
7. Tìm các bảng/rule elective hiện có.
8. Xác định dữ liệu thật nào đang có và dữ liệu nào chưa có.

Sau đó tạo checklist:

```text
- Rule nào đã có dữ liệu thật
- Rule nào chưa có dữ liệu
- Mapping nào đang hard-code
- File nào dự kiến sửa
- Logic nào có thể reuse
```

Rồi mới implement.

---

## 21. Sau khi hoàn thành

Báo cáo:

1. Các file đã tạo/sửa
2. Kiến trúc xử lý
3. Công thức tính progress
4. Cách xử lý bắt buộc/tự chọn
5. Cách xử lý học lại
6. Cách xác định PAST_DUE / FUTURE / AHEAD
7. Những dữ liệu API còn thiếu
8. Những assumption đang dùng
9. Test đã chạy
10. Acceptance Criteria nào PASS/FAIL

Nếu một rule không thể xác định từ dữ liệu hiện tại:
- không tự bịa
- implement theo hướng bảo thủ
- trả unknown/warning
- tiếp tục hoàn thành các phần còn lại
