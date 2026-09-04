import json
import sys

from pydantic import ValidationError

from .teacher_assignment_contracts import TeacherAssignmentRequest, TeacherAssignmentResult
from .teacher_assignment_solver import solve_teacher_assignments


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        payload = json.load(sys.stdin)
        request = TeacherAssignmentRequest.model_validate(payload)
    except json.JSONDecodeError as error:
        print(json.dumps({"error": {"code": "INVALID_JSON", "message": str(error)}}, ensure_ascii=True), file=sys.stderr)
        return 2
    except ValidationError as error:
        print(
            json.dumps(
                {"error": {"code": "INVALID_TEACHER_ASSIGNMENT_REQUEST", "message": "Payload không hợp lệ.", "details": error.errors()}},
                ensure_ascii=True,
            ),
            file=sys.stderr,
        )
        return 2
    result: TeacherAssignmentResult = solve_teacher_assignments(request)
    print(json.dumps(result.model_dump(mode="json"), ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
