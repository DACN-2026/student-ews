# Thiết kế chức năng Kỳ hè (Học kỳ phụ) — SEWS

## 1. Căn cứ và bản chất của kỳ hè

### 1.1 Theo Quy chế đào tạo tín chỉ (S3)

| Điều khoản | Nội dung |
|---|---|
| **Điều 6, khoản 1, điểm b** | Ngoài hai học kỳ chính, Hiệu trưởng xem xét tổ chức thêm **một kỳ học phụ** để SV có điều kiện **học lại, học bù hoặc học vượt**. Mỗi kỳ phụ ít nhất 5 tuần thực học, 1 tuần thi. |
| **Điều 10, khoản 3, điểm c** | Không quy định khối lượng học tập tối thiểu đối với SV ở kỳ phụ. |
| **Điều 11, khoản 1** | Rút bớt học phần ở kỳ phụ: sau 2 tuần kể từ đầu kỳ, không muộn quá 4 tuần. |
| **Điều 14, khoản 3** | Kết quả học tập trong kỳ phụ được **gộp vào kết quả học tập trong học kỳ chính ngay trước** kỳ phụ để xếp hạng học lực. |
| **Quy định rèn luyện, Điều 11** | Nội dung đánh giá phát sinh trong học kỳ hè được sử dụng để đánh giá kết quả rèn luyện cho **học kỳ chính kế tiếp**. Quy định không yêu cầu tạo một điểm rèn luyện hè chính thức rồi cộng hoặc lấy trung bình với điểm kỳ chính. |

### 1.2 Kết luận có căn cứ từ tài liệu nguồn

- Kỳ hè là **học kỳ phụ**, được tổ chức để sinh viên học lại, học bù hoặc học vượt.
- Kỳ hè **không có yêu cầu tín chỉ đăng ký tối thiểu**.
- Học kỳ phụ có ít nhất 5 tuần thực học và 1 tuần thi. Không đồng nhất "học kỳ phụ" với "kỳ thi phụ" được tổ chức sau kỳ thi chính.
- Kết quả học tập hè phải gộp vào kỳ chính ngay trước khi **xếp hạng học lực**; dữ liệu học phần hè vẫn cần được giữ riêng để truy vết.
- Nội dung rèn luyện phát sinh trong hè được đưa vào quy trình đánh giá của kỳ chính kế tiếp, không mặc nhiên tạo thành một điểm rèn luyện hè độc lập.
- CTĐT K44 có kế hoạch 8 học kỳ chính và không có milestone hè riêng. Học phần đạt trong hè vẫn đáp ứng yêu cầu học phần tương ứng trong CTĐT.

Các thông tin sau là quy ước hoặc giả định vận hành, cần xác nhận bằng dữ liệu/quy định hiện hành của DLU trước khi coi là quy tắc chính thức:

- mã kỳ hè luôn là `HK03`;
- chỉ một phần nhỏ sinh viên tham gia hè;
- Portal DLU đã gộp điểm hè vào `StudentTermSummary` của kỳ chính trước;
- các văn bản năm 2007, 2016 và CTĐT năm 2020 còn áp dụng nguyên trạng cho mọi khóa hiện tại.

### 1.3 Kết luận thiết kế

> **Kỳ hè là kỳ phụ có dữ liệu vận hành riêng, nhưng không phải kỳ xếp hạng học lực chính thức độc lập.**

Hệ thống phải:
1. **Lưu trữ** dữ liệu kỳ hè riêng (để truy vết).
2. **Phân biệt** chỉ số mô tả của kỳ hè với kết quả dùng cho xếp hạng/cảnh báo chính thức.
3. **Liên kết** kỳ hè với kỳ chính ngay trước cho kết quả học tập và kỳ chính kế tiếp cho nội dung rèn luyện.
4. **Phân biệt rõ ràng** kỳ hè và kỳ chính trên mọi giao diện.

---

## 2. Hiện trạng hệ thống

### 2.1 Cơ sở dữ liệu — Đã có cờ phân biệt

```
AcademicTerm {
  sTermCode    "HK01" | "HK02" | "HK03"
  sIsSummer    Boolean (dữ liệu hiện có đánh dấu HK03)    ← ĐÃ CÓ
  sTermOrder   1 | 2 | 3
}
```

### 2.2 Backend — Nơi đã dùng `sIsSummer`

