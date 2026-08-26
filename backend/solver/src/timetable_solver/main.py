import argparse
import json
import sys

from pydantic import ValidationError

from .contracts import SolveJobRequest
from .solver import solve
from .solver_adapter import SolverAdapterPayload


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Chạy hợp đồng JSON phiên bản của bộ tối ưu thời khóa biểu")
    parser.add_argument(
        "--random-seed",
        type=int,
        default=None,
        help="Hạt giống bộ tối ưu xác định; mặc định dùng hạt giống của bộ điều hợp hoặc 0 cho yêu cầu thô.",
    )
    return parser


def _print_error(code: str, message: str, details: object) -> int:
    print(
        json.dumps(
            {"error": {"code": code, "message": message, "details": details}},
            ensure_ascii=True,
        ),
        file=sys.stderr,
    )
    return 2


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    args = _build_parser().parse_args(argv)

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        return _print_error(
            "INVALID_JSON",
            "Input phải là JSON hợp lệ.",
            {"line": error.lineno, "column": error.colno, "message": error.msg},
        )

    adapter_payload = None
    if isinstance(payload, dict) and payload.get("adapterContractVersion"):
        try:
            adapter_payload = SolverAdapterPayload.model_validate(payload)
            request = adapter_payload.input
        except ValidationError as error:
            return _print_error(
                "INVALID_SOLVER_ADAPTER_PAYLOAD",
                "Payload không khớp SOLVER-ADAPTER-1.0.0 hoặc checksum không hợp lệ.",
                error.errors(),
            )
    else:
        try:
            request = SolveJobRequest.model_validate(payload)
        except ValidationError as error:
            return _print_error(
                "INVALID_SOLVE_REQUEST",
                "Payload không khớp SolveJobRequest schemaVersion 1.0.",
                error.errors(),
            )

    random_seed = args.random_seed if args.random_seed is not None else (adapter_payload.reproducibility.randomSeed if adapter_payload else 0)
    result = solve(request, random_seed=random_seed, adapter_payload=adapter_payload)
    print(json.dumps(result.model_dump(mode="json"), ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
