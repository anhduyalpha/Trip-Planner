<div align="center">

# 🧭 Trip Planner — Quản lý lịch trình chuyến đi

**Ứng dụng web giúp nhóm bạn dựng lịch trình chuyến đi: tạo hoạt động, sắp xếp khung giờ,
phân quyền Lead/Member, chia tiền nhóm và theo dõi trạng thái theo thời gian thực.**

[![Production](https://img.shields.io/github/deployments/anhduyalpha/Trip-Planner/Production?style=for-the-badge&logo=vercel&logoColor=white&label=Production)](https://trip-planner-git-main-duydang0768134698-5991s-projects.vercel.app)
[![Release](https://img.shields.io/github/v/release/anhduyalpha/Trip-Planner?style=for-the-badge&logo=github&label=Release)](https://github.com/anhduyalpha/Trip-Planner/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-0F766E?style=for-the-badge)](LICENSE)

![ReactJS](https://img.shields.io/badge/ReactJS-18-61DAFB?logo=react&logoColor=white&labelColor=20232a)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white&labelColor=20232a)
![React Router](https://img.shields.io/badge/React_Router-6-CA4245?logo=reactrouter&logoColor=white&labelColor=20232a)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_·_Auth_·_Realtime-3FCF8E?logo=supabase&logoColor=white&labelColor=20232a)
![CSS](https://img.shields.io/badge/CSS-thuần-1572B6?logo=css3&logoColor=white&labelColor=20232a)

[🚀 Live Demo](https://trip-planner-git-main-duydang0768134698-5991s-projects.vercel.app) ·
[📦 Releases](https://github.com/anhduyalpha/Trip-Planner/releases) ·
[⚡ Chạy cục bộ](#-chạy-cục-bộ) ·
[✅ Đối chiếu đề bài](#-đối-chiếu-với-yêu-cầu-đề-bài) ·
[📄 MIT License](#-giấy-phép)

</div>

---

## ✨ Tính năng chính

| | Tính năng | Mô tả |
|---|---|---|
| 📝 | **CRUD Event** | Tiêu đề, mô tả, khung giờ, địa điểm, loại hoạt động, chi phí + người trả, assign nhiều thành viên |
| ✅ | **Luồng duyệt** | Member tạo event → *Chờ duyệt*; Lead duyệt / từ chối — ép ở tầng database bằng trigger |
| 🖱️ | **Kéo–thả** | Đổi khung giờ bằng drag & drop, kèm nút ↑ ↓ dùng được trên điện thoại |
| ⏱️ | **Realtime engine** | Tự chuyển *Sắp tới → Đang diễn ra → Đã xong* theo giờ thật, vạch **BÂY GIỜ** trên lịch |
| 🔐 | **Auth + phân quyền** | Đăng ký / đăng nhập Supabase Auth; Lead/Member phân quyền bằng Row Level Security |
| 💸 | **Chia tiền nhóm** | Chia đều theo người tham gia, bảng *đã trả – phải trả = dư/nợ*, gợi ý "ai trả cho ai" ít lần chuyển nhất |
| 📊 | **Thống kê** | Theo loại, theo trạng thái, chi phí từng loại, hoạt động đang diễn ra |
| 🔄 | **Đồng bộ nhiều máy** | Supabase Realtime — Lead duyệt event, máy thành viên tự cập nhật |

---

## 🚀 Bản triển khai & phát hành

| Kênh | Liên kết | Ghi chú |
|---|---|---|
| **Production** | [Mở Trip Planner trên Vercel ↗](https://trip-planner-git-main-duydang0768134698-5991s-projects.vercel.app) | Tự động triển khai từ `main` |
| **Latest release** | [Xem bản phát hành mới nhất ↗](https://github.com/anhduyalpha/Trip-Planner/releases/latest) | Ghi chú thay đổi và tag phiên bản |
| **Deployment history** | [Xem lịch sử triển khai ↗](https://github.com/anhduyalpha/Trip-Planner/deployments/Production) | Trạng thái từng lần build |

> Vercel có thể yêu cầu đăng nhập nếu **Deployment Protection** đang bật cho project.

---

## ⚡ Chạy cục bộ

> Yêu cầu: **Node.js 22 trở lên**. Database đã dựng sẵn trên Supabase — không cần cài đặt thêm dịch vụ local.

**1.** Cài thư viện:

```bash
npm install
```

**2.** Tạo file `.env` ở thư mục gốc với đúng nội dung sau:

```env
VITE_SUPABASE_URL=https://hihatziqrweeonrrylgz.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_S27PRuHQoyhTAblTId0e6A_8U0N9jwN
```

**3.** Chạy:

```bash
npm run dev
```

Mở <http://localhost:5173> → bấm **Đăng ký** tạo tài khoản bất kỳ (không cần xác nhận email) → dùng ngay.

> 🔒 **Ghi chú bảo mật:** Anon key của Supabase được thiết kế để công khai ở phía client (luôn nằm trong bundle JS gửi tới trình duyệt). Dữ liệu được bảo vệ bằng **Row Level Security** khai báo trong [`supabase/schema.sql`](supabase/schema.sql), không phụ thuộc vào việc giấu key. Key ghi sẵn ở đây để thuận tiện chấm bài; `service_role` key (bí mật thật sự) không xuất hiện ở bất kỳ đâu trong repo.

<details>
<summary>🛠️ <strong>Tự dựng database riêng (tùy chọn)</strong></summary>

<br>

1. Tạo project miễn phí tại <https://supabase.com>.
2. Vào **SQL Editor**, dán toàn bộ nội dung [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   File này tạo đủ bảng, khóa ngoại, Row Level Security, RPC và trigger.
3. Vào **Authentication → Providers → Email**, tắt *Confirm email* để đăng ký xong đăng nhập được ngay.
4. Copy `.env.example` thành `.env`, điền 2 giá trị ở **Project Settings → API**
   ⚠️ `VITE_SUPABASE_URL` là URL gốc dạng `https://xxxx.supabase.co`, **không** kèm `/rest/v1`.
5. `npm run dev`

</details>

Build production: `npm run build` · xem thử bản build: `npm run preview`

---

## ✅ Đối chiếu với yêu cầu đề bài

<details open>
<summary><strong>Bảng đối chiếu đầy đủ 6 nhóm yêu cầu</strong></summary>

<br>

| # | Yêu cầu | Nơi thực hiện |
|---|---|---|
| **1** | **CRUD Event** — title, mô tả, khung giờ, địa điểm, loại, trạng thái, hoàn thành, assign thành viên, chi phí + payer | [`EventForm.jsx`](src/components/EventForm.jsx) · [`EventCard.jsx`](src/components/EventCard.jsx) · [`TripContext.jsx`](src/context/TripContext.jsx) |
| | Form nhập bằng **Modal** | [`Modal.jsx`](src/components/Modal.jsx) |
| | **Validate**: title bắt buộc, giờ kết thúc sau giờ bắt đầu, chặn 2 event đè hoàn toàn lên nhau | [`schedule.js`](src/lib/schedule.js) → `validateEvent()`, `fullyOverlaps()` |
| | Chọn loại hoạt động qua **dropdown** | [`EventForm.jsx`](src/components/EventForm.jsx) |
| | **Luồng duyệt**: event của Member ở trạng thái *Chờ duyệt* | trigger `enforce_event_rules` trong [`schema.sql`](supabase/schema.sql) · khu "Chờ duyệt" ở [`Schedule.jsx`](src/pages/Schedule.jsx) |
| **2** | **Kéo–thả** đổi khung giờ + nút **↑ ↓** dự phòng | [`Schedule.jsx`](src/pages/Schedule.jsx) (HTML5 drag & drop) → `swapEventSlots()` |
| | **Realtime engine**: tự chuyển *Sắp tới → Đang diễn ra → Đã xong* | [`schedule.js`](src/lib/schedule.js) → `deriveStatus()` (tức thì, nhịp 30s) + RPC `sync_trip_statuses` ghi DB mỗi 30s |
| | *Tạm hoãn* không áp dụng logic tự động | `deriveStatus()` trả về nguyên trạng thái |
| | *Hủy* vẫn hiển thị, vẫn chiếm khung giờ, không auto | vẫn nằm trong đường ray và trong `findFullOverlap()`, bị loại khỏi tính tiền |
| | Hiển thị event đang diễn ra | khối "Ngay lúc này" + vạch **BÂY GIỜ** ở [`Schedule.jsx`](src/pages/Schedule.jsx) · [`Stats.jsx`](src/pages/Stats.jsx) |
| **3** | **Auth** đăng nhập / đăng ký | Supabase Auth · [`AuthContext.jsx`](src/context/AuthContext.jsx) · [`Login.jsx`](src/pages/Login.jsx) · [`Register.jsx`](src/pages/Register.jsx) |
| | **CRUD thành viên** (tên + vai trò mô tả) | [`Members.jsx`](src/pages/Members.jsx) |
| | **Phân quyền** Lead / Member | Row Level Security trong [`schema.sql`](supabase/schema.sql) + `canEditEvent()` ở [`TripContext.jsx`](src/context/TripContext.jsx) |
| | 1 trip 1 Lead, người tạo trip là Lead | `trips.lead_id`, gán khi tạo ở [`Trips.jsx`](src/pages/Trips.jsx) |
| **4** | **Chia đều chi phí** cho thành viên được assign | [`money.js`](src/lib/money.js) → `computeLedger()` |
| | **Ai nợ ai bao nhiêu** (đã trả − phải trả) | `computeLedger()` + `suggestSettlements()` (greedy, ít lần chuyển tiền nhất) |
| | Mỗi người đã chi / phải trả / tổng chuyến đi | [`Expenses.jsx`](src/pages/Expenses.jsx) |
| **5** | **Thống kê** theo loại, trạng thái, event đang diễn ra, chi phí | [`Stats.jsx`](src/pages/Stats.jsx) |
| **6** | **Lưu dữ liệu** | PostgreSQL trên Supabase · [`schema.sql`](supabase/schema.sql) |

</details>

---

## 📁 Cấu trúc thư mục

```
trip-planner/
├── LICENSE                 # giấy phép MIT
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── supabase/
│   └── schema.sql          # toàn bộ database: bảng, RLS, RPC, trigger
└── src/
    ├── main.jsx
    ├── App.jsx             # định tuyến + bảo vệ route
    ├── index.css           # hệ token màu/typography và toàn bộ style
    ├── lib/
    │   ├── supabase.js     # khởi tạo client
    │   ├── schedule.js     # trạng thái theo thời gian, validate, format
    │   └── money.js        # chia tiền, cân đối, gợi ý trả nợ
    ├── context/
    │   ├── AuthContext.jsx # phiên đăng nhập
    │   └── TripContext.jsx # dữ liệu chuyến đi, CRUD, đồng hồ, phân quyền
    ├── components/
    │   ├── LiveClock.jsx
    │   ├── Modal.jsx
    │   ├── EventForm.jsx
    │   └── EventCard.jsx
    └── pages/
        ├── Login.jsx
        ├── Register.jsx
        ├── Trips.jsx       # danh sách / tạo trip / tham gia bằng mã
        ├── TripLayout.jsx  # topbar + đồng hồ + tabs
        ├── Schedule.jsx    # đường ray lịch trình, drag & drop, chờ duyệt
        ├── Members.jsx
        ├── Expenses.jsx
        └── Stats.jsx
```

---

## 📄 Giấy phép

Trip Planner được phát hành theo giấy phép **MIT**. Bạn có thể sử dụng, chỉnh sửa
và phân phối lại dự án theo các điều khoản trong [`LICENSE`](LICENSE).

Copyright © 2026 [anhduyalpha](https://github.com/anhduyalpha).