| File | Cách dùng | Đánh giá |
|---|---|---|
| `conduct.ts` | `isSummerConductTerm()` — đánh dấu kỳ hè khi serialize | Đánh dấu đúng, nhưng chưa thể hiện kỳ chính sẽ sử dụng nội dung hè |
| `grades.ts` | Import điểm: tạo term với `s_is_summer = true` cho HK03 | Đúng |
| `training-programs.ts` | Seed kỳ: HK03 = "Học kỳ hè", summer = true | Đúng |
| `reports.ts` | Comment "Small summer terms not suitable" nhưng chỉ lọc bằng coverage 80% | Heuristic, không chắc chắn |

### 2.3 Backend — Nơi CHƯA phân biệt

| File | Vấn đề |
|---|---|
| `dashboard.ts` | GPA trend, bộ lọc kỳ — HK03 ngang hàng HK01, HK02 |
| `academic-warnings.ts` | Chạy cảnh báo trên mọi kỳ, không kiểm tra `sIsSummer` |
| Training progress | Kế hoạch, đợt tính — không phân biệt kỳ phụ |

### 2.4 Frontend — Nơi CHƯA phân biệt

| Trang | Vấn đề |
|---|---|
| Dashboard | Bộ lọc kỳ liệt kê HK01, HK02, HK03 ngang hàng. GPA trend hiển thị HK03 như điểm dữ liệu bình thường. |
| Hồ sơ SV | Tab rèn luyện có type `isSummer` nhưng không hiển thị khác biệt gì |
| Quản lý học kỳ | Có checkbox "Học kỳ hè" khi tạo kỳ, hiển thị badge "Học kỳ hè" — nhưng chỉ là nhãn, không ảnh hưởng logic |

---

## 3. Thiết kế chức năng

### 3.1 Dashboard — Bộ lọc kỳ

**Hiện tại:** Dropdown kỳ liệt kê `HK01`, `HK02`, `HK03` ngang hàng.

**Thiết kế mới:**

```
┌────────────────────────────┐
│ Học kỳ:  ▼                 │
│ ┌────────────────────────┐ │
│ │ Tất cả                 │ │
│ │ HK01 - Học kỳ 1        │ │
│ │ HK02 - Học kỳ 2        │ │
│ │ ───────────────────     │ │
│ │ HK03 - Học kỳ hè ☀️    │ │  ← Phân tách bằng divider
│ └────────────────────────┘ │
└────────────────────────────┘
```

- Backend trả thêm `isSummer: true` trong `filterOptions.terms`.
- Frontend phân tách kỳ chính và kỳ phụ bằng divider trong dropdown.
- Khi chọn một kỳ có `isSummer = true`, hiển thị **info banner** phía trên dashboard. Số người và tỷ lệ tham gia phải lấy từ dữ liệu thực tế:

```
ℹ️ Bạn đang xem dữ liệu Học kỳ hè — đây là kỳ phụ.
   Có 45/375 sinh viên trong phạm vi tham gia (12%); các chỉ số có thể không đại diện cho toàn khoa.
```

---

### 3.2 Dashboard — Biểu đồ GPA Trend

**Hiện tại:** Mỗi kỳ (kể cả HK03) là 1 điểm dữ liệu bình thường trên đường biểu đồ.

**Vấn đề:** Thành phần và số lượng sinh viên tham gia hè có thể khác đáng kể so với kỳ chính, làm GPA trung bình spike/dip và gây hiểu nhầm xu hướng.

**Thiết kế mới:**

```
GPA ▲
4.0  │
     │        ●───────────●
3.0  │   ●───╱    ◇        ╲───●
     │  ╱                       ╲
2.0  │─●                         ●──
     │
     └──HK1──HK2──Hè──HK1──HK2──HK1──▶
       24-25       25-26         26-27

● = Kỳ chính (đường liền, đậm)
◇ = Kỳ hè (điểm riêng, nét đứt, màu nhạt hơn)
```

**Quy tắc:**
- Đường chính (solid line) chỉ nối **kết quả chính thức của các kỳ chính** với nhau.
- Sau khi có kết quả hè, điểm dùng để xếp hạng của kỳ chính ngay trước có thể được tính lại. Cần lưu phiên bản/cutoff để phân biệt kết quả trước và sau khi gộp hè.
- Nếu có GPA hè thô, chỉ hiển thị dưới dạng **điểm mô tả riêng biệt** (dot, màu nhạt, không nối vào đường chính), kèm nhãn _"Không dùng độc lập để xếp hạng học lực"_.
- Nếu nguồn chỉ cung cấp GPA kỳ chính đã gộp hè, không tự tính và cộng thêm lần nữa. Khi đó chỉ hiển thị chú thích rằng kỳ chính đã bao gồm kết quả hè.
- Tooltip kỳ hè ghi rõ, ví dụ: `"Học kỳ hè — 45 SV tham gia (12%) — số liệu mô tả"`.
- Backend trả thêm `isSummer`, `studentCount`, `coverage`, `calculationMode` và thông tin kỳ chính được gộp trong mỗi điểm trend.

