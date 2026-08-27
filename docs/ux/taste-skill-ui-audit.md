# Taste Skill UI audit và design foundation

## Design read

Đây là redesign preserve cho ứng dụng vận hành B2B của nhà trường. UI phải ưu tiên tin cậy, đọc nhanh và phản hồi rõ ràng thay vì hiệu ứng marketing.

- `DESIGN_VARIANCE: 3`: bố cục ổn định cho Scheduler, Admin và Reviewer.
- `MOTION_INTENSITY: 2`: chỉ dùng transition ngắn cho hover, focus và state change.
- `VISUAL_DENSITY: 7`: bảng và dữ liệu nghiệp vụ là nội dung chính.
- Design system: shadcn/ui + Tailwind v4 + semantic CSS variables.
- Font: Geist self-hosted qua `@fontsource-variable/geist`.
- Accent: xanh dương hiện hữu của sản phẩm, dùng nhất quán ở CTA, focus và active state.

## Information architecture

- Tổng quan: tình trạng hệ thống, nhập liệu, job và audit gần đây.
- Dữ liệu danh mục: trường, năm học, khung tiết, giáo viên, lớp, môn, phòng và phân công.
- Nhập dữ liệu: upload, preview, validate, confirm và error report.
- Thời khóa biểu: toàn trường, theo lớp, giáo viên, phòng, chỉnh sửa, phát hành và export.
- Public schedule: read-only, print và PDF.

Route, label navigation, API contract và form field name được giữ nguyên.

## Current findings

| Area        | Finding                                                                      | Direction                                                    |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Shell       | App shell đã responsive nhưng còn nhiều style cũ song song với utility class | Giữ shell hiện tại, chuẩn hóa token và focus/keyboard state  |
| Dashboard   | Có dữ liệu API và state cơ bản, nhưng hierarchy hành động còn dàn đều        | Đưa action chính lên trước, nhóm status theo công việc       |
| Master data | `master-data-screen.tsx` còn khoảng 800 dòng sau khi tách module             | Tiếp tục tách presenter, form và table nếu cần               |
| Timetable   | Có bốn góc nhìn và khung Excel-like                                          | Giữ layout, cải thiện divider, sticky context và empty state |
| Import      | Có preview/validation nhưng còn dùng CSS legacy                              | Chuẩn hóa upload, error summary và action hierarchy          |
| Release     | Có workflow card và dialog                                                   | Giữ contract, làm rõ quyền và trạng thái chuyển tiếp         |
| Public view | Read-only flow tách riêng                                                    | Giữ hierarchy đơn giản, ưu tiên in và mobile                 |

## Rules to apply

- Không thêm design system thứ hai.
- Không thêm gradient, glassmorphism hoặc motion trang trí.
- Không dùng dữ liệu giả để lấp khoảng trống UI.
- Bảng dài dùng scroll container, header rõ và border có mục đích.
- Loading, empty, error và success phải giữ cùng layout shell.
- Dark mode đổi qua semantic tokens, không override rải rác theo component.
- Reduced motion phải giữ giao diện tĩnh và không làm mất feedback.
- Mọi thay đổi visual phải được kiểm tra ở 1280px, 1440px và 390px.

## Exit evidence

- `npm run ci:local` pass.
- Browser smoke không có console error.
- Keyboard focus và dialog/dropdown pass.
- Light, dark, system và reduced motion pass.
- Screenshot/evidence ghi route, viewport, theme và kết quả.
