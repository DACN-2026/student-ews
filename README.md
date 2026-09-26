# SEWS — Student Early Warning System

> **Hệ thống Theo dõi Học vụ và Cảnh báo Sớm Sinh viên**  
> Khoa Công nghệ Thông tin — Trường Đại học Đà Lạt (DLU).

---

## 1. Giới thiệu

**SEWS** là nền tảng quản lý học vụ và cảnh báo sớm giúp tập trung dữ liệu sinh viên, điểm số, rèn luyện và tiến độ đào tạo:

- **Theo dõi tiến độ**: Tự động đối chiếu kết quả học tập của sinh viên với Khung chương trình đào tạo (CTĐT) chuẩn.
- **Cảnh báo sớm**: Phát hiện nguy cơ học vụ (GPA thấp, nợ tín chỉ bắt buộc, chậm tiến độ) theo 3 mức độ **Xanh - Vàng - Đỏ**.
- **Can thiệp kịp thời**: Cung cấp công cụ cho Cố vấn học tập (CVHT) ghi nhận và theo dõi nhật ký tư vấn, hỗ trợ sinh viên.
- **Dự kiến tốt nghiệp**: Đánh giá sớm khả năng tốt nghiệp dựa trên tín chỉ và các chuẩn đầu ra (ngoại ngữ, tin học, GDTC, GDQP, ĐRL).
- **Báo cáo & Phân quyền**: Xuất dữ liệu Excel/PDF và phân quyền chặt chẽ theo phạm vi dữ liệu (Admin, Ban chủ nhiệm Khoa, CVHT).

---

## 2. Công nghệ & Kiến trúc

Hệ thống được tổ chức theo mô hình **npm monorepo** gồm 2 ứng dụng độc lập:

| Thành phần | Công nghệ | Vai trò |
| :--- | :--- | :--- |
| **Frontend** (:3000) | Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand | Giao diện người dùng, proxy `/api/v1` |
| **Backend** (:3001) | Next.js 16 Route Handlers, TypeScript | Xử lý 97 REST API endpoints, RBAC, Services |
| **Cơ sở dữ liệu** | PostgreSQL, Prisma ORM 6 | Quản lý schema, migrations và query type-safe |
| **Bảo mật** | JWT (`jose`), `bcryptjs`, HttpOnly Cookie | Xác thực, kiểm soát Origin và Data Scope |
| **Xuất báo cáo** | ExcelJS, PDFKit (font Noto Sans) | Xuất file XLSX nhiều sheet và PDF tiếng Việt |

```text
apps/
  frontend/     # Next.js: Giao diện, components, stores và proxy API (:3000)
  backend/      # API: Route handlers, services, auth, Prisma, migrations (:3001)
docs/           # Tài liệu chi tiết về kiến trúc, nghiệp vụ và hướng dẫn sử dụng
scripts/        # Scripts chạy đồng thời 2 ứng dụng và smoke test
```

---

## 3. Hướng dẫn cài đặt & Khởi chạy

### Yêu cầu tiên quyết
- **Node.js** >= 20.9.0 | **npm** >= 10.x | **PostgreSQL** >= 14

### Bước 1: Clone mã nguồn và cài đặt dependencies
```bash
git clone https://github.com/Cookie1109/student-ews.git
cd student-ews
npm ci
```

### Bước 2: Cấu hình biến môi trường
Tạo file cấu hình từ file mẫu:

```bash
# Windows (PowerShell)
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/frontend/.env.example apps/frontend/.env.local

# Linux / macOS (Bash)
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Cập nhật thông tin kết nối trong `apps/backend/.env`:
```env
DATABASE_URL="postgresql://postgres:your_password@127.0.0.1:5432/cntt-portal?schema=public"
JWT_SECRET="chuoi-ky-jwt-ngau-nhien-toi-thieu-32-ky-tu"
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```
*(File `apps/frontend/.env.local` giữ mặc định `BACKEND_URL=http://127.0.0.1:3001`)*

### Bước 3: Khởi tạo Cơ sở dữ liệu
```bash
# 1. Sinh Prisma Client
npm run db:generate

# 2. Áp dụng migration vào PostgreSQL
npm run db:deploy

# 3. Khởi tạo vai trò, quyền và dữ liệu mẫu cơ bản
npm run db:seed
```

> **Tùy chọn**: Nạp bộ dữ liệu học vụ thực tế chuẩn hóa (K44–K46) và tính toán snapshot:
> ```bash
> npm run db:import-apidog
> npm run db:sync-apidog-progress
> npm run db:sync-apidog-graduation
> ```

### Bước 4: Khởi chạy môi trường phát triển
```bash
npm run dev
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:3001](http://localhost:3001) (Kiểm tra kết nối: `/api/v1/healthz`)

*(Dừng ứng dụng bằng tổ hợp phím `Ctrl + C`)*

---

## 4. Tài khoản đăng nhập mặc định (Demo)

| Vai trò | Tên đăng nhập | Mật khẩu mặc định | Phạm vi dữ liệu |
| :--- | :--- | :--- | :--- |
| **Quản trị hệ thống** | `admin` | `Admin@123` | Toàn hệ thống |
| **Ban chủ nhiệm Khoa** | `dean.demo` | `Dean@123456` | Toàn Khoa CNTT |
| **Cố vấn học tập** | `advisor.demo` | `Advisor@1234566` | Lớp được phân công |

---

## 5. Danh mục câu lệnh thường dùng

| Lệnh | Chức năng |
| :--- | :--- |
| `npm run dev` | Chạy đồng thời Frontend (:3000) và Backend (:3001) |
| `npm run dev:frontend` / `backend` | Khởi chạy riêng biệt từng ứng dụng |
| `npm run build` | Build production cho cả hai ứng dụng |
| `npm start` | Chạy bản build production |
| `npm run db:generate` | Sinh Prisma Client từ schema |
| `npm run db:deploy` | Áp dụng migration lên database |
| `npm run db:seed` | Nạp vai trò, quyền và tài khoản demo |
| `npm run db:studio` | Mở giao diện quản lý dữ liệu Prisma Studio (:5555) |
| `npm test` | Chạy unit test và kiểm tra API contract |
| `npm run test:smoke` | Smoke test kiểm tra toàn diện HTTP/Auth/Proxy |
| `npm run typecheck` | Kiểm tra kiểu TypeScript toàn bộ dự án |

---