---

### 3.3 Báo cáo — Chọn kỳ thống kê

**Hiện tại:** `selectLatestReportingPeriod()` dùng coverage 80% để tự loại kỳ nhỏ.

**Thiết kế mới:**
- Khi chọn kỳ báo cáo **tự động** (không có bộ lọc tay), **loại bỏ** kỳ có `sIsSummer = true` khỏi danh sách ứng viên.
- Khi người dùng **chủ động chọn** kỳ hè trong bộ lọc, cho phép nhưng:
  - Ghi rõ trong báo cáo: _"Kỳ thống kê: Học kỳ hè (kỳ phụ)"_.
  - Thêm ghi chú số lượng SV tham gia so tổng số.
  - Gắn nhãn _"Số liệu mô tả — không phải kết quả xếp hạng học lực độc lập"_.

---

### 3.4 Cảnh báo học vụ và giám sát kỳ hè

**Hiện tại:** `evaluate()` chạy trên mọi kỳ, kể cả HK03.

**Thiết kế mới — Không ban hành kết luận cảnh báo chính thức từ kỳ hè độc lập.**

Lý do:
- Theo quy chế, kết quả hè gộp vào kỳ chính trước đó khi xếp hạng học lực → GPA hè đơn lẻ không phải căn cứ kết luận chính thức.
- Kỳ hè không có yêu cầu tín chỉ tối thiểu → không được dùng tiêu chí "thiếu số tín chỉ đăng ký tối thiểu" như ở kỳ chính.
- Nếu dữ liệu thực tế cho thấy tỷ lệ tham gia thấp, chỉ số tổng hợp của kỳ hè có thể không đại diện cho toàn khoa và dễ gây nhiễu.

**Cụ thể:**

| Bước | Xử lý |
|---|---|
| Run xếp hạng/cảnh báo chính thức | Chỉ nhận kỳ chính làm `assessmentAcademicTermId`. Khi người dùng chọn kỳ hè, hướng dẫn chọn kỳ chính ngay trước và dùng snapshot đã gộp kết quả hè. |
| Run giám sát hè | Có thể hỗ trợ chế độ riêng `SUMMER_MONITORING`, chỉ theo dõi đăng ký, rút/bỏ học phần, kết quả chưa đạt và nhu cầu hỗ trợ; không phát sinh kết luận học lực chính thức. |
| GPA và kết quả học phần | Nếu Portal chưa gộp, tính lại snapshot của kỳ chính ngay trước sau khi kết thúc hè. Nếu Portal đã gộp, sử dụng dữ liệu nguồn và không cộng trùng. |
| Phiên bản và truy vết | Lưu cutoff, phiên bản dữ liệu và trạng thái `PRE_SUMMER`/`POST_SUMMER` của kết quả kỳ chính được tính lại. |
| Hiển thị lịch sử | Run cũ chạy trực tiếp trên kỳ hè phải gắn badge: _"Đánh giá kỳ phụ — tham khảo, không phải kết luận chính thức"_. |

> Báo cáo giám sát kỳ hè là một chế độ phân tích/hỗ trợ riêng, không thay thế quy trình xếp hạng học lực hoặc quyết định học vụ của nhà trường.

---

### 3.5 Rèn luyện — Nội dung phát sinh trong kỳ hè

**Hiện tại:** `ConductService` trả `isSummer` trong response nhưng chưa thể hiện rõ kỳ phát sinh và kỳ được dùng để đánh giá.

**Thiết kế mới — Hai chế độ hiển thị:**

#### a) Hiển thị chi tiết (Hồ sơ SV)
- Giữ riêng dữ liệu/minh chứng rèn luyện phát sinh trong hè để truy vết.
- Gắn nhãn rõ: _"Phát sinh trong kỳ hè — dùng khi đánh giá kỳ chính tiếp theo"_.
- Nếu nguồn có một giá trị điểm hè, hiển thị là _"điểm nguồn/tạm thời"_; không tự phân loại Khá/Tốt hoặc coi là điểm đã công nhận nếu chưa có quyết định.
- Hiển thị quan hệ giữa `sourceTerm` (kỳ hè) và `evaluationTerm` (kỳ chính tiếp theo).

