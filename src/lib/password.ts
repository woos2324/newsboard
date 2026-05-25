export type PasswordRequirement = {
  label: string;
  met: boolean;
};

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: "8자 이상", met: password.length >= 8 },
    { label: "대문자", met: /[A-Z]/.test(password) },
    { label: "소문자", met: /[a-z]/.test(password) },
    { label: "숫자", met: /\d/.test(password) },
    { label: "특수문자", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function getMissingPasswordRequirements(password: string): string[] {
  return getPasswordRequirements(password)
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.label);
}

export function getPasswordRequirementMessage(password: string): string {
  if (!password) return "8자 이상, 대소문자 + 숫자 + 특수문자 포함";

  const missing = getMissingPasswordRequirements(password);
  if (missing.length === 0) return "비밀번호 조건을 모두 충족했습니다.";

  return `누락: ${missing.join(", ")}`;
}

export function isValidSignupPassword(password: string): boolean {
  return getMissingPasswordRequirements(password).length === 0;
}
