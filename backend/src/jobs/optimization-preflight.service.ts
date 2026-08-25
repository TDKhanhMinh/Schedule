import { Injectable } from "@nestjs/common";
import { runPreSolveChecks, type PreSolveReport, type SolveJobRequest } from "../contracts";

@Injectable()
export class OptimizationPreflightService {
  check(payload: SolveJobRequest): PreSolveReport {
    return runPreSolveChecks(payload);
  }
}