```
Năm học 2024-2025
├── HK1  │ 85 điểm │ Tốt      │ ✅ Đã công nhận
├── HK2  │ 78 điểm │ Khá      │ ✅ Đã công nhận
└── ☀️ Hè │ 3 minh chứng       │ ⏳ Chờ sử dụng   │ → Đánh giá trong HK1 2025-2026
```

#### b) Tổng hợp (Dashboard, Báo cáo)
- Theo Điều 11 của quy định rèn luyện, **nội dung đánh giá** của kỳ hè được dùng khi đánh giá kỳ chính tiếp theo.
- Không cộng, lấy trung bình hoặc thay thế điểm kỳ chính bằng một điểm hè nếu chưa có quy tắc được đơn vị có thẩm quyền xác nhận.
- Điểm rèn luyện năm học và toàn khóa không được tính kỳ hè như một học kỳ thứ ba độc lập.
- Ghi rõ trong `dataContext`: _"Kết quả kỳ chính có sử dụng nội dung rèn luyện phát sinh trong kỳ hè"_.

> **Lưu ý hướng xử lý khác nhau:**
> - **Điểm học tập**: gộp vào kỳ chính **trước** (theo quy chế Điều 14.3)
> - **Rèn luyện**: nội dung phát sinh trong hè được dùng khi đánh giá kỳ chính **tiếp theo** (Điều 11 của quy định rèn luyện); không mặc nhiên là phép gộp hai điểm số.
>
> Đây là hai quy tắc khác nhau cho hai loại dữ liệu và cần được mô hình hóa riêng.

---

### 3.6 Tiến độ CTĐT

**Thiết kế mới:**

- **Kế hoạch đào tạo** (`TrainingProgressPlan`) **không tạo mục riêng cho kỳ hè**. Kỳ hè không có yêu cầu tín chỉ tối thiểu, không nằm trong lộ trình chuẩn.
- **Bằng chứng đạt**: Môn hoàn thành trong hè giữ `actualCompletionTerm` là kỳ hè và đáp ứng đúng học phần/milestone gốc trong CTĐT.
- **Học lại hoặc học bù**: Khi đạt trong hè, đánh dấu yêu cầu còn thiếu của kỳ kế hoạch trước đã được hoàn thành tại thời điểm hè.
- **Học vượt**: Khi đạt trong hè, đánh dấu sớm yêu cầu của kỳ kế hoạch tương lai; không chuyển học phần đó thành kế hoạch của kỳ chính tiếp theo.
- **Đối chiếu đăng ký**: Không đánh giá thiếu khối lượng đăng ký tối thiểu trong hè. Có thể chạy đối chiếu mô tả để theo dõi lớp đã đăng ký và kết quả.
- **Đánh giá hoàn thành**: Có thể chạy reconciliation sau hè để cập nhật trạng thái các yêu cầu CTĐT; không tạo một milestone hè và không tự động gắn mọi kết quả vào kỳ chính tiếp theo.

---

### 3.7 Hồ sơ sinh viên

**Thiết kế mới — Phân biệt visual cho kỳ hè:**

| Tab | Thay đổi |
|---|---|
| **Overview** | Nếu GPA trend hiển thị, áp dụng quy tắc giống Dashboard (3.2). |
| **Điểm** | Môn kỳ hè hiển thị với badge `☀️ Hè`. Tooltip nêu kỳ chính ngay trước được dùng để xếp hạng; không hard-code HK2 mà lấy từ quan hệ kỳ hoặc thứ tự thời gian. |
| **Rèn luyện** | Hiển thị nội dung/minh chứng hè và kỳ chính tiếp theo sẽ sử dụng chúng; không hiển thị phân loại chính thức riêng nếu chưa được công nhận. |
| **Đăng ký** | Môn đăng ký kỳ hè gắn badge `Kỳ phụ`. |
| **Cảnh báo** | Phân biệt kết quả chính thức của kỳ chính với báo cáo `SUMMER_MONITORING`; run lịch sử trên kỳ hè ghi _"Đánh giá kỳ phụ — tham khảo"_. |

---

### 3.8 Quản lý học kỳ (Academics)

**Hiện tại:** Có checkbox "Học kỳ hè" và badge hiển thị.

**Thiết kế mới — Tăng cường:**
- Khi tạo kỳ mới với `isSummer = true`, chỉ gợi ý `sTermCode = "HK03"`, `sTermOrder = 3` nếu đây là quy ước đã được cấu hình/xác nhận; không suy luận bản chất kỳ chỉ từ mã `HK03`.
- Cho phép kỳ hè là `isCurrent = true` khi đó là kỳ đang vận hành.
- Tách khái niệm kỳ hiện tại khỏi kỳ mặc định dùng cho báo cáo/xếp hạng, ví dụ bằng `defaultReportingTermId` hoặc hàm chọn kỳ chính gần nhất đủ dữ liệu.
- Lưu hoặc suy ra rõ `previousMainTermId` và `nextMainTermId` theo thời gian để tránh hard-code HK1/HK2.
- Trong bảng danh sách kỳ, dùng **visual grouping**: tách kỳ chính và kỳ phụ.

