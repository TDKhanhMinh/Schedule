# Chuỗi xung đột — P3.2-T03

`CONFLICT-CHAIN-1.0.0` mở rộng chẩn đoán `CONFLICT-CATALOG-1.0.0` hiện có mà
không thay đổi mã lý do ổn định. Mỗi chuỗi được xác định tất định từ mã lý do và
các tham chiếu thực thể đã sắp xếp:

`entity references → constraint node → outcome node`

Chuỗi được phát ra cho chẩn đoán kiểm tra trước tối ưu và chẩn đoán đầy đủ của bộ
tối ưu, gồm xung đột tài nguyên cố định, thiếu sức chứa lớp/giáo viên, sẵn sàng
cứng và không khớp năng lực/sẵn sàng phòng. Tham chiếu chỉ là mã định danh có
giới hạn; không bao gồm stack trace, payload thô hoặc dữ liệu chưa được cấp quyền.
