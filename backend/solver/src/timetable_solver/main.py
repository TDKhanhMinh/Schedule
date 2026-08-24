import argparse
import json
import sys

from pydantic import ValidationError

from .contracts import SolveJobRequest
from .solver import solve


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the versioned timetable solver JSON contract")
    parser.add_argument(
        "--random-seed",
        type=int,
        default=0,
        help="Deterministic solver seed; default: 0. This is a runner control, not a v1 request field.",
    )
    return parser


def _print_error(code: str, message: str, details: object) -> int:
    print(
        json.dumps(
            {"error": {"code": code, "message": message, "details": details}},
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )
    return 2


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        return _print_error(
            "INVALID_JSON",
            "Input phải là JSON hợp lệ.",
            {"line": error.lineno, "column": error.colno, "message": error.msg},
        )

    try:
        request = SolveJobRequest.model_validate(payload)
    except ValidationError as error:
        return _print_error(
            "INVALID_SOLVE_REQUEST",
            "Payload không khớp SolveJobRequest schemaVersion 1.0.",
            error.errors(),
        )

    result = solve(request, random_seed=args.random_seed)
    print(result.model_dump_json())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