---

## 4. Bảng tóm tắt quy tắc nghiệp vụ

| Quy tắc | Áp dụng cho | Chi tiết |
|---|---|---|
| **R1** | Lưu trữ | Kỳ hè lưu riêng với `sIsSummer = true`. Không xóa, không trộn vào kỳ chính ở tầng dữ liệu. |
| **R2** | Xếp hạng học lực | Kết quả học tập hè gộp vào **kỳ chính ngay trước** khi xếp hạng; giữ snapshot/phiên bản trước và sau hè, không cộng trùng dữ liệu nguồn. |
| **R3** | Rèn luyện | Nội dung phát sinh trong hè dùng khi đánh giá **kỳ chính tiếp theo**; không mặc nhiên tạo/gộp một điểm hè độc lập. |
| **R4** | Cảnh báo | Không tạo kết luận học lực chính thức từ kỳ hè độc lập; cho phép chế độ giám sát hè không chính thức. |
| **R5** | Tiến độ | Không tạo milestone hè. Bằng chứng đạt hè đáp ứng học phần/milestone gốc và giữ kỳ hoàn thành thực tế. |
| **R6** | Báo cáo tự động | Không chọn kỳ hè làm kỳ báo cáo mặc định. |
| **R7** | Bộ lọc | Cho phép chọn kỳ hè thủ công nhưng ghi rõ là kỳ phụ. |
| **R8** | Biểu đồ | GPA hè thô, nếu có, chỉ là điểm mô tả tách biệt; đường chính dùng kết quả chính thức của kỳ chính. |
| **R9** | Kỳ hiện tại | Kỳ hè có thể là kỳ vận hành hiện tại nhưng không mặc định là kỳ báo cáo/xếp hạng. |
| **R10** | Liên kết kỳ | Xác định kỳ chính trước/sau bằng ID hoặc thời gian, không hard-code HK1/HK2 hay suy luận chỉ từ mã `HK03`. |

---

## 5. Checklist triển khai

### Phase 1 — UI/Display (an toàn, không đụng logic nghiệp vụ)

- [ ] Backend `filterOptions.terms` trả thêm `isSummer`
- [ ] Frontend dashboard: phân tách kỳ hè trong dropdown, thêm info banner
- [ ] Frontend dashboard: phân biệt kết quả chính thức của kỳ chính với GPA hè mô tả
- [ ] Frontend hồ sơ SV: badge kỳ hè ở tab điểm; hiển thị nội dung rèn luyện hè và kỳ đánh giá đích
- [ ] `selectLatestReportingPeriod` lọc cứng kỳ hè

### Phase 2 — Logic nghiệp vụ

- [ ] Mô hình kỳ: bổ sung/xác nhận liên kết kỳ chính trước và sau; tách kỳ hiện tại khỏi kỳ báo cáo mặc định
- [ ] `academic-warnings.ts`: chỉ cho phép kỳ chính với run chính thức; bổ sung `SUMMER_MONITORING` nếu cần
- [ ] GPA/xếp hạng: tính hoặc tiếp nhận snapshot kỳ chính sau khi gộp hè, có chống cộng trùng và lưu phiên bản
- [ ] Training progress: không tạo plan hè; áp kết quả hè vào học phần/milestone gốc
- [ ] Rèn luyện: chuyển nội dung/minh chứng hè sang kỳ đánh giá kế tiếp, không tự gộp điểm số
- [ ] Academics page: cho phép kỳ hè là `isCurrent`, nhưng không dùng làm kỳ báo cáo mặc định

### Phase 3 — Xác nhận và nâng cao

- [ ] Xác nhận: `StudentTermSummary` từ Portal DLU đã gộp điểm hè vào kỳ chính chưa?
- [ ] Xác nhận: nếu chưa, cần logic tính GPA gộp ở backend
- [ ] Xác nhận quy ước mã `HK03`, tỷ lệ tham gia và cách Portal biểu diễn điểm rèn luyện hè
- [ ] Xác nhận văn bản áp dụng theo khóa/chương trình trước khi dùng làm quy tắc chính thức
- [ ] Tài liệu: cập nhật ARCHITECTURE.md với quy tắc R1–R10
