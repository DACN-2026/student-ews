export interface FeePolicyItem {
  id: string;
  studentId: string;
  feeObjectDicId: string;
  policyName: string;
  coefficientPercent: number;
  decisionNumber: string | null;
  yearStudy: string | null;
  termId: string | null;
  createdAt: string;
}

export interface FeePolicyType { feeObjectDicId: string; feeObjectDicName: string; isActive: boolean }
