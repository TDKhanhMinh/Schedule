import json
import sys

from .contracts import SolveJobRequest
from .solver import solve


def main() -> None:
    payload = json.load(sys.stdin)
    request = SolveJobRequest.model_validate(payload)
    result = solve(request)
    print(result.model_dump_json())


if __name__ == "__main__":
    main()

